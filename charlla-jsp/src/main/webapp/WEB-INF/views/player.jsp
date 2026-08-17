<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>찰나 플레이어 테스트 (JSP)</title>
  <style>
    body { font-family: -apple-system, "Malgun Gothic", sans-serif; margin: 24px; }
    .wrap { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
    iframe { border: 1px solid #ddd; border-radius: 8px; }
    .panel { min-width: 380px; }
    .meta { font-size: 13px; color: #666; margin-bottom: 12px; word-break: break-all; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    button { padding: 8px 14px; border: 1px solid #ccc; background: #fff;
             border-radius: 6px; cursor: pointer; font-size: 14px; }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button:not(:disabled):hover { background: #f5f5f5; }
    #log { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px;
           height: 320px; overflow: auto; font-size: 12px; white-space: pre-wrap;
           font-family: Consolas, Menlo, monospace; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px;
             font-size: 12px; background: #eee; }
    .badge.on { background: #d1f0d1; }
  </style>
</head>
<body>

<h2>찰나 플레이어 테스트 <span class="badge">JSP</span></h2>

<div class="meta">
  key: <b>${contentKey}</b> / type: <b>${playerType}</b><br>
  url: ${playerUrl}
</div>

<div class="wrap">
  <iframe id="charlla-player"
          src="${playerUrl}"
          width="360" height="640"
          allow="autoplay; clipboard-write; web-share; picture-in-picture; fullscreen"
          referrerpolicy="origin"></iframe>

  <div class="panel">
    <div>상태: <span id="status" class="badge">로드 대기중…</span></div>

    <div class="controls" id="controls">
      <button data-act="play">재생</button>
      <button data-act="pause">일시정지</button>
      <button data-act="seek" data-time="10">10초로 이동</button>
      <button data-act="mute" data-mode="on">음소거</button>
      <button data-act="mute" data-mode="off">음소거 해제</button>
      <button data-act="pip" data-mode="on">PIP 켜기</button>
      <button data-act="pip" data-mode="off">PIP 끄기</button>
      <button data-act="mini" data-mode="on">미니 켜기</button>
      <button data-act="mini" data-mode="off">미니 끄기</button>
      <button data-act="like" data-status="true">좋아요</button>
      <button data-act="like" data-status="false">좋아요 해제</button>
      <button id="btn-banner">배너 주입</button>
      <button id="btn-clear">로그 지우기</button>
    </div>

    <div id="log"></div>
  </div>
</div>

<script src="<%= request.getContextPath() %>/js/charlla-bridge.js"></script>
<script>
  (function () {
    var CONTENT_KEY = '${contentKey}';
    var PLAYER_ORIGIN = '${playerOrigin}';

    var frame = document.getElementById('charlla-player');
    var logEl = document.getElementById('log');
    var statusEl = document.getElementById('status');

    var bridge = createCharllaBridge(frame, CONTENT_KEY, PLAYER_ORIGIN);

    function print(dir, text) {
      var t = new Date().toISOString().substr(11, 12);
      logEl.textContent += '[' + t + '] ' + dir + ' ' + text + '\n';
      logEl.scrollTop = logEl.scrollHeight;
    }

    function setEnabled(on) {
      var buttons = document.querySelectorAll('#controls button[data-act]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].disabled = !on;
      }
      statusEl.textContent = on ? 'load 수신 완료' : '로드 대기중…';
      statusEl.className = on ? 'badge on' : 'badge';
    }

    // 플레이어 → 페이지
    bridge.on('*', function (payload, msg) {
      print('◀', JSON.stringify(msg));
    });
    bridge.on('load', function (p) {
      // load 를 받기 전에 보낸 메시지는 유실된다. 여기서 버튼을 연다.
      setEnabled(true);
      print('  ', '→ 로드 완료: ' + p.title + ' (' + p.type + ')');
    });
    bridge.on('end', function (p) {
      print('  ', '→ 재생 종료: ' + p.time + '초');
    });
    // 공식 샘플은 url(open 은 target 도)을 읽는다. 문서에는 link 로 적혀 있어 둘 다 본다.
    bridge.on('open', function (p) {
      print('  ', '→ 배너 클릭: ' + (p.url || p.link)
        + (p.target ? ' (target=' + p.target + ')' : ''));
    });
    bridge.on('share', function (p) {
      print('  ', '→ 공유 클릭: ' + (p.url || p.link));
    });

    // 페이지 → 플레이어
    var buttons = document.querySelectorAll('#controls button[data-act]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.disabled = true;
        btn.onclick = function () {
          var act = btn.getAttribute('data-act');
          var payload = {};
          if (btn.getAttribute('data-time')) {
            payload.time = Number(btn.getAttribute('data-time'));
          }
          if (btn.getAttribute('data-mode')) {
            payload.mode = btn.getAttribute('data-mode');
          }
          if (btn.getAttribute('data-status')) {
            payload.status = btn.getAttribute('data-status') === 'true';
          }
          bridge.send(act, payload);
          print('▶', JSON.stringify({ action: act, payload: payload }));
        };
      })(buttons[i]);
    }

    document.getElementById('btn-banner').onclick = function () {
      var data = [{
        type: 'product',
        title: '테스트 상품',
        url: 'https://example.com/product/1',
        image: 'https://picsum.photos/200/200',
        price: 19900,
        discount_rate: 10,
        currency_code: '￦'
      }];
      bridge.banner('상품 정보', data);
      print('▶', JSON.stringify({ action: 'banner', data: data }));
    };

    document.getElementById('btn-clear').onclick = function () {
      logEl.textContent = '';
    };

    window.addEventListener('beforeunload', function () {
      bridge.destroy();
    });

    print('  ', 'origin=' + PLAYER_ORIGIN + ' 로 대기중. load 액션을 기다립니다.');
  })();
</script>

</body>
</html>
