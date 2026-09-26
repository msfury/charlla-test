# 콜러스 플레이어 교체: iframe → `<video>` 직접 재생

기존 학습자 사이트의 콜러스(Kollus) iframe 플레이어를, 우리 페이지의 `<video>`로 직접 재생하는 플레이어로 바꾼 코드다.
사내망에서 콜러스 영상이 404로 재생되지 않던 문제를 **프론트·백엔드 코드만으로** 푼 것이다. 인프라나 콜러스 쪽 변경은 필요 없다.

- 사내망 적용 완료 (2026-09-27): 영상, 오디오, 재생바·음량바, 배속, 전체화면 모두 확인
- 조사 과정 전체(시도한 방법, 근거, 사내 확인 결과)는 같은 폴더의 [`KOLLUS_NETWORK_ISSUE.md`](KOLLUS_NETWORK_ISSUE.md)

## 1. 문제와 원인

### 증상

- 콜러스 iframe(`v.kr.kollus.com/s?jwt=...`) 안에서 `file.kollus.com` 파일과 CDN(`*.lcdn.kollus.com`)의 m3u8·썸네일이 전부 404
- 같은 주소를 사내 PC에서 curl로 받으면 200

### 원인: 브라우저의 HTTP/2 연결 재사용 (connection coalescing)

- 사내망은 외부로 나가는 게이트서버 **IP 하나**만 열려 있고, 콜러스 도메인을 전부 그 IP에 묶어 쓴다. 게이트서버는 TLS 연결의 SNI를 보고 목적지를 정한다.
- 콜러스는 도메인 여러 개에 **와일드카드 인증서 하나**를 쓴다.
- Chrome/Edge는 새 도메인이 이미 열린 HTTP/2 연결과 **같은 IP**이고 그 연결의 **인증서가 새 도메인도 덮으면**, 새 연결을 열지 않고 기존 연결에 요청을 싣는다 (Chromium `net/spdy/spdy_session_pool.cc`).
- 그래서 CDN 요청이 `v.kr.kollus.com`으로 맺은 연결에 실려 v.kr 서버로 가고, v.kr 서버는 모르는 Host라 404를 준다.
- 확정 근거: DevTools에서 404 난 CDN 요청과 v.kr 문서 요청의 **Connection ID가 같았다**. CDN은 HTTP/1.1만 쓰는데 요청 헤더에 `:authority`가 있었다(HTTP/2).
- 사외 인터넷에서는 도메인마다 IP가 달라 이 문제가 생기지 않는다.

### 안 되는 방법 (확인함)

- **iframe에서 콜러스 도메인을 먼저 한 번씩 열기:** 처음 열린 HTTP/2 연결에 이후 도메인이 전부 실린다. 순서를 바꾸면 잘못 도착하는 서버만 바뀐다. CDN은 HTTP/1.1 전용이라 자기 HTTP/2 연결을 가질 수 없다.
- **도메인마다 다른 IP, 포워드 프록시:** 브라우저가 연결을 섞지 않게 되지만 인프라 변경이나 사용자 PC 설정이 필요하다.

## 2. 해결: 브라우저가 콜러스 HTTP/2 서버에 연결하지 않게 한다

