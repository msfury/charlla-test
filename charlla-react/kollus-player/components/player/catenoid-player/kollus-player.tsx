"use client"

import React, { ForwardedRef, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { postCatenoidPlayUrl } from "@/services/player/player-service"
import { CatenoidPlayUrlReq } from "@/type/player/player-type"

/*
 * 2026-09-27 변경: 콜러스 iframe + VG Controller 대신 <video> 로 직접 재생한다 (아래 KollusDirectPlayer).
 * 내부망에서 브라우저가 v.kr / file.kollus.com 의 HTTP/2 연결에 CDN 요청을 실어 404 가 나는 문제 때문이다 (charlla-test 저장소 charlla-react/kollus-player/README.md).
 *
 * 필요한 파일: 이 파일 + app/api/player/kollus-stream-url/route.ts (콜러스 SR링크를 서버에서 불러 CDN 주소만 돌려준다)
 * 브라우저는 CDN(*.lcdn / *.ucdn.kollus.com, HTTP/1.1)에만 연결하고, v.kr / file.kollus.com 에는 연결하지 않는다.
 * m3u8(HLS)은 Edge/Chrome 145 이상이 hls.js 없이 재생한다. mp4 는 어느 브라우저나 재생한다.
 * 오디오(mp3, m4a, 소리만 있는 HLS)도 재생하고, 콜러스처럼 남색 바탕에 음표를 보여 준다.
 *
 * props, ref(getProgress / play / pause), 콜백 규칙은 예전과 같다. 부르는 쪽(content-video.tsx)은 고치지 않는다.
 *  - 10% 구간을 넘을 때마다 onVideoProgress(10의 배수, 위치, 길이), 끝나면 onVideoEnd(100, 위치)
 *  - onPlayerReady 는 영상마다 한 번, onVideoPlay / onVideoPause 는 재생 상태가 실제로 바뀔 때만
 *  - onVideoError 는 복구할 수 없을 때만 (재시도로 복구되는 오류, 자동재생 차단, 전체화면 실패는 알리지 않는다)
 * 콜러스 설정은 callUrl 에서 읽는다:
 *  - JWT 의 seek / seekable_end / disable_playrate (없으면 props 의 isSeekable / seekableEnd)
 *  - 쿼리의 t 또는 s(초) = 이어보기. 콜러스처럼 처음·끝 10초 안이면 처음부터. 이어보기 팝업은 없다
 * 버튼: 재생/일시정지, 정지, 10초 뒤로/앞으로, 재생바(탐색 바), 구간반복, 배속, 음소거, 볼륨, 전체화면, 가운데 큰 재생 버튼.
 *  재생바 / 배속 / 구간반복은 옵션으로 켜고 끈다. 재생바를 끄면 10초 뒤로/앞으로 버튼과 ←/→ 키도 함께 없어진다 (아래 DEFAULT_OPTIONS, 화면마다 options prop 으로 덮어쓰기).
 *  키보드: 스페이스(재생/일시정지), ←/→(10초), M(음소거), F(전체화면). 화질 메뉴는 없다 (브라우저가 자동으로 고른다)
 * 탐색 제한: seek=false 면 0 ~ max(seekable_end, 이미 본 위치) 안에서만 이동. seekable_end 가 없으면 이동 불가.
 *  마우스 오른쪽 메뉴(컨트롤 표시, 다운로드)를 막고, 어떤 경로로 옮겨도 제한을 넘으면 되돌린다.
 * 워터마크는 띄우지 않는다.
 * 재생 오류가 나면 주소를 새로 받아 멈춘 위치부터 이어서 재생한다 (서명 만료, 브라우저 HLS 오류 대비). 연속 3번까지.
 * VG Controller 스크립트(/js/vg-controller-client.latest.min.js)는 더 이상 쓰지 않는다.
 */

/**
 * 플레이어 진행 상태 인터페이스
 * @property percent - 재생 진행률 (0-100)
 * @property position - 현재 재생 위치 (초)
 * @property duration - 전체 재생 시간 (초)
 */
export interface PlayerProgress {
  percent: number
  position: number
  duration: number
}

/**
 * 플레이어 화면 옵션 (보였다 안 보였다)
 * @property seekBar - 재생바(탐색 바). 끄면 10초 뒤로/앞으로 버튼과 ←/→ 키도 없어진다
 * @property playbackRate - 배속 메뉴. 콜러스 JWT 의 disable_playrate 가 true 면 켜도 숨긴다
 * @property repeat - 구간반복 버튼
 */
export interface KollusPlayerOptions {
  seekBar?: boolean
  playbackRate?: boolean
  repeat?: boolean
}

/**
 * Kollus 플레이어 속성 인터페이스
 * @property mckey - 비디오 고유 식별자
 * @property isSeekable - 시간 이동 가능 여부 (기본값: true). callUrl JWT 에 seek 가 있으면 그 값을 쓴다
 * @property seekableEnd - 탐색 가능한 최대 시간 (초). callUrl JWT 에 seekable_end 가 있으면 그 값을 쓴다
 * @property videoClip - 비디오 클립 정보
 * @property scrollEvent - 스크롤 이벤트 활성화 여부 (기본값: false)
 * @property disableNscreen - N스크린 기능 비활성화 여부
 * @property autoPlay - 자동 재생 여부 (기본값: false)
 * @property controlbar - 컨트롤바 표시 여부 (기본값: false). 지금은 항상 표시한다
 * @property isPIP - PIP(Picture in Picture) 모드 활성화 여부 (기본값: false)
 */
interface KollusPlayerProps {
  mckey: string
  isSeekable?: boolean
  seekableEnd?: string
  videoClip?: string
  scrollEvent?: boolean
  disableNscreen?: boolean
  autoPlay?: boolean
  controlbar?: boolean
  isPIP?: boolean
  onPlayerReady?: () => void
  onVideoPlay?: () => void
  onVideoEnd?: (percent: number, position: number) => void
  onVideoPause?: () => void
  onVideoError?: (error_code: number) => void
  onVideoProgress: (percent: number, position: number, duration: number) => void
  /** 화면 옵션. 안 주면 DEFAULT_OPTIONS */
  options?: KollusPlayerOptions
}

/**
 * 플레이어 제어를 위한 ref 인터페이스
 * @property getProgress - 현재 재생 진행 상태 반환 함수
 * @property play - 재생 시작 함수 (특정 시점부터 재생 가능)
 * @property pause - 재생 일시 정지 함수
 */
type KollusPlayerRef = {
  getProgress: () => PlayerProgress | null
  play: (jumpStep?: number) => void
  pause: () => void
}

/* ───────────── <video> 직접 재생 플레이어 ───────────── */

export interface KollusDirectPlayerProps {
  /** catenoid-play-url 이 준 콜러스 S링크 (https://v.kr.kollus.com/s?jwt=...) */
  playUrl?: string
  /** 스트림 주소를 이미 알면 직접 넘긴다 (테스트용). 있으면 playUrl 은 쓰지 않는다 */
  streamUrl?: string
  /** 이어보기 시작 위치(초). 처음·끝 10초 안이면 처음부터 */
  startTime?: number
  poster?: string
  /** 오디오일 때 보여 줄 그림 (public/ 경로). 없으면 poster, 그것도 없으면 음표 */
  audioImage?: string
  /** 재생바(탐색 바). 기본 true */
  seekBar?: boolean
  /** 구간반복 버튼. 기본 false */
  repeat?: boolean
  autoPlay?: boolean
  /** 음소거로 시작 */
  startMuted?: boolean
  /** 탐색 가능 여부 (콜러스 JWT seek). 기본 true */
  seekable?: boolean
  /** seekable=false 일 때 0 ~ 이 초(와 이미 본 위치)까지 이동 가능 (콜러스 JWT seekable_end). 음수면 이동 불가 */
  seekableEnd?: number
  /** 배속 메뉴 (콜러스 JWT disable_playrate 의 반대). 기본 true */
  allowPlaybackRate?: boolean
  /** PIP 허용 (isPIP). 기본 false */
  allowPip?: boolean
  onReady?: (duration: number) => void
  /** 재생 중 정수 percent 가 바뀔 때. 0~99 (100 은 끝났을 때만) */
  onProgress?: (percent: number, position: number, duration: number) => void
  onPlay?: (position: number, duration: number) => void
  /** 일시정지·정지 때. 정지는 처음으로 돌아가기 전 위치를 준다 */
  onPause?: (position: number, duration: number) => void
  onDone?: () => void
  /** 복구할 수 없는 오류. code: <video> MediaError 코드(1~4), 그 밖은 0 */
  onError?: (message: string, code: number) => void
}

export interface KollusDirectPlayerHandle {
  getProgress: () => PlayerProgress | null
  /** jumpStep(초)이 있으면 그 위치로 옮겨서 재생 */
  play: (jumpStep?: number) => void
  pause: () => void
}

type Callbacks = Pick<KollusDirectPlayerProps, "onReady" | "onProgress" | "onPlay" | "onPause" | "onDone" | "onError">
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

const HLS_MIME = "application/vnd.apple.mpegurl"
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i
const MAX_RETRY = 3
const JUMP_SEC = 10
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const AUDIO_BG = "#2b303b"

// Material Icons 경로 (24x24)
const ICON = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  stop: "M6 6h12v12H6z",
  rewind: "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z",
  forward: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z",
  volume: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z",
  muted: "M3 9v6h4l5 5V4L7 9H3zm13.59 3L14 9.41 15.41 8 18 10.59 20.59 8 22 9.41 19.41 12 22 14.59 20.59 16 18 13.41 15.41 16 14 14.59z",
  fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  exitFullscreen: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
}

