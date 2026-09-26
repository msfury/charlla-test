import { NextResponse } from "next/server"

/*
 * 콜러스 S링크(iframe 주소)를 SR링크로 바꿔 "서버에서" 호출한다. 브라우저가 v.kr.kollus.com / file.kollus.com 에 연결하지 않게 하려는 것이다.
 * (내부망에서 브라우저가 v.kr 의 HTTP/2 연결에 CDN 요청을 실어 404 가 나는 문제 회피. charlla-test 저장소 charlla-react/kollus-player/README.md 참고)
 * 콜러스 공식 문서: https://docs.kollus.com/dev-guide/vod/player/invoke-player/ (SR링크: /s 대신 /sr, 파라미터 동일)
 *
 * POST { playUrl: "https://v.kr.kollus.com/s?jwt=...&custom_key=..." }
 *   - 영상: SR 이 CDN 주소로 302 → 200 { streamUrl: CDN 주소 }. 브라우저는 CDN 에서 바로 받는다
 *   - 오디오 등: SR 이 302 없이 파일을 200 으로 바로 준다 → 200 { streamUrl: "/api/player/kollus-stream-url?playUrl=..." }
 *     브라우저는 아래 GET 으로 우리 서버에서 받는다 (우리 서버가 v.kr 에서 받아 흘려 준다)
 *   - 실패: 400 { message } | 502 { message, status?, location?, detail? }
 * GET ?playUrl=S링크
 *   - SR 파일을 서버에서 받아 그대로 흘려 준다. Range 를 넘겨 탐색도 된다. SR 이 CDN 으로 보내면 브라우저를 CDN 으로 302 한다
 */

const KOLLUS_HOST = "v.kr.kollus.com"
// 브라우저에 넘겨도 되는 CDN 호스트 (HTTP/1.1 전용이라 연결이 섞이지 않는다)
const CDN_HOST = /\.(lcdn|ucdn)\.kollus\.com$/
const MAX_REDIRECTS = 5
const CONNECT_TIMEOUT = 10000
// GET 으로 흘려 줄 때 넘기는 응답 헤더
const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"]

// 기본 포트(443)의 https 주소이고 계정 정보가 없는지
const isPlainHttps = (u: URL) => u.protocol === "https:" && u.port === "" && !u.username && !u.password

// 콜러스 S링크면 SR 주소로 바꿔 준다 (경로만 /s → /sr, 쿼리는 그대로). 아니면 null
const toSrUrl = (raw: unknown): URL | null => {
  let u: URL
  try {
    u = new URL(String(raw ?? ""))
  } catch {
    return null
  }
  if (!isPlainHttps(u) || u.hostname !== KOLLUS_HOST || u.pathname !== "/s" || !u.searchParams.get("jwt")) return null
  u.pathname = "/sr"
  return u
}

// 응답이 파일(영상·오디오)인지. 오류 페이지는 보통 html / json 이다
const isMedia = (res: Response) => {
  const type = (res.headers.get("content-type") ?? "").toLowerCase()
  return !(type.startsWith("text/") || type.includes("json") || type.includes("xml"))
}

// 본문 앞부분만 읽고 나머지는 버린다 (오류 안내용)
const readHead = async (res: Response, max = 300) => {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const { value } = await reader.read().catch(() => ({ value: undefined }))
  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(value?.slice(0, max) ?? new Uint8Array())
}

type Resolved = { cdn: string } | { res: Response } | { error: string; location?: string }

