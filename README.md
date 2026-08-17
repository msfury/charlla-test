# 찰나(Charlla) 연동 테스트 프로젝트

화면에서 영상을 올리고 찰나 플레이어로 재생·제어하는 것까지를 확인하는 프로젝트다.

**찰나 API를 아는 코드는 `charlla-api` 하나뿐이다.** JSP·React는 HTTP로 호출만 한다.
규칙이 아니라 구조로 강제한 것이니 `charlla-jsp`에 `charlla-api` 의존성을 걸지 말 것.

| 모듈 | 스택 | 포트 | 패키징 |
|---|---|---|---|
| `charlla-api` | Spring Boot 2.7.5 / Java 11 / WebClient | 8080 | jar |
| `charlla-jsp` | Spring Boot + JSP | 8081 | **war** |
| `charlla-react` | Next.js + TS (기존 프론트에 넣을 파일) | 3000 | — |

```
브라우저 ──▶ JSP(8081) ──┐
                          ├──▶ charlla-api(8080) ──▶ external-api.charlla.io
브라우저 ──▶ Next(3000) ──┘                          └▶ upload.kr.kollus.com (파일)

브라우저 ────────────────────────────────────────────▶ player.charlla.io (iframe)
```

**파일 바이트도 API를 경유한다.** 내부망에서 브라우저가 외부 업로드 서버로 직접 나가지 못할 수
있어서다. 다만 `Resource`로 흘려보내므로 파일이 메모리에 통째로 올라가지는 않는다.

---

## 1. 실행 (Windows)

### 1.1 사전 조건

| 항목 | 값 | 비고 |
|---|---|---|
| JDK | **11** | `gradle.properties`의 `org.gradle.java.home`이 JAVA_HOME보다 우선해 고정한다 |
| Gradle | **7.6.4** | 래퍼에 고정. Boot 2.7.5는 6.8/6.9/7.x만 지원한다. **IDE가 업그레이드를 권해도 따르지 말 것** |
| Node.js | React 화면을 볼 때만 | `charlla-react`는 Gradle 빌드에 포함되지 않는다(`settings.gradle`) |

Gradle은 따로 설치하지 않는다. `gradlew.bat`이 7.6.4를 받아 쓴다.

### 1.2 빌드

```cmd
cd /d D:\workspace\charlla-test

gradlew.bat build
```

### 1.3 모듈 실행

**`charlla-api`가 먼저 떠 있어야 나머지 두 화면이 동작한다.** `bootRun`은 포그라운드로 물리므로
터미널을 각각 열어 실행한다.

| 모듈 | 명령 | 주소 |
|---|---|---|
| `charlla-api` | `gradlew.bat :charlla-api:bootRun` | http://localhost:8080 |
| `charlla-jsp` | `gradlew.bat :charlla-jsp:bootRun` | http://localhost:8081 |
| `charlla-react` | `npm run dev` (이식한 Next.js 앱에서) | http://localhost:3000/charlla-test |

React는 파일을 기존 앱에 복사하는 방식이라 준비 단계가 따로 있다 → §2.

### 1.4 환경변수

전부 기본값이 있어 **설정하지 않아도 실행된다.** 바꿀 때만 지정한다.

| 변수 | 모듈 | 기본값 |
|---|---|---|
| `CHARLLA_API_KEY` | api | `application.yml`의 연동 테스트용 키 |
| `CHARLLA_BASE_URL` | api | `https://external-api.charlla.io` |
| `CHARLLA_PLAYER_URL` | api | `https://player.charlla.io` |
| `CHARLLA_API_BASE_URL` | jsp | `http://localhost:8080` |
| `CHARLLA_API_BASE` | react (rewrite) | `http://localhost:8080` |

```cmd
set CHARLLA_API_KEY=다른키
```

> **api 주소 변수는 모듈마다 이름이 다르다** — jsp는 `CHARLLA_API_BASE_URL`, react rewrite는
> `CHARLLA_API_BASE`. 8080을 옮기면 둘 다 바꿀 것.

### 1.5 연동 확인 — 첫 관문이다

```cmd
curl http://localhost:8080/api/account
```