const fmt = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s).padStart(2, "0")}`
}

// 사이트 전역 CSS 가 button 모양을 바꿔도 플레이어 버튼은 그대로 보이게 하는 기본값
const BUTTON_RESET: React.CSSProperties = {
  margin: 0,
  minWidth: 0,
  minHeight: 0,
  width: "auto",
  height: "auto",
  lineHeight: 1,
  boxShadow: "none",
  textTransform: "none",
  letterSpacing: "normal",
  fontFamily: "inherit",
  appearance: "none",
  background: "none",
  border: 0,
  cursor: "pointer",
}

function CtrlButton({ label, icon, onClick, pressed, badge }: { label: string; icon: string; onClick: () => void; pressed?: boolean; badge?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{ ...BUTTON_RESET, display: "flex", flex: "none", alignItems: "center", padding: 5, color: badge ? "#7cc4ff" : "#fff", fontSize: 11, fontWeight: 700 }}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
        <path d={icon} />
      </svg>
      {badge}
    </button>
  )
}

// 배속: 버튼을 누르면 위로 목록이 열린다. <select> 는 사이트 CSS 영향을 받아 모양이 깨져서 직접 그린다
function RateMenu({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  // 목록 밖을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => boxRef.current?.contains(e.target as Node) || setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  return (
    <div ref={boxRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-label="배속"
        title="배속"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...BUTTON_RESET, minWidth: 42, padding: "3px 6px", color: "#fff", border: "1px solid rgba(255,255,255,.45)", borderRadius: 4, fontSize: 12, fontWeight: 700 }}
      >
        {rate}x
      </button>
      {open && (
        <ul role="menu" aria-label="배속 선택" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 3, margin: 0, padding: 4, listStyle: "none", background: "rgba(20,24,32,.95)", borderRadius: 6, boxShadow: "0 2px 8px rgba(0,0,0,.5)" }}>
          {RATES.map((r) => (
            <li key={r} role="none" style={{ margin: 0, padding: 0, listStyle: "none" }}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={r === rate}
                onClick={() => {
                  onChange(r)
                  setOpen(false)
                }}
                style={{ ...BUTTON_RESET, display: "block", width: "100%", padding: "5px 14px", color: r === rate ? "#3ea6ff" : "#fff", fontSize: 12, fontWeight: r === rate ? 700 : 400, textAlign: "center", whiteSpace: "nowrap" }}
              >
                {r}x
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// 재생바·음량바. 막대는 직접 그리고, 실제 <input type="range"> 는 투명하게 위에 겹친다.
// 사이트 전역 CSS 가 range 모양을 지워도(막대 안 보임) 항상 보이게 하려는 것이다. 마우스·터치·키보드는 input 이 그대로 받는다
function Slider({ label, value, max, step, disabled, onChange, width }: { label: string; value: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void; width?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flex: width ? "none" : 1, width, minWidth: 40, height: 18, opacity: disabled ? 0.5 : 1 }}>
      <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "rgba(255,255,255,.35)" }} />
      <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 4, borderRadius: 2, background: "#3ea6ff" }} />
      <div style={{ position: "absolute", left: `calc(${pct}% - 6px)`, width: 12, height: 12, borderRadius: "50%", background: "#fff", boxShadow: "0 0 2px rgba(0,0,0,.6)" }} />
      <input
        type="range"
        aria-label={label}
        min={0}
        max={max}
        step={step}
        value={Math.min(value, max)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, padding: 0, opacity: 0, cursor: disabled ? "default" : "pointer" }}
      />
    </div>
  )
}

// 오디오 화면의 음표 (빔으로 이은 8분음표 두 개)
function MusicNotes() {
  return (
    <svg viewBox="0 0 64 64" width="38%" height="38%" fill="#f2f2f2" aria-hidden="true" style={{ maxWidth: 220, maxHeight: 220 }}>
      <path d="M22 14 52 8v7L22 21z" />
      <rect x="22" y="14" width="4" height="32" />
      <rect x="48" y="8" width="4" height="32" />
      <ellipse cx="17" cy="46" rx="9" ry="6.5" transform="rotate(-20 17 46)" />
      <ellipse cx="43" cy="40" rx="9" ry="6.5" transform="rotate(-20 43 40)" />
    </svg>
  )
}

export const KollusDirectPlayer = forwardRef<KollusDirectPlayerHandle, KollusDirectPlayerProps>(function KollusDirectPlayer(props, ref) {
  const {
    playUrl,
    streamUrl: givenStreamUrl,
    startTime = 0,
    poster,
    audioImage,
    autoPlay = false,
    startMuted = false,
    seekable = true,
    seekableEnd = -1,
    allowPlaybackRate = true,
    allowPip = false,
    seekBar = true,
    repeat = false,
  } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cbRef = useRef<Callbacks>(props)
  cbRef.current = props

  // 재생 흐름 상태 (화면과 무관해서 ref)
  const lastPercent = useRef(-1)
  const retryCount = useRef(0) // 연속 재시도 횟수. 30초 이상 정상 재생되면 0 으로
  const retryAt = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const readyFired = useRef(false) // onReady 는 한 번
  const reportedPlaying = useRef(false) // 부모에게 알린 재생 상태 (onPlay / onPause 중복 방지)
  const resumeAt = useRef<number | null>(null) // 재시도·play(jumpStep) 때 옮길 위치
  const pendingPlay = useRef(false) // 영상 준비 전에 play() 가 불렸으면 준비되자마자 재생
  const resumePlaying = useRef(false) // 재시도 전에 재생 중이었으면 재시도 뒤에도 재생
  const stoppingAt = useRef<number | null>(null)
  const playToken = useRef(0) // pause 가 불리면 늘려서, 기다리던 재생을 취소한다
  const internalSeek = useRef(false) // 이어보기·정지 등 내부 이동은 탐색 제한을 건너뛴다
  const lastPos = useRef(0) // 마지막으로 확인한 정상 위치
  const maxWatched = useRef(0) // 재생으로 도달한 가장 먼 위치
  const lastKnown = useRef<PlayerProgress | null>(null)

  const [attempt, setAttempt] = useState(0)
  const [resolved, setResolved] = useState<{ key: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(startMuted)
  const [volume, setVolume] = useState(1)
  const [rate, setRate] = useState(1)
  const [fullscreen, setFullscreen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: 0 })
  const [noVideoTrack, setNoVideoTrack] = useState(false)
  const [loop, setLoop] = useState<{ a: number | null; b: number | null }>({ a: null, b: null }) // 구간반복 시작점·끝점

  const key = `${givenStreamUrl ?? playUrl ?? ""}#${attempt}`
  const streamUrl = givenStreamUrl ?? (resolved?.key === key ? resolved.url : null)
  const path = streamUrl ? new URL(streamUrl, "http://localhost").pathname : ""
  const audioOnly = AUDIO_EXT.test(path) || noVideoTrack
  const canPlayHls = useMemo(() => typeof document === "undefined" || document.createElement("video").canPlayType(HLS_MIME) !== "", [])
  const hlsBlocked = path.endsWith(".m3u8") && !canPlayHls

  // 복구할 수 없는 오류: 화면에 보이고 부모에게 한 번 알린다
  const fail = useCallback((message: string, code: number) => {
    setError(message)
    setFatal((was) => {
      if (!was) cbRef.current.onError?.(message, code)
      return true
    })
  }, [])

  // 소리 켠 채로 재생을 시도하고, 자동재생 정책에 막히면 음소거로 다시 시도한다. 그래도 막히면 재생 버튼을 보여 주고 기다린다
  const tryPlay = () => {
    const v = videoRef.current
    if (!v) return
    v.play().catch((e: Error) => {
      if (videoRef.current !== v || v.error || e.name === "AbortError") return // 영상이 바뀌었거나, 오류 처리(재시도)가 맡는다
      if (e.name === "NotAllowedError" && !v.muted) {
        v.muted = true
        v.play().catch((e2: Error) => {
          if (videoRef.current === v && !v.error && e2.name !== "AbortError") setPlaying(false)
        })
        return
      }
      if (e.name !== "NotAllowedError") setError(`재생하지 못했습니다: ${e.message}`)
    })
  }

  // 방금 위치를 옮겼으면 옮긴 뒤에 재생한다 (탐색 중에 play() 하면 브라우저가 취소할 수 있다)
  const playAfterSeek = () => {
    const v = videoRef.current
    if (!v) return
    const token = ++playToken.current
    if (!v.seeking) return tryPlay()
    v.addEventListener("seeked", () => playToken.current === token && videoRef.current === v && tryPlay(), { once: true })
  }

  const cancelPendingPlay = () => {
    playToken.current += 1
    pendingPlay.current = false
  }

  // 내부 이동 (이어보기, play(jumpStep), 재시도, 정지): 탐색 제한을 건너뛰고, 본 위치로 친다
  const internalSeekTo = (v: HTMLVideoElement, t: number) => {
    internalSeek.current = true
    v.currentTime = t
    lastPos.current = t
    maxWatched.current = Math.max(maxWatched.current, t)
  }

  // 사용자가 옮길 수 있는 끝 (초). null 이면 이동 불가
  const userSeekMax = () => (seekable ? Infinity : seekableEnd < 0 ? null : Math.max(seekableEnd, maxWatched.current))

  const seekTo = (value: number) => {
    const v = videoRef.current
    const max = userSeekMax()
    if (!v || max === null || !Number.isFinite(value)) return
    v.currentTime = Math.max(0, Math.min(value, max, v.duration || value))
  }

  useImperativeHandle(ref, () => ({
    getProgress: () => {
      const v = videoRef.current
      if (v && v.duration) return { percent: Math.floor((v.currentTime / v.duration) * 100), position: v.currentTime, duration: v.duration }
      return lastKnown.current
    },
    play: (jumpStep?: number) => {
      const v = videoRef.current
      if (!v || v.readyState < 1) {
        if (jumpStep !== undefined) resumeAt.current = jumpStep
        pendingPlay.current = true
        return
      }
      if (jumpStep !== undefined) internalSeekTo(v, jumpStep)
      playAfterSeek()
    },
    pause: () => {
      cancelPendingPlay()
      videoRef.current?.pause()
    },
  }))

  // S링크 → 서버에서 SR 호출 → CDN 스트림 주소. 일시적인 실패(네트워크, 5xx)는 1초 뒤 다시 시도
  useEffect(() => {
    if (givenStreamUrl || !playUrl) return
    const ac = new AbortController()
    fetch("/api/player/kollus-stream-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playUrl }),
      signal: ac.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { streamUrl?: string; message?: string; status?: number; detail?: string }
        if (res.ok && data.streamUrl) {
          setResolved({ key: `${playUrl}#${attempt}`, url: data.streamUrl })
          return
        }
        const message = [data.message, data.status, data.detail].filter(Boolean).join(" / ") || `HTTP ${res.status}`
        throw Object.assign(new Error(message), { transient: res.status >= 500 && !(data.status && data.status < 500) })
      })
      .catch((e: Error & { transient?: boolean }) => {
        if (ac.signal.aborted) return
        if ((e.transient ?? e.name === "TypeError") && retryCount.current < MAX_RETRY) {
          retryCount.current += 1
          retryTimer.current = setTimeout(() => setAttempt((n) => n + 1), 1000)
          return
        }
        fail(`스트림 주소를 받지 못했습니다: ${e.message}`, 0)
      })
    return () => {
      ac.abort()
      clearTimeout(retryTimer.current)
    }
  }, [playUrl, givenStreamUrl, attempt, fail])

  // HLS 를 바로 재생하지 못하는 브라우저 (Edge/Chrome 145 미만): <video> 를 만들지 않고 한 번만 알린다
  useEffect(() => {
    if (hlsBlocked) fail("이 브라우저는 HLS(m3u8)를 바로 재생하지 못합니다. Edge 145 이상이 필요합니다.", 0)
  }, [hlsBlocked, fail])

  // 전체화면 상태 (Esc 로 나가도 맞춘다), 좁은 화면이면 볼륨 막대와 정지 버튼을 숨긴다
  useEffect(() => {
    const box = boxRef.current
    const sync = () => setFullscreen(!!box && document.fullscreenElement === box)
    document.addEventListener("fullscreenchange", sync)
    const ro = typeof ResizeObserver === "undefined" || !box ? null : new ResizeObserver(([e]) => setCompact(e.contentRect.width < 520))
    if (ro && box) ro.observe(box)
    return () => {
      document.removeEventListener("fullscreenchange", sync)
      ro?.disconnect()
    }
  }, [])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused || v.ended) {
      playToken.current += 1
      tryPlay()
    } else {
      cancelPendingPlay()
      v.pause()
    }
  }

  // 정지: 멈추고 처음으로. onPause 에는 멈춘 위치를 준다
  const stop = () => {
    const v = videoRef.current
    if (!v) return
    cancelPendingPlay()
    if (v.paused) return internalSeekTo(v, 0)
    stoppingAt.current = v.currentTime
    v.pause()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (v) v.muted = !v.muted
  }

  const changeVolume = (value: number) => {
    const v = videoRef.current
    if (!v) return
    v.volume = value
    v.muted = value === 0
  }

  const changeRate = (value: number) => {
    const v = videoRef.current
    if (v) v.playbackRate = value
    setRate(value)
  }

  // 구간반복: 첫 번째 누름 = 시작점, 두 번째 = 끝점(그 사이를 반복), 세 번째 = 해제
  const toggleRepeat = () => {
    const v = videoRef.current
    if (!v) return
    if (loop.a === null) setLoop({ a: v.currentTime, b: null })
    else if (loop.b === null && v.currentTime > loop.a + 0.5) setLoop({ a: loop.a, b: v.currentTime })
    else setLoop({ a: null, b: null })
  }

  const toggleFullscreen = () => {
    const box = boxRef.current
    if (!box) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
    } else if (box.requestFullscreen) {
      box.requestFullscreen().catch((e: Error) => console.warn("[KollusPlayer] 전체화면을 열지 못했습니다:", e.message))
    } else {
      // iOS Safari 는 div 전체화면이 없어 영상 전체화면으로 연다
      ;(videoRef.current as WebkitVideo | null)?.webkitEnterFullscreen?.()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget && e.target !== videoRef.current) return // 탐색 바·배속 메뉴는 자기 키를 쓴다
    const v = videoRef.current
    if (!v) return
    const actions: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      m: toggleMute,
      f: toggleFullscreen,
      // 재생바를 숨기면 키보드 ←/→ 이동도 막는다
      ...(seekBar && {
        ArrowLeft: () => seekTo(v.currentTime - JUMP_SEC),
        ArrowRight: () => seekTo(v.currentTime + JUMP_SEC),
      }),
    }
    const action = actions[e.key]
    if (!action) return
    e.preventDefault()
    action()
  }

  const onLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    const at = resumeAt.current
    resumeAt.current = null
    if (at !== null) internalSeekTo(v, at)
    else if (startTime >= 10 && startTime <= v.duration - 10) internalSeekTo(v, startTime) // 콜러스 규칙: 처음·끝 10초 안이면 처음부터
    // 재시도로 새 <video> 가 생겨도 소리·배속을 이어 간다
    v.muted = muted
    v.volume = volume
    v.playbackRate = rate
    setTime({ current: v.currentTime, duration: v.duration })
    // 영상 트랙이 없으면 오디오 (영상이면 이 시점에 가로·세로 크기가 있다. 늦게 오면 onResize 가 바로잡는다)
    if (v.videoWidth === 0 && v.videoHeight === 0) setNoVideoTrack(true)
    if (!readyFired.current) {
      readyFired.current = true
      cbRef.current.onReady?.(v.duration)
    }
    if ((autoPlay && attempt === 0) || resumePlaying.current || pendingPlay.current) {
      resumePlaying.current = false
      pendingPlay.current = false
      playAfterSeek()
    }
  }

  // 탐색 제한: 어떤 경로로 옮겨도 (탐색 바, 키보드, 브라우저 기본 컨트롤, iOS 전체화면) 제한을 넘으면 되돌린다
  const onSeeking = () => {
    const v = videoRef.current
    if (!v || seekable || internalSeek.current) return
    const max = userSeekMax()
    const back = max === null ? Math.abs(v.currentTime - lastPos.current) > 1 : v.currentTime > max + 0.5
    if (back) internalSeekTo(v, max === null ? lastPos.current : max)
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    setTime({ current: v.currentTime, duration: v.duration || 0 })
    if (!v.seeking) {
      lastPos.current = v.currentTime
      if (!v.paused) maxWatched.current = Math.max(maxWatched.current, v.currentTime)
    }
    if (loop.a !== null && loop.b !== null && !v.seeking && v.currentTime >= loop.b) internalSeekTo(v, loop.a)
    if (!v.duration) return
    lastKnown.current = { percent: Math.floor((v.currentTime / v.duration) * 100), position: v.currentTime, duration: v.duration }
    if (retryCount.current > 0 && v.currentTime - retryAt.current > 30) retryCount.current = 0
    if (v.paused) return
    const pct = Math.min(99, Math.floor((v.currentTime / v.duration) * 100))
    if (pct === lastPercent.current) return
    lastPercent.current = pct
    cbRef.current.onProgress?.(pct, v.currentTime, v.duration)
  }

  const onPlay = () => {
    const v = videoRef.current
    setPlaying(true)
    if (v && !reportedPlaying.current) {
      reportedPlaying.current = true
      cbRef.current.onPlay?.(v.currentTime, v.duration)
    }
  }

  const onPause = () => {
    const v = videoRef.current
    setPlaying(false)
    if (!v || v.ended) return // 끝났을 때는 onEnded 가 처리한다
    const at = stoppingAt.current ?? v.currentTime
    if (reportedPlaying.current) {
      reportedPlaying.current = false
      cbRef.current.onPause?.(at, v.duration)
    }
    if (stoppingAt.current !== null) {
      stoppingAt.current = null
      internalSeekTo(v, 0)
    }
  }

  const onEnded = () => {
    const v = videoRef.current
    setPlaying(false)
    reportedPlaying.current = false
    if (!v) return
    lastPercent.current = 100
    cbRef.current.onProgress?.(100, v.duration, v.duration)
    cbRef.current.onDone?.()
  }

  const onVideoError = () => {
    const v = videoRef.current
    if (!v || fatal) return
    // 주소를 새로 받아 멈춘 위치부터 다시 재생한다 (연속 MAX_RETRY 번까지). 재생 중이었을 때만 이어서 재생
    if (playUrl && !givenStreamUrl && retryCount.current < MAX_RETRY) {
      const pos = v.readyState >= 1 && v.currentTime > 0 ? v.currentTime : resumeAt.current
      retryCount.current += 1
      retryAt.current = pos ?? 0
      resumeAt.current = pos
      resumePlaying.current = reportedPlaying.current || pendingPlay.current
      setAttempt((n) => n + 1)
      return
    }
    fail(`재생 오류 (code ${v.error?.code ?? "?"}) ${v.error?.message ?? ""}`.trim(), v.error?.code ?? 0)
  }

  const seekMax = userSeekMax()
  const cover = audioImage ?? poster

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#000", outline: "none" }}
    >
      <div style={{ position: "relative", flex: 1, minHeight: 0, background: audioOnly ? AUDIO_BG : "#000" }}>
        {streamUrl && !hlsBlocked && (
          <video
            key={key}
            ref={videoRef}
            src={streamUrl}
            poster={audioOnly ? undefined : poster}
            playsInline
            preload="metadata"
            disablePictureInPicture={!allowPip}
            style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "pointer" }}
            onClick={togglePlay}
            onLoadedMetadata={onLoadedMetadata}
            onSeeking={onSeeking}
            onSeeked={() => (internalSeek.current = false)}
            onTimeUpdate={onTimeUpdate}
            onDurationChange={() => setTime((t) => ({ ...t, duration: videoRef.current?.duration || 0 }))}
            onPlay={onPlay}
            onPlaying={() => !fatal && setError(null)}
            onPause={onPause}
            onEnded={onEnded}
            onVolumeChange={() => {
              setMuted(!!videoRef.current?.muted)
              setVolume(videoRef.current?.volume ?? 1)
            }}
            onRateChange={() => setRate(videoRef.current?.playbackRate ?? 1)}
            onResize={() => videoRef.current?.videoWidth && setNoVideoTrack(false)}
            onError={onVideoError}
          />
        )}
        {streamUrl && audioOnly && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              background: cover ? `${AUDIO_BG} center / contain no-repeat url("${cover}")` : AUDIO_BG,
            }}
          >
            {!cover && <MusicNotes />}
          </div>
        )}
        {streamUrl && !playing && !fatal && (
          <button
            type="button"
            aria-label="재생"
            onClick={togglePlay}
            style={{ ...BUTTON_RESET, position: "absolute", left: "50%", top: "50%", width: 64, height: 64, margin: "-32px 0 0 -32px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", background: "rgba(0,0,0,.35)", border: "3px solid #fff", borderRadius: "50%", cursor: "pointer" }}
          >
            <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
              <path d={ICON.play} />
            </svg>
          </button>
        )}
        {!streamUrl && !error && (
          <p style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: 0, color: "#ccc", fontSize: 13 }}>불러오는 중…</p>
        )}
        {error && (
          <p role="alert" style={{ position: "absolute", inset: "0 0 auto 0", margin: 0, padding: 8, color: "#fff", background: "rgba(0,0,0,.7)", fontSize: 12 }}>
            {error}
          </p>
        )}
      </div>
      <div style={{ display: seekBar ? "flex" : "none", padding: "4px 8px 0", background: "rgba(0,0,0,.85)" }}>
        <Slider label="재생 위치" value={time.current} max={time.duration || 0} step={0.1} disabled={seekMax === null} onChange={seekTo} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "0 6px 2px", color: "#fff", background: "rgba(0,0,0,.85)", fontSize: 12, whiteSpace: "nowrap" }}>
        <CtrlButton label={playing ? "일시정지" : "재생"} icon={playing ? ICON.pause : ICON.play} onClick={togglePlay} />
        {!compact && <CtrlButton label="정지" icon={ICON.stop} onClick={stop} />}
        {/* 재생바를 숨기면 10초 뒤로/앞으로도 숨긴다 */}
        {seekBar && seekMax !== null && <CtrlButton label={`${JUMP_SEC}초 뒤로`} icon={ICON.rewind} onClick={() => seekTo(time.current - JUMP_SEC)} />}
        {seekBar && seekMax !== null && <CtrlButton label={`${JUMP_SEC}초 앞으로`} icon={ICON.forward} onClick={() => seekTo(time.current + JUMP_SEC)} />}
        {repeat && (
          <CtrlButton
            label={loop.a === null ? "구간반복 시작점" : loop.b === null ? "구간반복 끝점" : "구간반복 해제"}
            icon={ICON.repeat}
            onClick={toggleRepeat}
            pressed={loop.a !== null}
            badge={loop.a === null ? undefined : loop.b === null ? "A" : "A-B"}
          />
        )}
        <span style={{ marginLeft: 4, overflow: "hidden", fontVariantNumeric: "tabular-nums" }}>
          {fmt(time.current)} / {fmt(time.duration)}
        </span>
        <span style={{ flex: 1 }} />
        {allowPlaybackRate && <RateMenu rate={rate} onChange={changeRate} />}
        <CtrlButton label={muted ? "음소거 해제" : "음소거"} icon={muted ? ICON.muted : ICON.volume} onClick={toggleMute} pressed={muted} />
        {!compact && (
          <Slider label="볼륨" value={muted ? 0 : volume} max={1} step={0.05} onChange={changeVolume} width={64} />
        )}
        <CtrlButton label={fullscreen ? "전체화면 종료" : "전체화면"} icon={fullscreen ? ICON.exitFullscreen : ICON.fullscreen} onClick={toggleFullscreen} pressed={fullscreen} />
      </div>
    </div>
  )
})