// SR 을 부르고 콜러스 도메인 안에서 리다이렉트를 따라간다. CDN 이 나오면 그 주소, 파일이나 오류면 마지막 응답
// 연결 제한시간은 응답 헤더를 받을 때까지만 둔다 (GET 으로 파일을 흘려 줄 때 끊기지 않게)
const resolve = async (start: URL, headers: Record<string, string>, signal?: AbortSignal): Promise<Resolved> => {
  let url = start
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), CONNECT_TIMEOUT)
    signal?.addEventListener("abort", () => ac.abort(), { once: true })
    const res = await fetch(url, { redirect: "manual", cache: "no-store", headers, signal: ac.signal }).finally(() => clearTimeout(timer))
    const location = res.headers.get("location")
    if (res.status < 300 || res.status >= 400 || !location) return { res }
    await res.body?.cancel().catch(() => undefined)
    const next = new URL(location, url)
    if (!isPlainHttps(next) || !next.hostname.endsWith(".kollus.com")) return { error: "예상하지 못한 리다이렉트 주소입니다.", location: next.origin + next.pathname }
    if (CDN_HOST.test(next.hostname)) return { cdn: next.toString() }
    url = next
  }
  return { error: "리다이렉트가 너무 많습니다.", location: url.origin + url.pathname }
}

const failDetail = (e: unknown) => {
  const err = e as Error & { cause?: { code?: string; message?: string } }
  return [err.message, err.cause?.code, err.cause?.message].filter(Boolean).join(" / ")
}

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = ((await req.json()) as { playUrl?: unknown }).playUrl
  } catch {
    return NextResponse.json({ message: "playUrl 이 올바르지 않습니다." }, { status: 400 })
  }
  const sr = toSrUrl(raw)
  if (!sr) return NextResponse.json({ message: "콜러스 S링크(https://v.kr.kollus.com/s?jwt=...)만 받습니다." }, { status: 400 })

  // 콜러스가 재생 환경에 맞는 화질을 고르도록 브라우저 UA 를 그대로 넘긴다
  const ua = req.headers.get("user-agent")
  try {
    const r = await resolve(sr, ua ? { "user-agent": ua } : {})
    if ("cdn" in r) return NextResponse.json({ streamUrl: r.cdn })
    if ("error" in r) return NextResponse.json({ message: r.error, location: r.location }, { status: 502 })
    // 302 없이 파일을 바로 주는 경우 (오디오 등): 우리 서버(GET)가 대신 받아 흘려 준다
    if (r.res.ok && isMedia(r.res)) {
      await r.res.body?.cancel().catch(() => undefined)
      return NextResponse.json({ streamUrl: `/api/player/kollus-stream-url?playUrl=${encodeURIComponent(String(raw))}` })
    }
    const detail = await readHead(r.res)
    return NextResponse.json({ message: "SR링크가 스트림 주소를 주지 않았습니다.", status: r.res.status, detail }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ message: "SR링크 호출 실패", detail: failDetail(e) }, { status: 502 })
  }
}

export async function GET(req: Request) {
  const sr = toSrUrl(new URL(req.url).searchParams.get("playUrl"))
  if (!sr) return NextResponse.json({ message: "콜러스 S링크(https://v.kr.kollus.com/s?jwt=...)만 받습니다." }, { status: 400 })

  const headers: Record<string, string> = {}
  const ua = req.headers.get("user-agent")
  const range = req.headers.get("range")
  if (ua) headers["user-agent"] = ua
  if (range) headers.range = range // 브라우저가 탐색할 때 보내는 구간 요청
  try {
    const r = await resolve(sr, headers, req.signal)
    if ("cdn" in r) return NextResponse.redirect(r.cdn, 302)
    if ("error" in r) return NextResponse.json({ message: r.error, location: r.location }, { status: 502 })
    const out = new Headers({ "cache-control": "no-store" })
    for (const name of PASS_HEADERS) {
      const value = r.res.headers.get(name)
      if (value) out.set(name, value)
    }
    // fetch 가 압축을 풀었으면 길이가 달라지므로 넘기지 않는다
    if (r.res.headers.get("content-encoding")) out.delete("content-length")
    return new Response(r.res.body, { status: r.res.status, headers: out })
  } catch (e) {
    return NextResponse.json({ message: "SR링크 호출 실패", detail: failDetail(e) }, { status: 502 })
  }
}