`callbackUrl`이 돌아오면 인증·네트워크가 정상이다.
**`serviceName`으로 판정하지 말 것** — 실서버가 주지 않는 필드다(§4 참고).

---

## 2. 화면에서 업로드 → 재생

### JSP (8081)

실행은 §1.3. 8080이 떠 있는 상태에서 `gradlew.bat :charlla-jsp:bootRun`.

| 주소 | 화면 |
|---|---|
| `http://localhost:8081/` | 콘텐츠 목록 |
| `http://localhost:8081/upload` | **업로드** (제목 + 파일 선택) |
| `http://localhost:8081/player?key={contentDeployKey}` | 재생 + 제어 |

업로드 화면이 하는 일:

1. 브라우저에서 영상 길이를 먼저 재서 60초 초과를 걸러낸다
2. 파일을 8081로 보낸다 → 8081이 8080으로 → 8080이 찰나 업로드 서버로
3. 전송 진행률을 2초 간격으로 폴링한다
4. 인코딩이 끝나 콘텐츠로 잡히면 재생 링크가 나타난다

### React (3000)

`charlla-react/`는 **그 자체로 실행되는 앱이 아니다.** `package.json`도 `next.config.js`도 없는
파일 모음이고, Gradle 빌드에도 들어 있지 않다(`settings.gradle`). 기존 Next.js 앱에 복사해 넣는다.

호스트 앱이 갖추고 있어야 하는 것 — **없으면 화면이 스타일 없이 깨져 보인다:**

| 전제 | 쓰이는 곳 |
|---|---|
| **Tailwind CSS** | 두 컴포넌트의 레이아웃이 전부 유틸리티 클래스다. 없으면 클래스가 통째로 무시된다 |
| **shadcn/ui `Button`** (`@/components/ui/button`) | `size="sm"` / `variant="outline"` 를 쓴다 |
| shadcn 토큰 `--muted` / `--muted-foreground` | `text-muted-foreground`, `bg-muted` |
| `@/*` path alias → `src/` | 아래 표의 import 경로가 이 전제다 |

셋 다 shadcn/ui를 쓰는 프로젝트면 이미 있는 것들이다. **깨져 보이면 코드가 아니라 이쪽을 먼저 볼 것.**

| 파일 | 대상 위치 |
|---|---|
| `lib/charlla/types.ts` | `src/lib/charlla/types.ts` |
| `lib/charlla/bridge.ts` | `src/lib/charlla/bridge.ts` |
| `components/charlla/CharllaPlayer.tsx` | `src/components/charlla/CharllaPlayer.tsx` |
| `components/charlla/CharllaUploader.tsx` | `src/components/charlla/CharllaUploader.tsx` |
| `app/charlla-test/page.tsx` | `src/app/charlla-test/page.tsx` |
| `e2e/charlla-player.spec.ts` | `e2e/charlla-player.spec.ts` |

`next.config.js`에 rewrites를 합친다 (`next.config.charlla.js` 참고).

```javascript
async rewrites() {
  return [
    // ...기존 규칙
    {
      source: '/api/charlla/:path*',
      destination: `${process.env.CHARLLA_API_BASE ?? 'http://localhost:8080'}/api/:path*`,
    },
  ];
}
```

> **기존 rewrites와 경로가 겹치지 않는지 먼저 확인할 것.** `/api/charlla/`로 네임스페이스를 뗀 이유다.

```bash
npm run dev
# http://localhost:3000/charlla-test          → 업로드
# http://localhost:3000/charlla-test?key=...  → 재생
```

### 통합 테스트로 올리기

화면 대신 테스트로 올릴 수도 있다. 샘플 영상은 **프로젝트 루트의 `sample/`** 에 있다
(화면 업로드와 같은 파일을 쓴다):

```cmd
gradlew.bat :charlla-api:test -PincludeExternal --tests "*CharllaUploadIT" -i
```

콘솔 마지막에 `contentDeployKey`와 두 화면 URL이 찍힌다.
샘플 파일이 없으면 `Assumptions`로 조용히 건너뛰므로 "통과"로 착각하지 말 것.

---

## 3. 현재 상태

### 확인된 것

