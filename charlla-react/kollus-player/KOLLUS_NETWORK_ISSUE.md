# 내부망 콜러스/찰나 영상 재생 문제 정리 (2026-09-27)

> 조사 기록 원본이다 (tm-lms-challa 에서 옮겨 옴). 최종 코드와 사용법은 같은 폴더의 `README.md`. 여기 적힌 확인용 페이지·목업·`tools/kollus-gate` 스크립트는 정리하면서 지웠다.

다른 사람(또는 다른 AI)에게 물어보기 위해 지금까지 확인한 사실, 추정, 시도한 방법을 정리한 문서다.
**확인된 사실**과 **추정**을 구분해서 적었다.

---

## 1. 환경

- 사내 내부망 PC (Windows, 브라우저 **Edge**), Next.js 15.3.6 학습자 사이트(`tm-lms-user`)를 로컬(`localhost:3000`)에서 개발 중
- 인터넷 직통은 막혀 있다. 외부망 **게이트서버 `192.168.151.66`** 하나만 방화벽에서 열려 있다
- 외부 도메인은 PC의 **hosts 파일**로 게이트서버 IP에 묶어서 쓴다 (정식 인프라 요청 전 임시 방식)
- 기본 게이트웨이 `10.200.72.1`. ICMP(ping)는 막혀 있고, tracert는 3홉 뒤 timeout (ICMP 차단 때문으로 보임)
- 영상 플레이어 두 종류
  - **찰나 드롭인 (신규, SHORTS/SLEARN)**: `https://player-api.charlla.io/mp4/{cdk}` → 302 → 콜러스 CDN mp4를 `<video>`로 직접 재생
  - **기존 Kollus 플레이어**: `v.kr.kollus.com` iframe + 부모 페이지의 VG Controller(`window.Kollus.VideogatewayController`)로 제어. iframe 안 콜러스 페이지가 `file.kollus.com`에서 자기 JS/CSS를 받고, HLS(`m3u8`)는 CDN에서 받음

### 현재 hosts (콜러스/찰나 관련, 전부 `192.168.151.66`)

```
api.kr.kollus.com          upload.kr.kollus.com       v.kr.kollus.com
file.kollus.com            c-api-kr.kollus.com        meritz.video.kr.kollus.com
meritz.lcdn.kollus.com     meritz.ucdn.kollus.com
charlla-kl06m60l.lcdn.kollus.com   charlla-kl06m60l.ucdn.kollus.com
external-api.charlla.io    player.charlla.io          player-api.charlla.io
```

(별도: `192.168.151.55 meritzplusdev.meritzfire.com`)

---

## 2. 해결된 문제

### 2-1. 찰나 영상이 일부만 안 뜸 → hosts에 `ucdn` 누락 (해결)

- 콜러스는 영상·화질마다 다른 CDN 도메인으로 302 리다이렉트한다
  - 찰나 샘플(`...tablet2-high.mp4`) → `charlla-kl06m60l.lcdn.kollus.com`
  - 내부 영상(`...pc1-high.mp4`) → `charlla-kl06m60l.ucdn.kollus.com`
- hosts에 `lcdn`만 있어서 `ucdn`은 사내 DNS로 조회 → `211.56.106.103/105/106/107`로 **직접** 접속 시도 → 전부 연결 timeout
- hosts에 `192.168.151.66 charlla-kl06m60l.ucdn.kollus.com` 추가 후 해결
- 확인 방법: `curl -v -I --ssl-no-revoke https://player-api.charlla.io/mp4/{cdk}` 의 `Location` 도메인이 hosts에 있는지
- 참고: Windows curl(schannel)은 인증서 폐기 조회(OCSP/CRL) 때문에 내부망에서 핸드셰이크 도중 멈춘다. `--ssl-no-revoke` 필요

### 2-2. Turbopack 개발 서버에서 코드 변경이 반영 안 됨 (해결)