- 콜러스 공식 기능 **SR링크**를 쓴다. iframe 주소의 경로 `/s`를 `/sr`로 바꿔 부르면, 콜러스가 JWT를 검증하고 재생 가능한 스트림 주소로 302를 준다 ([콜러스 문서: 플레이어 호출](https://docs.kollus.com/dev-guide/vod/player/invoke-player/)).
- SR링크는 **Next.js 서버(route)** 가 부른다. 브라우저가 부르면 v.kr 연결이 생겨 다시 섞인다. 브라우저 fetch는 `redirect:'manual'`로도 302의 Location을 읽을 수 없다.
- **영상:** SR이 CDN 주소로 302 → 서버가 CDN 주소만 브라우저에 준다 → `<video src>`가 CDN(HTTP/1.1)에서 받는다.
- **오디오:** SR이 302 없이 mp3를 200으로 바로 준다 → 서버가 대신 받아 브라우저로 흘려 준다(Range 전달, 탐색 가능).
- m3u8(HLS)은 Edge/Chrome 145 이상이 hls.js 없이 재생한다 (Chromium 143에서 기본 켜짐, 145에서 플래그 삭제). npm 패키지 추가가 없다.

## 3. 파일

이 폴더(`kollus-player/`) 아래 경로는 대상 앱(학습자 사이트)의 경로와 같다. 폴더 구조 그대로 대상 앱에 덮어쓴다.
이 폴더는 옮겨 갈 파일만 모아 둔 곳이라 `charlla-react` 빌드에서는 뺐다(`tsconfig.json`의 `exclude`).

| 파일 | 대상 앱에서 | 내용 |
|---|---|---|
| `components/player/catenoid-player/kollus-player.tsx` | **통째로 교체** | 기존 `KollusPlayer`와 같은 기본 export, props, ref(`getProgress`/`play(jumpStep)`/`pause`). 부르는 쪽은 고치지 않는다. 안에 `<video>` 플레이어(`KollusDirectPlayer`)가 들어 있다 |
| `app/api/player/kollus-stream-url/route.ts` | **새로 추가** | POST: S링크 → SR 호출 → `{ streamUrl }`. GET: SR이 파일을 바로 주는 경우(오디오) 서버가 받아 흘려 준다. `https://v.kr.kollus.com/s?jwt=`(기본 포트, 계정 정보 없음)만 받고, 콜러스 도메인 안에서만 리다이렉트를 따라간다 |

`kollus-player.tsx`는 대상 앱에 원래 있는 `@/services/player/player-service`(`postCatenoidPlayUrl`)와 `@/type/player/player-type`(`CatenoidPlayUrlReq`)를 그대로 쓴다.

- 그림·CSS·npm 패키지는 없다. 아이콘과 오디오 음표는 코드 안의 SVG다.
- 예전 VG Controller 스크립트(`vg-controller-client.latest.min.js`)는 더 이상 쓰지 않는다.

## 4. 사용법

부르는 쪽은 예전 그대로다.

```tsx
<KollusPlayer
  ref={playerRef}
  mckey={content.d_cdnmckey}
  isSeekable={true}
  seekableEnd={content.d_last_path}
  videoClip={content.d_last_path.toString()}   // 백엔드가 callUrl 의 t=(초)로 넣는다 → 이어보기
  onPlayerReady={callPlayerReady}
  onVideoPlay={callVideoPlay}
  onVideoEnd={sendContentProgressEnd}          // 끝나면 (100, 위치)
  onVideoPause={callVideoPause}
  onVideoError={callVideoError}                // 복구할 수 없을 때만
  onVideoProgress={checkAndSendProgress}       // 10% 구간을 넘을 때마다 (10의 배수, 위치, 길이)
  options={{ seekBar: true, playbackRate: true, repeat: true }}  // 선택. 안 주면 DEFAULT_OPTIONS
/>
```

### 화면 옵션

`kollus-player.tsx`의 `DEFAULT_OPTIONS`가 전체 기본값이고, 화면마다 `options`로 덮어쓴다.

| 옵션 | 기본 | 내용 |
|---|---|---|
| `seekBar` | true | 재생바. 끄면 10초 뒤로/앞으로 버튼과 ←/→ 키도 없어진다 |
| `playbackRate` | true | 배속 목록 (0.5~2x). JWT `disable_playrate`가 true면 켜도 숨김 |
| `repeat` | true | 구간반복. 첫 누름 = 시작점(A), 두 번째 = 끝점(A-B 반복), 세 번째 = 해제 |

오디오 화면에 음표 대신 그림을 쓰려면 `AUDIO_IMAGE`에 `public/` 경로를 적는다. `file.kollus.com` 주소는 적지 않는다(다시 HTTP/2 연결이 생긴다).

## 5. 동작

- **콜러스 설정은 callUrl에서 읽는다:** JWT의 `seek`, `seekable_end`, `disable_playrate`(없으면 props). 쿼리 `t` 또는 `s`(초)로 이어보기. 콜러스처럼 처음·끝 10초 안이면 처음부터.
- **탐색 제한:** `seek=false`면 0 ~ max(`seekable_end`, 이미 본 위치)까지만. 마우스 오른쪽 메뉴(컨트롤 표시, 다운로드)를 막고, 어떤 경로로 옮겨도 제한을 넘으면 되돌린다.
- **버튼:** 재생/일시정지, 정지, 10초 뒤로/앞으로, 시간, 재생바, 구간반복, 배속, 음소거, 음량, 전체화면, 가운데 큰 재생 버튼. 좁으면 정지와 음량 막대를 숨긴다. 키보드: 스페이스, ←/→, M, F.
- **사이트 CSS 영향 없음:** 재생바·음량바는 막대를 직접 그리고 투명한 range를 위에 겹친다. 배속은 `<select>` 대신 직접 그린 목록. 버튼 모양값을 인라인으로 고정했다. (사이트 전역 CSS 때문에 range 막대가 안 보이고 배속 모양이 깨졌던 문제)
- **오디오:** mp3·m4a·소리만 있는 HLS를 재생하고 남색 바탕에 음표를 띄운다.
- **자동재생:** 소리 켠 채로 시도 → 막히면 음소거로 → 그래도 막히면 재생 버튼을 보여 주고 기다린다.
- **오류:** 재생 오류면 주소를 새로 받아 멈춘 위치부터 이어서 재생(재생 중이었을 때만). 연속 3번까지, 30초 정상 재생되면 다시 3번. 복구되는 오류·자동재생 차단·전체화면 실패는 `onVideoError`로 알리지 않는다.
- **콜백:** `onPlayerReady`는 영상마다 한 번(메타데이터를 읽은 뒤), `onVideoPlay`/`onVideoPause`는 상태가 실제로 바뀔 때만.
- 없는 것: 콜러스 통계, 이어보기 팝업, 워터마크, 화질 메뉴(브라우저가 자동으로 고른다).

## 6. 적용 전 확인 (사내 PC)

1. **SR링크가 켜져 있는지:** DevTools에서 콜러스 iframe의 src를 복사해 `/s?`만 `/sr?`로 바꾼다. `302`와 CDN `location`이 나오면 된다(영상). 오디오는 `200`과 파일이 온다. 4xx면 계정에서 SR링크가 꺼져 있다.
   ```
   curl -s -D - -o NUL --ssl-no-revoke "https://v.kr.kollus.com/sr?jwt=...(src 쿼리 그대로)"
   ```
2. **Edge가 HLS를 바로 재생하는지:** 콘솔에서 `document.createElement('video').canPlayType('application/vnd.apple.mpegurl')`가 `maybe`면 된다(Edge 145 이상).
3. 적용 후 Network 탭: CDN 요청이 `http/1.1` 200이고, `v.kr.kollus.com`·`file.kollus.com` 요청이 없으면 정상. 오디오는 `kollus-stream-url?playUrl=...` GET이 200/206.

## 7. 주의

- LMS 어디에서도 콜러스 iframe을 남기지 않는다. 다른 탭에 v.kr iframe이 열려 있으면 그 연결에 섞일 수 있다.
- 운영 서버의 Next.js도 `v.kr.kollus.com`에 나갈 수 있어야 한다. 오디오는 우리 서버를 거쳐 흘러가므로 그만큼 서버 트래픽이 든다.
- Node가 게이트에서 TLS 오류(`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 등)를 내면 회사 루트 인증서를 `NODE_EXTRA_CA_CERTS`로 지정한다.
- 채널에 도메인·referer 제한이나 중복 재생 차단이 있어 막히면 헤더를 꾸며 넣지 말고 콜러스에 방법을 묻는다.