| 항목 | 결과 |
|---|---|
| `gradlew build` | 통과 (Java 11 데몬, 바이트코드 major 55) |
| `GET /api/account` | 200. `callbackUrl` 수신 |
| `GET /api/contents` | 200. 페이징 필드 정상 매핑 |
| 업로드 전송 | 성공. `{"error":0,"message":"Successfully uploaded."}` + 진행률 100% |
| JSP 화면(8081) | 목록·업로드 화면 정상 렌더 |
| React 화면(3000) | 정상 렌더. Next 14 앱에 이식해 확인 (전제는 §2) |
| Next rewrites 프록시 | 통과. `3000 /api/charlla/contents` → `8080` → 200 |

### 막혀 있는 것

**업로드는 성공하는데 콘텐츠가 생성되지 않는다.** (2026-08-18 재확인, 미해결)

확인된 사실만 적는다.

- 업로드 응답은 `{"error":0,"message":"Successfully uploaded."}`, 진행률도 100%까지 간다
- 그런데 `GET /contents`는 계속 `count: 0` 이다
- **찰나 웹 콘솔에서도 업로드된 파일이 보이지 않는다** → API 조회의 문제가 아니라 콘텐츠 자체가 안 만들어진 것
- 우리 코드로도, curl 직접 호출로도, 가로/세로 영상 모두 동일하게 재현된다 → 구현 문제가 아니다
- 최대 55분을 기다려도 나타나지 않았다
- 콜백도 **0건**이다. 계정에 등록된 `callbackUrl`이 `external-api.charlla.io/api/callback`
  (찰나 자기 자신)이라 우리 서버로 올 수가 없다

2026-08-18 재확인 — **화면 경로를 바꿔도 같다.**

- React 화면(3000)에서 `sample/sample-10s.mp4`(10초, 1.0MB)로 업로드했다.
  전송 100% + `uploadFileKey = 20260817-e13ab9d2d1df044c` 까지 정상이고 그 뒤가 없다.
  **JSP·통합테스트에 이어 React 경로에서도 동일** → 화면 구현과 무관하다는 근거가 하나 더 늘었다
- 업로드 직후 15초 간격 3분 폴링, 내내 `count: 0`
- `GET /api/account` 의 `callbackUrl` 이 `https://external-api.charlla.io/api/callback` 임을
  이번에도 실측 확인했다. 값이 바뀌지 않았다
- `uploadFileKey` 의 날짜 접두사가 `20260817` 로, 업로드 시각(로컬 08-18)과 하루 다르다.
  찰나 서버 타임존으로 보이며 조회 조건(start/end)을 걸 때 주의가 필요하다

그래서 `CharllaUploadIT` 의 3번(콘텐츠 조회)·4번(플레이어 URL)은 통과할 수 없고,
화면 업로드도 "인코딩 대기 중"에서 멈춘다. **찰나 담당자 확인이 필요하다.**

문의할 내용:

> 업로드는 `error:0` + 진행률 100%로 성공하는데 `GET /contents`가 계속 `count:0` 이고,
> 찰나 웹 콘솔에서도 파일이 보이지 않습니다.
> 계정의 callbackUrl 이 `external-api.charlla.io/api/callback` 으로 되어 있는데 정상 기본값인가요?
> 이 계정이 콘텐츠 등록/인코딩까지 활성화된 상태인지 확인 부탁드립니다.
> uploadFileKey: 20260814-c5c350490b86fd46 / 20260814-d9f04f1c3be3e379 / 20260814-955bd38278ba5f07
> / 20260817-e13ab9d2d1df044c (2026-08-18 업로드분)

### 다음에 할 일

- [ ] 위 문의 결과에 따라 업로드→콘텐츠 경로 재검증 (`CharllaUploadIT` 3·4번)
- [ ] 콘텐츠가 생기면 **단건 조회 응답 구조 확인** — swagger는 평면, 정의서는 `content` 래퍼.
      실측이 안 돼서 swagger 기준으로 두었다 (`CharllaService.getContent()` 주석)