/* ───────────── 예전 KollusPlayer 와 같은 모양의 겉 컴포넌트 ───────────── */

// 오디오 콘텐츠일 때 보여 줄 그림. 콜러스 음표 그림 등을 public/ 에 넣고 경로를 적는다 (예: "/images/player/audio.png").
// 비워 두면 남색 바탕에 음표. file.kollus.com 주소를 직접 적지 않는다 (브라우저가 콜러스에 HTTP/2 로 붙어 다시 404 가 난다)
const AUDIO_IMAGE = ""

// 화면 옵션 기본값. 모든 콜러스 플레이어에 적용된다. 화면마다 바꾸려면 <KollusPlayer options={{ ... }} /> 로 덮어쓴다
const DEFAULT_OPTIONS: Required<KollusPlayerOptions> = {
  seekBar: true, // 재생바
  playbackRate: true, // 배속 (콜러스 JWT disable_playrate 가 true 면 숨김)
  repeat: true, // 구간반복
}

type KollusJwt = { mc?: { seek?: boolean; seekable_end?: number; disable_playrate?: boolean }[] }

// callUrl 에서 콜러스 설정을 읽는다 (JWT 는 서명 확인 없이 내용만 읽는다. 이미 브라우저에 있는 값이다)
const readCallUrl = (url: string | null) => {
  const empty = { start: 0, autoplay: false, mute: false, jwt: null as KollusJwt | null }
  if (!url) return empty
  try {
    const q = new URL(url).searchParams
    let jwt: KollusJwt | null = null
    const body = q.get("jwt")?.split(".")[1]
    if (body) {
      const b64 = body.replace(/-/g, "+").replace(/_/g, "/")
      const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
      jwt = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as KollusJwt
    }
    return { start: Number(q.get("t") ?? q.get("s")) || 0, autoplay: q.has("autoplay"), mute: q.has("mute"), jwt }
  } catch {
    return empty
  }
}