- `next.config`에 `watchOptions: { pollIntervalMs: 500 }`가 있었음. webpack은 이 값을 폴링으로 잘 쓰지만, Turbopack(15.3.6, 내부 notify 6.1.1)의 폴링 감시는 Windows에서 변경을 놓친다 (vercel/next.js#96982)
- `watchOptions: process.env.TURBOPACK ? undefined : { pollIntervalMs: 500 }` 로 바꿔서 해결 (`next dev --turbopack`은 개발 서버 자식 프로세스에 `TURBOPACK=1`을 넣는다)
- 예전 node 프로세스가 남아 옛 코드를 내보낸 적도 있음 → `taskkill /F /IM node.exe`

### 2-3. 그 외 코드 쪽

- `ContentShorts`에 `onLikeChange` prop을 안 넘겨서 좋아요 API가 안 나갔음 (호출부 누락)
- 진도 요청 99와 100이 동시에 나가 서버에서 99가 나중에 처리될 수 있어 → `useProgressQueue`로 순서대로 전송
- `p_study_time`에 문자열 `"undefined"`가 가던 것 → 빈 값으로
- `ContentSlearn`이 `data: null`을 받도록 변경 (목록 조회 전에는 기다림)
- `kollus-player.tsx`
  - `{videoUrl ?? (<iframe .../>)}` 가 조건이 거꾸로였음 → `{videoUrl && (<iframe src={videoUrl} .../>)}`
  - VG Controller를 `file.kollus.com` 대신 로컬 `public/js/vg-controller-client.latest.min.js`로 로드 (`next/script`)
  - 이 파일(Kollus VG Controller **2.0.2**, 2026-02-19)은 `window.VgControllerClient`(생성자)와 `window.Kollus = { VideogatewayController }`(객체)를 만든다. 기존 코드의 `new window.Kollus(...)` → **`new window.Kollus.VideogatewayController(...)`** 로 수정. 로드는 정상 확인

---

## 3. 미해결 문제: 기존 Kollus 플레이어에서 `file.kollus.com`, `*.lcdn.kollus.com` 요청이 404 (CORS 에러로 보임)

### 3-1. 증상 (내부망 브라우저)

- 기존 Kollus 플레이어 재생 시 콘솔:
  - `Access to XMLHttpRequest at 'https://meritz.lcdn.kollus.com/kr/realtime/meritz/.../master.m3u8?...' from origin 'https://v.kr.kollus.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header`
  - `HLS.js error: networkError - fatal: true - manifestLoadError`, `GET ... net::ERR_FAILED 404`
  - 썸네일 jpg(`meritz.lcdn.kollus.com/kr/snapshot/...`)도 같은 CORS + 404
- iframe 안 콜러스 페이지가 받는 **`file.kollus.com` 파일들도 전부 404**
- 브라우저가 받은 404 응답 헤더 (m3u8 요청, 요청은 HTTP/2 `:authority meritz.lcdn.kollus.com`):
  - `Status 404`, `Content-Type: text/html`, `Content-Length: 548`
  - `Strict-Transport-Security: max-age=15724800; includeSubDomains`
  - `Access-Control-Allow-Origin` **없음**

### 3-2. 같은 주소를 내부망 curl로 요청하면 정상 (확인된 사실)

- `curl -v -I --ssl-no-revoke "https://meritz.lcdn.kollus.com/.../master.m3u8?..."`
  - `Trying 192.168.151.66` → `Connected` → TLS 완료 → **`HTTP/1.1 200 OK`**, `Content-Type: application/vnd.apple.mpegurl`, `Access-Control-Allow-Origin: *`, `Server: NCE`, `X-NCE-CacheResult: HIT`
- `curl ... https://file.kollus.com/vgcontroller/vg-controller-client.latest.min.js` → **200**
- `player-api.charlla.io/mp4/...` 10회 → 전부 302 (0.06~0.15초)
- 즉 **게이트서버를 거쳐 새 연결로 요청하면 정상**, 브라우저에서만 404

### 3-3. 외부망에서 확인한 사실

| 확인 | 결과 |
|---|---|
| 진짜 콜러스 CDN의 404 (없는 경로 요청) | `Content-Length: 146`, `Access-Control-Allow-Origin: *`, `Server: NCE`, HSTS 없음 |
| `v.kr.kollus.com` 서버에 `Host: meritz.lcdn.kollus.com` 요청을 보내면 (`curl --connect-to`) | `HTTP/2 404`, `content-length: 146`, **`strict-transport-security: max-age=15724800; includeSubDomains`**, ACAO 없음 → 내부망 브라우저 404와 거의 같은 모양 (길이만 146 vs 548) |
| `v.kr.kollus.com` 서버에 `Host: file.kollus.com` 요청 | `HTTP/2 404`, 같은 HSTS |
| `file.kollus.com` 서버에 `Host: v.kr.kollus.com` 요청 | `400 Bad Request` |
| 인증서 | `v.kr`, `file`, `api.kr`, `meritz.lcdn`, `meritz.ucdn`, `charlla-kl06m60l.lcdn` 등 **전부 같은 인증서**. SAN 41개: `*.kollus.com`, `*.kr.kollus.com`, `*.lcdn.kollus.com`, `*.ucdn.kollus.com`, `*.ucdn-dev.kollus.com`, `*.acloudlive.kr.kollus.com` … |
| 프로토콜 | `v.kr.kollus.com` **HTTP/2**, `file.kollus.com` **HTTP/2**, `api.kr.kollus.com`·CDN(`lcdn`/`ucdn`) **HTTP/1.1**, `player-api.charlla.io` HTTP/2 (AWS ELB, 인증서는 charlla 전용 SAN 2개) |
| DNS | `*.lcdn.kollus.com` → `wildcard-lcdn-kollus.cache.cdn.cloudn.co.kr` (KT, IP 여러 개 순환), `*.ucdn.kollus.com` → `wildcard-ucdn-kollus.cache.onscdn.co.kr` (`211.56.106.x`). 와일드카드라 앞부분(`meritz`, `charlla-kl06m60l`)은 콜러스 계정 이름 |

### 3-4. 추정 원인: 브라우저의 HTTP/2 연결 재사용 (connection coalescing)

- Chrome/Edge는 새 도메인이 ① **이미 열린 HTTP/2 연결과 같은 IP**로 조회되고 ② 그 연결의 **인증서가 새 도메인도 포함**하면, 새 연결 없이 기존 연결에 요청을 싣는다
- hosts로 콜러스 도메인을 전부 `192.168.151.66`에 묶었고(①), 콜러스는 공용 와일드카드 인증서를 쓴다(②)
- 그래서 `v.kr.kollus.com`(iframe)이나 `file.kollus.com`의 HTTP/2 연결에 CDN/file 요청이 실려 게이트서버로 간다. 게이트서버는 연결을 맺을 때의 SNI(`v.kr...`)로 목적지를 정한 것으로 보여 v.kr 서버로 전달하고, v.kr 서버(ingress-nginx로 보임, HSTS 15724800이 기본값)가 모르는 Host라 CORS 헤더 없는 404를 준다
- curl은 매번 새 연결 + 올바른 SNI라 200
- 외부망에서는 도메인마다 IP가 달라 ①이 깨져서 문제없음

**근거:** 3-2, 3-3의 응답 헤더 비교. 브라우저 요청이 HTTP/2였고, CDN은 HTTP/1.1만 지원한다.
**검증 안 된 것:**
- 게이트서버가 정말 SNI 기반 L4 패스스루인지 (TLS 가로채기(회사 CA) 방식인지). 확인 방법: 브라우저에서 `v.kr.kollus.com` 인증서의 **발급자**가 공인 CA인지 회사 CA인지 보기
- DevTools Network의 404 요청 **Protocol / Connection ID** 값 (h2이고 v.kr 요청과 같은 Connection ID면 확정). 아직 못 봄

### 3-5. HTTP/2를 끈 브라우저 테스트 (결과 불분명)

- `msedge.exe --disable-http2 --user-data-dir=%TEMP%\edge-noh2`
- 처음엔 새 프로필이라 로그인이 안 돼서 콘텐츠 영역이 안 그려짐
- 이후 "1건 `HLS.js error: networkError - fatal: false - fragLoadTimeOut`(약 10초 후)"만 있었다는 보고가 있었으나, 정상 재생 여부는 명확히 확인되지 않음
- 어쨌든 **사용자 PC마다 HTTP/2를 끄게 할 수는 없으므로 해법이 아님**

---

## 4. 검토한 해결 방법과 상태

| # | 방법 | 상태 / 문제 |
|---|---|---|
| A | 도메인(서버)별로 게이트서버 IP를 여러 개 할당 (IP가 다르면 브라우저가 연결을 안 섞음) | 인프라가 IP를 더 줄 가능성이 낮음. 방화벽은 IP 하나만 허용 |
| B | 브라우저 HTTP/2 끄기 (`--disable-http2`) | 사용자 배포 불가. 개발 확인용으로만 가능 |
| C | 개발 PC에서 `netsh interface portproxy`로 `127.0.0.x`마다 66번 443으로 전달하고 hosts를 도메인별 다른 루프백 IP로 | 미검증. 관리자 권한 필요, 개발 PC 한정, 페이지를 사설 IP 주소로 열면 Edge 로컬 네트워크 접근 제한에 걸릴 수 있음 |
| D | 콜러스 서버가 모르는 Host에 404 대신 **`421 Misdirected Request`** 응답 (브라우저가 새 연결로 자동 재시도, RFC 7540 9.1.2) | 우리가 직접 못 고침. 콜러스(카테노이드)에 요청해야 함 |
| E | hosts 대신 게이트서버를 **포워드 프록시(CONNECT)** 로 쓰고 PAC를 그룹 정책으로 배포 (브라우저가 IP 조회를 안 하므로 연결이 안 섞임) | 게이트서버가 프록시 모드를 지원하는지 모름. 인프라 작업 |
| F | 기존 Kollus iframe을 버리고 mp4를 `<video>`로 직접 재생 (찰나 방식) | 콜러스에서 직접 재생 가능한 mp4 URL을 받아야 함. HLS만 되면 hls.js가 필요한데 npm 설치 불가 |
| - | 부모 페이지에서 `file.kollus.com` 스크립트를 불러오거나 iframe에 넣는 꼼수 | 제거함. HTTP/2 연결만 더 늘려서 오히려 악화시킬 수 있음 |

찰나 드롭인(SHORTS/SLEARN)은 `v.kr`/`file.kollus.com`에 연결하지 않고 CDN은 HTTP/1.1이라 **단독으로는 영향이 적다**. 다만 같은 브라우저에서 기존 Kollus 플레이어를 먼저 열어 콜러스 HTTP/2 연결이 살아 있으면, 찰나 CDN 요청도 거기에 섞여 같은 404가 날 수 있다(추정).

---

## 5. 열린 질문 (이걸 물어보고 싶다)

1. **제약:** 콜러스 서버는 못 고침, 게이트서버 IP는 하나, 사용자 PC 설정은 못 바꿈, npm 패키지 추가 불가. 이 조건에서 기존 Kollus iframe 플레이어의 404를 없앨 방법이 있는가?
2. 3-4의 원인 추정(HTTP/2 connection coalescing)이 맞는가? 다른 설명이 가능한가?
3. 게이트서버가 SNI 패스스루인지 TLS 가로채기인지에 따라 해법이 달라지는가? (가로채기라면 게이트서버가 도메인별 인증서를 내주므로 연결이 안 섞여야 하는데, 그렇다면 원인이 다를 수 있음)
4. 실제 학습자가 사외 인터넷에서 접속하면 이 문제는 운영에서 안 생기는가? (내부망 개발 환경에서만의 문제인가)

---

## 6. 그동안 잘못 짚었던 것 (같은 실수 방지용)

- Turbopack은 원인이 아니라고 했으나 실제 원인이었음 (2-2)
- 찰나 영상 실패를 "게이트서버 → CDN 아웃바운드 차단"으로 추정했으나 실제는 hosts의 `ucdn` 누락이었음 (2-1)
- `meritz.lcdn` 404를 "게이트서버가 이 도메인을 모름"으로 추정했으나 curl로는 200이었음 (3-2)
- iframe은 원인이 아니라고 했으나, iframe(`v.kr`)의 HTTP/2 연결이 연결 재사용의 출발점으로 보임 (3-4)

---

## 7. 원인 확정과 해결 절차 (2026-09-27 추가)

> 7-2, 7-3(도메인별 IP, 프록시)은 **기각**. IP나 PC 설정을 바꿀 수 없고 프론트·백엔드 코드만 고칠 수 있다. 실제 해법은 8장이다. `tools/kollus-gate/` 스크립트는 쓰지 않는다.

### 7-1. 확정된 원인

- DevTools Network에서 404가 난 `meritz.lcdn.kollus.com` m3u8 요청과 `v.kr.kollus.com` 문서 요청의 **Connection ID가 같음**을 확인했다. 요청 헤더에 `:authority` `:method` `:path` 의사 헤더가 있으므로 HTTP/2 요청이고, CDN은 HTTP/1.1만 쓴다. 3-4의 추정(HTTP/2 connection coalescing)이 **확정**됐다.
- Chromium 소스 근거 (`net/spdy/spdy_session_pool.cc`, `net/spdy/spdy_session.cc`)
  - 재사용 후보는 세션의 **peer IP 주소**(`GetPeerAddress`)를 키로 하는 alias 맵에서 찾는다. 새 도메인이 다른 IP로 조회되면 후보가 없어서 새 연결을 만든다.
  - 이 alias는 `proxy_chain().is_direct()` 즉 **직접 연결일 때만** 등록한다. 명시적 프록시(CONNECT)를 거치면 IP 기반 재사용이 아예 없다.
  - `CanPool`은 인증서가 새 도메인에 유효한지만 본다. 콜러스 와일드카드 인증서라 통과한다.
  - 421 Misdirected Request를 받으면 Chromium은 IP 재사용을 끄고 새 연결로 재시도한다 (`http_network_transaction.cc`). 하지만 콜러스는 404를 주므로 재시도가 없다.
- 결론: **도메인마다 IP를 다르게 만들거나, 브라우저가 IP를 조회하지 않게(프록시) 하면** 사라진다. 코드로는 못 막는다 (iframe 안에서 일어나는 일이고, 순서 꼼수는 다른 도메인만 깨뜨린다).

### 7-2. 해결 1안: 도메인별 루프백 IP + Node TCP 포워더 (권장. 관리자 권한·npm·코드 수정 불필요)

원리: hosts에서 콜러스 도메인마다 서로 다른 `127.0.0.x`를 주고, Node 스크립트가 `127.0.0.x:443`으로 들어온 TCP를 게이트서버 `192.168.151.66:443`으로 그대로 넘긴다. TLS 바이트를 손대지 않으므로 SNI와 인증서는 원래 그대로이고, 게이트서버는 지금처럼 SNI로 목적지를 정한다. 브라우저는 IP가 다르니 연결을 섞지 않는다. Windows는 443 포트 바인딩과 `127.0.0.2~254` 사용에 관리자 권한이 필요 없다.

스크립트: `tools/kollus-gate/loopback-forwarder.mjs` (외부 의존성 없음, `node:net`만 씀). 내부망 프로젝트의 아무 폴더에 복사한다.

절차 (내부망 PC):

1. 443 포트가 비어 있는지 확인: `netstat -ano | findstr ":443 "` 에 `LISTENING` 줄이 없어야 한다. (있으면 7-3의 2안으로 간다)
2. `node loopback-forwarder.mjs --hosts` 로 hosts에 넣을 내용을 뽑아, hosts의 `192.168.151.66 *.kollus.com` 줄들을 **지우고** 그 자리에 붙여 넣는다. `charlla.io` 3줄과 `meritzplusdev`는 그대로 둔다. (현재 hosts에 `meritz.ucdn`/`meritz.lcdn`이 두 번 있는데 함께 정리한다)
3. `ipconfig /flushdns`
4. 별도 터미널에서 `node loopback-forwarder.mjs --verbose` 실행. `127.0.0.11:443 → 192.168.151.66:443  v.kr.kollus.com` 같은 줄이 도메인 수만큼 찍히면 정상. 개발하는 동안 켜 둔다.
5. curl로 확인 (브라우저 전에):
   - `curl -v -I --ssl-no-revoke https://file.kollus.com/vgcontroller/vg-controller-client.latest.min.js` → `Trying 127.0.0.12:443` + `200`
   - `curl -v -I --ssl-no-revoke "https://meritz.lcdn.kollus.com/...master.m3u8?..."` → `Trying 127.0.0.17:443` + `200`
   - 포워더 터미널에 `[file.kollus.com] 연결 ←`, `[meritz.lcdn.kollus.com] 연결 ←` 가 찍힌다
6. **Edge를 완전히 종료**한다 (모든 창. 작업 관리자에서 `msedge.exe`가 남아 있으면 끝낸다). 살아 있는 HTTP/2 연결과 Edge 내부 DNS 캐시를 버리기 위해서다. 종료 없이 하려면 `edge://net-internals/#sockets` → Flush socket pools, `edge://net-internals/#dns` → Clear host cache.
7. `localhost:3000`에서 기존 Kollus 콘텐츠를 재생하고 DevTools Network에서 확인:
   - `v.kr.kollus.com`, `file.kollus.com`, `meritz.lcdn.kollus.com` 요청의 **Connection ID가 전부 다름**
   - Remote Address 열이 각각 `127.0.0.11`, `127.0.0.12`, `127.0.0.17`
   - Protocol: v.kr/file은 `h2`, CDN은 `http/1.1` (CDN 요청 헤더에 `:authority`가 **없어야** 정상)
   - m3u8, 썸네일 jpg, VG Controller JS 모두 200, CORS 에러 없음
8. 찰나 드롭인(SHORTS/SLEARN)도 같은 브라우저에서 이어서 재생해 본다. 찰나 CDN 도메인도 고유 IP를 받았으므로 기존 Kollus 플레이어를 먼저 열어도 섞이지 않는다.

되돌리기: 스크립트를 끄고 hosts를 원래대로. 그 외에 바꾼 것이 없다.

포워더가 `EADDRINUSE`/`EACCES`로 못 뜨면: 관리자 권한이 있으면 아래 `netsh portproxy`로 같은 일을 할 수 있다 (IP Helper 서비스 필요, 재부팅 후에도 유지).

```
netsh interface portproxy add v4tov4 listenaddress=127.0.0.11 listenport=443 connectaddress=192.168.151.66 connectport=443
(도메인 수만큼 반복)   확인: netsh interface portproxy show all   삭제: netsh interface portproxy reset
```

### 7-3. 해결 2안: 콜러스 전용 CONNECT 프록시 + PAC (hosts 편집 불필요)

스크립트: `tools/kollus-gate/connect-proxy.mjs`. `127.0.0.1:3128`에 HTTP CONNECT 프록시를, `http://127.0.0.1:3129/proxy.pac`에 PAC을 띄운다. PAC은 `*.kollus.com`, `*.charlla.io`만 프록시로 보내고 나머지는 DIRECT. 프록시는 그 도메인의 CONNECT를 전부 게이트서버 `192.168.151.66:443`으로 잇는다. 브라우저가 도메인의 IP를 조회하지 않으므로 IP 기반 재사용이 성립하지 않는다.

- Edge를 완전히 종료한 뒤 `msedge.exe --proxy-pac-url=http://127.0.0.1:3129/proxy.pac` 로 실행 (기존 프로필 그대로 쓰므로 로그인 유지). 또는 Windows 설정 > 네트워크 > 프록시 > "설정 스크립트 사용"에 PAC 주소. 그룹 정책으로 프록시 설정이 잠겨 있으면 플래그 방식만 가능하다.
- 확인: `curl -v -I --ssl-no-revoke -x http://127.0.0.1:3128 https://file.kollus.com/vgcontroller/vg-controller-client.latest.min.js` → 200. 프록시 터미널에 `CONNECT file.kollus.com:443 → 192.168.151.66:443`.
- 이 방식은 인프라팀이 정식으로 해 줄 "포워드 프록시 + PAC 배포"(4장 E안)의 축소판이라, 요청할 때 시연용으로도 쓸 수 있다.

두 스크립트 모두 외부망 Mac에서 실제 콜러스 서버를 상대로 HTTP/2 200이 그대로 통과함을 확인했다 (게이트서버 없이 파이프 로직만 확인한 것이라, 내부망에서 5~7번 확인은 꼭 거친다).

### 7-4. 운영에서는 생기는가 (5장 질문 4)

- 학습자가 **공용 인터넷**에서 접속하면 생기지 않는다. 실제 DNS에서는 CDN(`*.lcdn`/`*.ucdn`, KT·온스 CDN IP)과 `v.kr`/`file`(콜러스 ingress IP)이 다른 IP라 재사용 조건 ①이 깨진다. `v.kr`과 `file.kollus.com`이 콜러스 ingress IP를 같이 쓰더라도, 그 ingress는 요청마다 Host로 라우팅하므로 섞여도 정상 응답한다. 이 문제는 "서로 다른 서버를 IP 하나로 접고, 그 앞단이 연결 단위(SNI)로 목적지를 정하는" 조합에서만 난다.
- 운영 사용자도 내부망에서 **같은 방식(도메인 전부 → 게이트 IP 하나, SNI 라우팅)** 으로 접속한다면 똑같이 난다. 이건 개발자가 못 고치는 인프라 구성이며, 인프라팀에 전달할 요청은 아래 둘 중 하나다.
  1. 게이트서버를 포워드 프록시(CONNECT)로 열고 PAC/그룹 정책으로 배포 (브라우저가 IP를 조회하지 않게)
  2. 최소한 `v.kr`+`file`(HTTP/2 그룹)과 CDN(`*.lcdn`, `*.ucdn`)이 **다른 IP**로 조회되게 (게이트 IP 2개 이상, 또는 도메인 그룹별 VIP)
  - 근거로 줄 것: 3-1~3-4의 헤더 비교, Connection ID 동일 확인, Chromium `spdy_session_pool.cc`의 IP alias 규칙.

---

## 8. 코드만으로 고치는 방법: 콜러스 SR링크 + 자체 `<video>` (2026-09-27, 내부망 적용 완료)

### 8-1. 왜 되는가

- 404는 브라우저에 v.kr/file.kollus.com의 HTTP/2 연결이 살아 있을 때만 난다. CDN 요청이 그 연결에 실리기 때문이다.
- 그래서 **브라우저가 v.kr/file.kollus.com에 아예 연결하지 않게** 한다. 찰나 드롭인이 같은 CDN에서 문제없이 재생되는 이유와 같다.
- 콜러스 공식 기능 **SR링크**: iframe src의 경로 `/s`를 `/sr`로 바꿔 부르면 JWT 검증 후 재생 가능한 스트림 주소로 302를 준다. 자체 플레이어용 정식 기능이다. https://docs.kollus.com/dev-guide/vod/player/invoke-player/
- SR은 **Next.js 서버에서** 부른다. 브라우저가 부르면 v.kr 연결이 생겨 다시 섞인다. 브라우저 fetch는 `redirect:'manual'`로도 Location을 읽을 수 없다.
- 브라우저는 서버가 준 CDN 주소를 `<video src>`로 재생한다. m3u8은 Edge/Chrome 145 이상이 hls.js 없이 재생한다 (Chromium 143에서 기본 켜짐, 145에서 플래그 삭제).
- 입력은 **iframe src 하나**뿐이다. JWT나 키를 따로 알 필요가 없다.

### 8-2. 안 되는 방법 (확인함)

- **iframe에 모든 콜러스 도메인을 먼저 한 번씩 열기:** 안 된다. Chromium은 게이트 IP로 처음 열린 HTTP/2 연결에 이후 콜러스 도메인을 모두 싣는다. 순서를 바꾸면 잘못 도착하는 서버만 바뀐다. CDN은 HTTP/1.1 전용이라 자기 HTTP/2 연결을 가질 수 없다. file→v.kr 순서 실험에서 CDN만 404였던 것이 이 결과다. 한 번 섞인 CDN 키는 그 연결이 닫힐 때까지 계속 거기로 간다 (`spdy_session_pool.cc` `MapKeyToAvailableSession`).
- **SR 주소를 브라우저에 직접 넣기:** 브라우저가 v.kr에 연결하므로 다시 섞일 수 있다.

### 8-3. 내부망에 옮길 파일 2개

| 파일 | 할 일 | 내용 |
|---|---|---|
| `components/player/catenoid-player/kollus-player.tsx` | **통째로 교체** | 기본 export, props, ref(`getProgress`/`play(jumpStep)`/`pause`)가 예전과 같다. `content-video.tsx`, `content-audio`는 **고치지 않는다**. 안에 `<video>` 직접 재생 플레이어(`KollusDirectPlayer`)가 들어 있다 |
| `app/api/player/kollus-stream-url/route.ts` | **새로 추가** | POST `{ playUrl }`. `https://v.kr.kollus.com/s?jwt=`(기본 포트, 계정 정보 없음)만 받는다. `/sr`로 바꿔 서버에서 호출(브라우저 UA 전달)하고 콜러스 도메인 안에서만 리다이렉트를 따라간다. **영상**: CDN 주소(302)를 `{ streamUrl }`로 준다. **오디오**: SR이 302 없이 mp3를 200으로 바로 주므로, `{ streamUrl: "/api/player/kollus-stream-url?playUrl=..." }`를 주고 GET이 서버에서 받아 흘려 준다(Range 전달, 탐색 가능) |

`public/js/vg-controller-client.latest.min.js`는 더 이상 쓰지 않는다 (지워도 되고 둬도 된다).

**content-video가 넘기는 값과의 관계** (사진 확인):
- `videoClip={d_last_path}` → 백엔드가 callUrl에 `t=74.0`으로 넣는다 → 74초부터 시작
- `isSeekable={true}`, `seekableEnd={d_last_path}` → JWT `seek: true`, `seekable_end: 74` → 자유 탐색 (예전과 같음)
- `onVideoProgress={checkAndSendProgress}` → 10% 구간을 넘을 때마다 `(10의 배수, 위치, 길이)`. 같은 구간은 한 번
- `onVideoEnd={sendContentProgressEnd}` → 끝나면 `(100, 위치)`
- `ref={playerRef}` → 항상 객체. 영상 준비 전에는 `getProgress()`가 null, `play`/`pause`는 아무 일 없음 (예전과 같음)

**화면 옵션** (`kollus-player.tsx`의 `DEFAULT_OPTIONS`에서 전체 기본값, 화면마다 `<KollusPlayer options={{ ... }} />`로 덮어쓰기):

| 옵션 | 기본 | 내용 |
|---|---|---|
| `seekBar` | true | 재생바(탐색 바). 끄면 10초 뒤로/앞으로 버튼과 ←/→ 키도 없어진다 |
| `playbackRate` | true | 배속 메뉴 (0.5~2x). JWT `disable_playrate`가 true면 켜도 숨김 |
| `repeat` | true | 구간반복. 첫 번째 누름 = 시작점(A), 두 번째 = 끝점(A-B, 그 사이 반복), 세 번째 = 해제 |

워터마크와 즐겨찾기는 넣지 않았다 (2026-09-27 결정).

**예전과 다른 것:**
- **버튼:** 재생/일시정지, 정지(좁으면 숨김), 10초 뒤로/앞으로, 시간, 재생바, 구간반복, 배속, 음소거, 볼륨(좁으면 숨김), 전체화면, 가운데 큰 재생 버튼. 키보드: 스페이스, ←/→(10초), M, F. 화질 메뉴는 없다 (브라우저가 자동으로 고른다)
- **이어보기:** callUrl의 `t` 또는 `s`(초). 콜러스처럼 처음·끝 10초 안이면 처음부터. 이어보기 팝업은 없다
- **탐색 제한:** JWT `seek`/`seekable_end`(없으면 props)를 플레이어가 직접 지킨다. `seek=false`면 0 ~ max(seekable_end, 이미 본 위치)까지만. 마우스 오른쪽 메뉴(컨트롤 표시, 다운로드)를 막고, 어떤 경로로 옮겨도 제한을 넘으면 되돌린다
- **오디오:** mp3, m4a, 소리만 있는 HLS도 재생하고, 콜러스처럼 남색 바탕에 음표와 가운데 재생 버튼을 띄운다. `AUDIO_IMAGE`에 `public/` 그림 경로를 적으면 그 그림을 띄운다 (`file.kollus.com` 주소는 적지 않는다)
- **자동재생:** 소리 켠 채로 시도하고, 막히면 음소거로, 그것도 막히면 재생 버튼을 보여 주고 기다린다
- **오류:** 재생 오류면 주소를 새로 받아 멈춘 위치부터 이어서 재생 (재생 중이었을 때만 이어서 재생). 연속 3번까지, 30초 정상 재생되면 다시 3번. 복구되는 오류, 자동재생 차단, 전체화면 실패는 `onVideoError`로 알리지 않는다
- **사이트 CSS 영향 없음:** 재생바·음량바는 막대를 직접 그리고 투명한 range를 위에 겹친다. 배속은 `<select>` 대신 직접 그린 목록. 버튼·목록에 기본값을 인라인으로 고정했다 (내부망에서 range 막대가 안 보이고 배속 모양이 깨진 문제, 2026-09-27)
- **HLS 미지원 브라우저(Edge 145 미만):** 안내를 띄우고 `onVideoError(0)` 한 번
- `onPlayerReady`는 영상 메타데이터를 읽은 뒤 한 번 (예전은 컨트롤러 생성 직후). `onVideoPlay`/`onVideoPause`는 상태가 실제로 바뀔 때만
- 콜러스 통계, 이어보기 팝업, 워터마크, 화질 메뉴는 없다

외부망 재현 프로젝트에만 있는 확인용 파일 (내부망에 옮기지 않는다): `app/kollus-direct/page.tsx`(스트림 주소 직접 재생), `app/kollus-player-test/page.tsx`(`kollus-player.tsx`를 content-video와 같은 props로 호출, 옵션 켜고 끄기), `services/player/player-service.ts`(가짜 `postCatenoidPlayUrl`), `type/player/player-type.ts`의 `CatenoidPlayUrlReq`(사진 기준 미러), `public/test-audio-only.m4a`

### 8-4. 외부망에서 확인한 것 (앱 내장 브라우저, Chromium 152)

- 라우트: 콜러스가 아닌 주소·포트 붙은 주소·계정 정보 붙은 주소·잘못된 JSON → 400, 가짜 JWT S링크 → 서버가 실제 `v.kr.kollus.com/sr`을 불러 콜러스 400을 502로 전달 (SR 엔드포인트가 실제로 있음)
- 재생: 공개 HLS 영상 1080p (hls.js 없이), 찰나 mp4, m4a 오디오, 소리만 있는 HLS(AAC). 오디오는 남색 바탕에 음표, 영상은 음표 없음
- `kollus-player.tsx` (content-video와 같은 props, 실제와 같은 모양의 JWT): 74초에서 시작, `onPlayerReady` 한 번 → 재생 → `onVideoPlay` → `onVideoProgress 10%` → 10초 앞/뒤 → 배속 1.5 → M키 음소거/해제 → →키 → 스페이스 일시정지/재생 → `pause()` → `onVideoPause` → `getProgress()` → `play(628)` → `onVideoProgress 90%` → `onVideoEnd 100% 634.6`
- 구간반복: A=75.1, B=78.2 사이를 반복, 해제하면 계속 재생
- 옵션: 재생바, 배속, 구간반복을 끄면 각각 숨겨짐
- 탐색 제한(JWT seek=false, seekable_end=100): 재생바 300 → 100에서 멈춤, 스크립트로 400 → 100으로 되돌림, 40은 이동, 오른쪽 클릭 메뉴 막힘
- 버튼(실제 클릭): 재생, 일시정지, 음소거, 정지, 10초 앞/뒤, 재생바. 재생 중 탐색해도 계속 재생. 전체화면은 요청까지 확인했고, 앱 내장 브라우저가 전체화면을 허용하지 않아 실제 전환은 Edge에서 확인한다
- 여러 관점의 교차 검토(원래 동작과의 차이, React·미디어 수명주기, 서버 라우트)에서 확인된 문제 12건을 모두 고쳤다
- 참고: 테스트 창이 화면에 가려져 있으면 크로미움이 소리 없는(음소거) 영상을 탐색·재생할 때 멈추고, HLS 오류(`DEMUXER_ERROR_COULD_NOT_PARSE`)도 한 번 났다. 창이 보이는 상태에서는 나지 않았고, 나더라도 자동 재시도로 복구된다
- `npm run build`(tsc + next build) 통과, eslint 경고 0개
- 사이트 CSS 흉내(버튼·range·목록 모양을 크게 바꾸는 전역 스타일)를 넣어도 플레이어 버튼, 재생바, 배속 목록 모양이 그대로 (테스트 페이지 버튼은 바뀜)
- 오디오 흘려 주기: 같은 코드로 로컬 m4a 를 흘려 Range 206·구간 내용 일치, 브라우저 재생·음표 표시·재생바 탐색 확인. 가짜 JWT GET 은 콜러스 400 을 그대로 전달
- **내부망 결과 (2026-09-27):** 1차: 영상 재생 됨, 오디오 실패(SR 이 mp3 를 200 으로 줌), 재생바·음량바 막대 안 보임, 배속 모양 깨짐. 2차(고친 파일): **영상, 오디오, 재생바·음량바, 배속, 전체화면 모두 됨.** 오른쪽 아래 "이름(사번)"은 LMS 페이지가 띄우는 것이다

### 8-5. 내부망에서 코드 옮기기 전에 할 확인 3개 (2026-09-27: 1번 통과. location 경로에 `.mp4/.../*.m3u8` 형태 → HLS)

1. **SR링크가 켜져 있는지.** DevTools Elements에서 콜러스 iframe의 src를 복사하고(JWT 만료 전에 바로) 경로 `/s?`만 `/sr?`로 바꾼다. `-L`은 붙이지 않는다.
   ```
   curl -s -D - -o NUL --ssl-no-revoke "https://v.kr.kollus.com/sr?jwt=...&custom_key=...(src 쿼리 그대로)"
   ```
   - 됨: `302`와 `location: https://meritz.lcdn.kollus.com/...` (또는 `ucdn`)
   - 안 됨: 4xx. 이 경우 SR링크가 계정에 꺼져 있는 것이라 코드만으로는 안 된다
2. **재생목록 안 주소가 전부 CDN인지.** 1의 location으로:
   ```
   curl -s --ssl-no-revoke "<1의 location>" | findstr /i "http URI= .m3u8"
   ```
   하위 m3u8 하나에도 똑같이 한다. `#EXT-X-KEY`나 절대 주소에 v.kr/file.kollus.com이 나오면 안 된다
3. **Edge가 HLS를 바로 재생하는지.** 콜러스 iframe이 열린 탭을 모두 닫고 `localhost:3000` 콘솔에서:
   ```
   console.log(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'), navigator.userAgent)
   ```
   `maybe`/`probably`면 된다. 빈 문자열이면 Edge가 145 미만이다

세 가지가 통과하면 8-3의 두 파일을 옮기고 `kollus-player.tsx`를 바꾼다. 재생 후 Network에서 m3u8·세그먼트가 Protocol `http/1.1`, 200, 요청 헤더에 `:authority` 없음이면 정상이다.

### 8-6. 주의

- **LMS 어디에서도 콜러스 iframe을 남기지 않는다.** 다른 탭에 v.kr iframe이 열려 있으면 그 연결에 섞일 수 있다 (Edge가 사이트별로 연결을 나누는지 확인 안 됨).
- **잃는 것:** 콜러스 플레이어 UI(화질 메뉴, 구간반복 등), 콜러스 인사이트 통계, 워터마크, 탐색·배속 제한. 이 기능들을 써야 하는지는 담당자에게 확인한다.
- Node가 게이트에서 TLS 오류(`UNABLE_TO_VERIFY_LEAF_SIGNATURE` 등)를 내면 게이트가 회사 인증서로 가로채는 것이다. 회사 루트 인증서를 `NODE_EXTRA_CA_CERTS`로 지정한다.
- 운영 서버의 Next.js도 `v.kr.kollus.com`에 나갈 수 있어야 한다.
- 채널에 도메인·referer 제한이나 중복 재생 차단이 있어 막히면 헤더를 꾸며 넣지 말고 콜러스에 방법을 묻는다.