- [ ] 삭제 응답 실측 (`status` 가 COMPLETED/FAILED 4종인지)
- [ ] `sort`/`order` 실제 정렬 동작 확인 (콘텐츠 2건 이상 필요)
- [ ] `open`/`share` 이벤트 payload 실측 — `url`/`target` 인지 `link` 인지 (`types.ts` 주석)
- [ ] 60초 초과 영상으로 `EXCESS_DURATION` 콜백 확인 (`sample/sample-70s.mp4` 필요)
- [ ] React 화면을 실제 Next.js 앱에 이식해 **재생** 확인
      — 이식·렌더·업로드까지는 2026-08-18 확인. 재생만 콘텐츠가 없어 미확인

---

## 4. API 스펙

**정본은 swagger다: https://external-api.charlla.io/api-docs**
정의서 PDF v0.2와 어긋나는 곳이 여러 군데다. 충돌하면 swagger와 실측을 따른다.

### 인증

```
Authorization: Basic base64(API_KEY + ":")
```

Spring에서는 `headers.setBasicAuth(apiKey, "")` 한 줄이면 정확히 이 값이 나온다.
직접 `Base64.getEncoder()`를 쓰지 말 것. **콜론을 빠뜨리면 실패한다.**

### 엔드포인트

| Method | Path | 비고 |
|---|---|---|
| GET | `/account` | **`callbackUrl`만 온다.** `serviceName`은 오지 않음 |
| PUT | `/account/callback` | body `{callbackUrl}` |
| POST | `/upload-url` | body `{title}` (1~255자) |
| POST | `{uploadUrl}` | multipart. 응답의 절대 URL 사용 |
| GET | `{progressUrl}` | 응답의 절대 URL 사용 |
| GET | `/contents` | keyword/start/end/page/perPage/**sort**/**order** |
| GET | `/contents/{contentDeployKey}` | |
| DELETE | `/contents/{contentDeployKey}` | |

### 정의서와 다른 지점 — 여기서 틀린다