/**
 * Kollus 비디오 플레이어 컴포넌트
 * 콜러스 영상을 <video> 로 직접 재생한다 (KollusDirectPlayer)
 */
const KollusPlayer = (
  {
    mckey,
    isSeekable = true,
    seekableEnd,
    videoClip,
    scrollEvent = false,
    disableNscreen,
    autoPlay = false,
    controlbar = false,
    isPIP = false,
    onPlayerReady,
    onVideoPlay,
    onVideoEnd,
    onVideoPause,
    onVideoError,
    onVideoProgress,
    options,
  }: KollusPlayerProps,
  ref: ForwardedRef<KollusPlayerRef>,
) => {
  // 상태 관리
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const inner = useRef<KollusDirectPlayerHandle>(null)
  // 마지막으로 보낸 10% 구간 (같은 구간을 여러 번 보내지 않는다)
  const lastTenth = useRef<number | null>(null)

  // 외부에서 사용할 수 있는 메서드 설정. 예전처럼 항상 객체이고, 영상이 준비되기 전에는 null / 아무 일 없음
  useImperativeHandle(
    ref,
    () => ({
      getProgress: () => inner.current?.getProgress() ?? null,
      play: (jumpStep?: number) => inner.current?.play(jumpStep),
      pause: () => inner.current?.pause(),
    }),
    [],
  )

  /**
   * 비디오 URL 을 받아 온다 (예전과 같은 파라미터로 백엔드가 콜러스 재생 URL 을 만든다)
   */
  useEffect(() => {
    if (!mckey) return

    const fetchVideoUrl = async () => {
      try {
        const params: CatenoidPlayUrlReq = {
          p_mckey: mckey,
          p_isSeekable: isSeekable ? "true" : "false",
          p_seekable_end: seekableEnd ? seekableEnd : "0",
          p_video_clip: videoClip || "",
          p_scroll_event: scrollEvent ? "true" : "false",
          p_disable_nscreen: disableNscreen ? "true" : "false",
          p_auto_play: autoPlay ? "true" : "false",
          p_controlbar: controlbar ? "true" : "false",
          p_isPIP: isPIP ? "true" : "false",
        }

        const response = await postCatenoidPlayUrl(params)
        if (response.result.callUrl) {
          lastTenth.current = null
          setVideoUrl(response.result.callUrl)
        }
      } catch (error) {
        console.error("❌ 비디오 URL 가져오기 실패:", error)
      }
    }

    fetchVideoUrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 예전과 같이 mckey 가 바뀔 때만 다시 받는다
  }, [mckey])

  const opts = useMemo(() => readCallUrl(videoUrl), [videoUrl])
  const mc = opts.jwt?.mc?.[0]
  const ui = { ...DEFAULT_OPTIONS, ...options }
  const propSeekableEnd = seekableEnd !== undefined && seekableEnd !== "" && Number.isFinite(Number(seekableEnd)) ? Number(seekableEnd) : -1

  // 예전 VG Controller "progress" 처리와 같은 규칙. 10% 구간을 넘으면 그 구간 값(10의 배수)으로 보낸다
  const handleProgress = (percent: number, position: number, duration: number) => {
    if (position !== 0 && percent === 100 && onVideoEnd) {
      onVideoEnd(percent, position)
      return
    }
    const tenth = Math.floor(percent / 10) * 10
    if (tenth === lastTenth.current) return
    lastTenth.current = tenth
    onVideoProgress(tenth, position, duration)
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {videoUrl && (
        <KollusDirectPlayer
          key={videoUrl}
          ref={inner}
          playUrl={videoUrl}
          startTime={opts.start}
          autoPlay={autoPlay || opts.autoplay}
          startMuted={opts.mute}
          seekable={mc?.seek ?? isSeekable}
          seekableEnd={mc?.seekable_end ?? propSeekableEnd}
          allowPlaybackRate={ui.playbackRate && !mc?.disable_playrate}
          allowPip={isPIP}
          audioImage={AUDIO_IMAGE || undefined}
          seekBar={ui.seekBar}
          repeat={ui.repeat}
          onReady={() => onPlayerReady?.()}
          onPlay={() => onVideoPlay?.()}
          onPause={() => onVideoPause?.()}
          onError={(_message, code) => onVideoError?.(code)}
          onProgress={handleProgress}
        />
      )}
    </div>
  )
}

export default forwardRef<KollusPlayerRef, KollusPlayerProps>(KollusPlayer)