| 항목 | 정의서 PDF | swagger / 실측 |
|---|---|---|
| `serviceName` | 필수 | **오지 않는다.** required는 `callbackUrl`뿐 |
| `sort` / `order` | order=속성, sort=순서 | **반대다.** `sort`=기준(title\|createdAt), `order`=순서(asc\|desc) |
| 인증 오류 | 401 | **403** |
| 404 의미 | 없는 콘텐츠 | **계정 미생성 포함.** 잘못된 API_KEY도 404가 온다 |
| 삭제 응답 | `content.*` + COMPLETED/FAIL | **평면 구조** + APPROVED/REJECTED/COMPLETED/**FAILED** |
| `message` 필드 | 있음 | 실제 응답에 **없을 수 있다** |
| `/upload-url` body | "없음" | `title` 필수 (모순. 실제로는 필요) |

### 응답 래퍼 — 세 종류가 섞여 있다

```jsonc
// external-api.charlla.io  →  data 래퍼
{ "data": { ... } }              // message 는 없을 수 있다

// 업로드 서버 (uploadUrl)   →  래퍼 없음
{ "error": 0, "message": "" }    // HTTP 200 이어도 error 를 검사할 것

// 진행률 (progressUrl)      →  result 래퍼 (data 아님)
{ "result": { "progress": 42 } }
```

이 차이 때문에 `CharllaResponse<T>` / `UploadResult` / `UploadProgress`를 따로 뒀다. 합치지 말 것.

### 업로드 3-스텝

```
POST /upload-url   {"title":"..."}
  → data: { uploadFileKey, uploadUrl, progressUrl, expireTime }   ※ 30분 유효

POST {uploadUrl}   multipart/form-data
  part: upload-file = 파일                  ← 파트명 고정
  part: accept      = "application/json"    ← 필수. 빠지면 실패
  → { error: 0|1, message }

GET {progressUrl}
  → { result: { progress: 0~100 } }
```

**진행률 100%는 "전송 완료"이지 "인코딩 완료"가 아니다.** 인코딩이 끝나야 콘텐츠로 조회된다.

### 콜백

```jsonc
POST {callbackUrl}
{
  "type": "UPLOAD",
  "status": "OK",           // EXCESS_DURATION | ERR_TRANSCODING
  "content": { "title", "uploadFileKey", "contentDeployKey", "mediaUrl",
               "width", "height", "createdAt" }   // contentDeployKey/mediaUrl은 OK일 때만
}
```

**반드시 200 OK로 응답한다.** 아니면 10분 / 30분 / 1시간 뒤 총 3회 재콜백이 온다.
처리 중 예외가 나도 200을 주고 로그만 남긴다 (`CallbackController` 참고).

콜백이 도달하지 못하는 망이면 `GET /contents?keyword={uploadFileKey}` 폴링으로 대체한다.
`CharllaService.findByUploadFileKey()`가 그 경로이고, 두 화면의 업로드 UI도 이 방식을 쓴다.

### 제약

| 항목 | 값 |
|---|---|
| 영상 길이 | **60초 이내** (초과 시 콜백 `EXCESS_DURATION`) |
| 다중 파일 | **미지원.** 1파일씩 순차 |
| 호출 제한 | **분당 60회** |
| 진행률 폴링 | 권장 "1초 이상". 단 1초면 이 API만으로 한도를 다 쓴다 → **2초 기본값** |
| 업로드 URL | 발급 후 **30분** |
| title | 1~255자 |

> 60초와 해상도 제한(1080×1920)은 정의서 본문에 숫자로 명시돼 있지 않다.
> 콜백 `EXCESS_DURATION`("길이 제한")만 있고 초 단위 값은 확인이 필요하다.

---

## 5. 플레이어 인터페이스 (Web Interface v1.2.0)

iframe + `postMessage`. 별도 SDK 없음. 모든 데이터는 JSON 문자열로 주고받는다.

```javascript
{ "action": "play", "payload": { "key": "hNRnNg2AG4x", "time": 12.34 } }
```

| action | 방향 | payload |
|---|---|---|
| `load` | out | key, title, type |
| `play` / `pause` | in/out | key, (out일 때만) time |
| `end` | out | key, time |
| `seek` | in | key, time |
| `mute` / `pip` / `mini` | in | key, mode(`on`\|`off`) |
| `like` | in/out | key, status(boolean) |
| `banner` | in | key, title, data[] |
| `open` / `share` | out | key, **`url`** (문서에는 `link`). `open` 에는 `target` 도 온다 |

배너 data 타입 3종: `product` / `stock` / `content` (→ `lib/charlla/types.ts`)

URL query config: `customBanner`, `bannerLinkExternal`, `shareExternal`, `bannerDefaultImage`

**플레이어 URL은 타입마다 경로가 다르다.** 찰나 공식 샘플(`postmessage-new.html`)의 CDK 획득 규칙:

| 타입 | 경로 | CDK 획득 |
|---|---|---|
| displayer | `/{cdk}` | URL 마지막 세그먼트 |
| shoplayer | `/shoplayer/{cdk}` | URL 두 번째 세그먼트 |
| playlist (list 계열) | `/shoplayer/list/{cdk}` | **URL로는 확정 불가.** `load(out).payload.key` 로 받는다 |

셋을 전부 `/{type}/{cdk}` 로 만들면 **displayer 가 열리지 않는다.**
그리고 list 계열은 URL의 키와 실제 재생 중인 키가 다를 수 있으므로,
브릿지가 `load` 를 받으면 그 key 로 갱신해서 이후 메시지에 쓴다.

> 인터페이스 문서의 `seek` 예시 JSON에 `"action": "seeker"` 오타가 있다. 표에는 `seek`.
> `seek`으로 먼저 시도하고 안 되면 담당자 확인.

---

## 6. 설계 결정 — 뒤집기 전에 이유를 읽을 것

**① 찰나 API 구현은 `CharllaService` 하나에 모여 있다**
계정·업로드·콘텐츠·플레이어URL이 한 클래스에 있다. 컨트롤러는 이 서비스만 주입받는다.

**② 플레이어 URL 조립을 `charlla-api`에 뒀다** (`GET /api/player-url`)
JSP와 React가 각자 조립하면 쿼리 옵션이 갈라진다. API가 완성된 URL을 내려주면
옵션 변경이 두 화면에 동시 반영된다. 프론트에서 URL을 직접 만들지 말 것.

**③ WebClient가 아니라 RestTemplate을 쓴다**
원래 WebClient였지만 모든 호출이 `.block()`이라 비동기 이점이 없었고, 업로드 서버(kollus)가
`Transfer-Encoding: chunked` 요청을 **404로 거부**하는 문제까지 있었다. WebClient는 본문 길이를
모르니 chunked로 보내서, `Content-Length`를 붙이려고 multipart를 손으로 조립해야 했다.
RestTemplate의 `FormHttpMessageConverter`는 본문을 버퍼링하며 `Content-Length`를 자동으로
채우므로 그 문제가 아예 없다. 대가는 업로드 시 파일이 메모리에 올라간다는 것이다(60초 제약이라 감수).
**`bufferRequestBody=false`로 바꾸지 말 것** — 그 순간 chunked가 되어 다시 404다.

**③-1 쿼리 파라미터는 완성된 URI로 넘긴다**
상대경로 + URI 템플릿 변수(`{perPage}`) 조합으로 하면 변수가 치환되지 않고 그대로 나가
숫자 파라미터에서 400이 난다. 문자열인 `keyword`는 검색어로 먹혀 200이라 더 헷갈린다.
`UriComponentsBuilder ... build().encode().toUri()` 로 만들어 넘긴다.

**④ 파일 바이트가 서버를 통과한다**
원래는 브라우저가 `uploadUrl`로 직접 보내는 설계였다. 내부망에서 외부로 직접 못 나갈 수 있어
서버 릴레이로 바꿨다. 브라우저가 알아야 하는 주소는 8081(또는 3000) 하나뿐이다.

**⑤ 브릿지는 일부러 두 벌이다**
- JSP: `charlla-jsp/src/main/webapp/js/charlla-bridge.js` (플레인 JS, `<script src>`용)
- React: `charlla-react/lib/charlla/bridge.ts` (TS)

50줄짜리에 npm 패키지나 복사 태스크를 얹는 비용이 중복 비용보다 크다고 판단했다.
**둘을 고칠 때는 같이 고칠 것.** wire 메시지가 갈라지면 두 화면이 다르게 동작한다.

**⑥ postMessage origin을 `*`로 열지 않았다**
인터페이스 문서 예시는 `'*'`지만 `player.charlla.io`로 좁혔고 수신 시 `e.origin`도 검사한다.
실제로 동작하지 않으면 그때 완화할 것. 먼저 열지 말 것.

**⑦ `load` 수신 전까지 컨트롤을 비활성화한다**
iframe 로드 완료 전 `postMessage`는 유실된다. React는 `disabled={!ready}`, JSP는 버튼 `disabled`.

**⑧ 생성 API에 리트라이를 걸지 않는다**
`/upload-url`은 재시도하면 중복 생성된다. 조회성 호출에만 붙일 것.

**⑨ `<video>` 태그 직접 사용 금지**
찰나 콘솔에서 플레이어 설정을 바꿔도 태그에 반영되지 않는다. iframe 임베드로만 간다.

---

## 7. 함정 목록

| 함정 | 증상 | 대응 |
|---|---|---|
| **Gradle 8/9 사용** | 플러그인 오류 | Boot 2.7.5는 **6.8/6.9/7.x만** 지원. 래퍼가 7.6.4로 고정돼 있음. **IDE가 업그레이드를 권해도 따르지 말 것** |
| **JAVA_HOME이 21+** | IDE 동기화/빌드 실패 | Gradle 7.6.4는 Java 19 이하에서만 돈다. `gradle.properties`의 `org.gradle.java.home`이 JVM을 11로 고정한다(JAVA_HOME보다 우선). IDE는 `.idea/gradle.xml`의 `gradleJvm` |
| **`serviceName`으로 연동 판정** | 정상인데 실패로 보임 | 실서버가 주지 않는 필드다. `callbackUrl`로 판정할 것 |
| **`sort`/`order` 뒤바꿔 사용** | 정렬이 의도와 다름 | swagger 기준 `sort`=기준, `order`=순서. 정의서 PDF가 반대로 적혀 있다 |
| **chunked 업로드** | 업로드 404 | `Content-Length`가 있어야 한다. RestTemplate 기본(버퍼링)이면 자동. `bufferRequestBody=false` 금지 |
| **URI 템플릿 변수로 쿼리 전달** | `perPage` 등 숫자 파라미터에서 400 | 완성된 URI를 만들어 넘길 것 (설계 ③-1) |
| **플레이어 URL을 `/{type}/{key}`로 통일** | displayer가 안 열림 | 타입마다 경로가 다르다 (§5) |
| **404를 콘텐츠 문제로만 해석** | 인증 문제를 놓침 | 잘못된 API_KEY도 404가 온다 |
| **JSP를 jar로 패키징** | 뷰가 404만 뜸 | `charlla-jsp`는 **war 고정**. `bootJar { enabled = false }` 건드리지 말 것 |
| 콜론 없이 base64 | 인증 실패 | `setBasicAuth(apiKey, "")` |
| 진행률 1초 폴링 | 호출 한도 초과 | 2~3초 |
| HTTP 200만 보고 성공 판단 | 무음 실패 | 업로드 응답의 `error` 필드 검사 |
| 콜백에 200 미응답 | 같은 콜백 3회 재수신 | 무조건 200 |
| 진행률 100%를 완료로 오해 | 목록에 없다고 당황 | 100%는 전송 완료. 인코딩은 그 다음 |
| multipart 크기 기본값 | 업로드가 1MB에서 막힘 | 두 모듈 `application.yml`에 `max-file-size` 설정됨 |
| **호스트 앱에 Tailwind/shadcn 없음** | React 화면만 스타일 없이 깨져 보임 | 코드 문제가 아니다. 전제 확인 (§2) |
| React 언마운트 시 `destroy()` 누락 | 리스너 누적 | `useEffect` cleanup |
| `'use client'` 누락 | SSR에서 window 오류 | 플레이어·업로더 컴포넌트 필수 |

---

## 8. 파일 지도

```
sample/                                 업로드 테스트용 mp4. 화면·통합테스트가 공용으로 쓴다

charlla-api/src/main/java/com/example/charlla/api/
├── config/CharllaProperties.java       설정. 제약값(60초/폴링주기)도 여기
├── config/RestTemplateConfig.java      ★ 인증 헤더 생성 지점 + 타임아웃(조회/업로드 분리)
├── service/CharllaService.java         ★ 찰나 API 구현 전부 (계정/업로드/콘텐츠/플레이어URL)
├── service/ErrorMapper.java            호출을 감싸 4xx/5xx → CharllaApiException
├── controller/                         위 서비스를 그대로 노출
└── dto/                                응답 래퍼 3종 주의 (§4)

charlla-api/src/test/java/.../CharllaUploadIT.java   실서버 연동 테스트 (@Tag("external"))

charlla-jsp/src/main/
├── java/.../PlayerViewController.java  목록/업로드/재생 + api 프록시
└── webapp/
    ├── js/charlla-bridge.js            ★ 플레인 JS 브릿지
    └── WEB-INF/views/
        ├── contents.jsp                목록
        ├── upload.jsp                  업로드
        └── player.jsp                  재생 + 제어 + 이벤트 로그

charlla-react/
├── lib/charlla/types.ts                ★ 액션·페이로드 타입 (기준)
├── lib/charlla/bridge.ts               ★ TS 브릿지
├── components/charlla/CharllaPlayer.tsx
├── components/charlla/CharllaUploader.tsx
├── app/charlla-test/page.tsx           업로드 + 재생
└── e2e/charlla-player.spec.ts          Playwright
```

---

## 9. 참고 문서

- **swagger (정본)**: https://external-api.charlla.io/api-docs
- `Charlla 콘텐츠 관리 API 정의서 v0.2` (PDF, 별도 보관) — swagger와 다른 곳이 있다(§4)
- `Charlla Player Web Interface v1.2.0` (MD, 별도 보관)
- 찰나 이용 가이드: https://support.charlla.io/

**주의: 공개 문서(support.charlla.io)에는 External API 레퍼런스가 없다.**
스펙 근거는 swagger와 정의서 PDF뿐이다. 웹 검색으로 확인하려 하지 말 것.
