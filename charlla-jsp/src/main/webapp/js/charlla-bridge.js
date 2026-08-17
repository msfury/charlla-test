/*
 * Charlla Player Bridge (plain JS)
 * Player Web Interface v1.2.0 기준
 *
 * 찰나 플레이어는 iframe + postMessage 로 제어한다.
 * 이 파일은 <script src> 로 읽히므로 ES 모듈 문법을 쓰지 않는다.
 *
 * 사용:
 *   var bridge = createCharllaBridge(iframeEl, 'contentDeployKey', 'https://player.charlla.io');
 *   bridge.on('load', function () { ... });
 *   bridge.send('play');
 */
(function (global) {
  'use strict';

  /** App → Player 로 보낼 수 있는 액션 */
  var IN_ACTIONS = ['play', 'pause', 'seek', 'mute', 'pip', 'mini', 'like', 'banner'];
  /** Player → App 으로 올라오는 액션 */
  var OUT_ACTIONS = ['load', 'play', 'pause', 'end', 'open', 'share', 'like'];

  function createCharllaBridge(iframeEl, contentKey, playerOrigin) {
    if (!iframeEl) {
      throw new Error('createCharllaBridge: iframe 엘리먼트가 필요합니다.');
    }

    var handlers = {};
    var ready = false;
    var origin = playerOrigin || '*';

    /*
     * 재생 중인 콘텐츠 키.
     *
     * URL 로 CDK 를 확정할 수 있는 건 displayer(/{cdk})와 shoplayer(/shoplayer/{cdk})뿐이다.
     * list 계열은 URL 로 알 수 없고 load(out).payload.key 로만 확인된다.
     * 그래서 처음엔 넘겨받은 키로 시작하고, load 를 받으면 그 값으로 갱신한다.
     */
    var currentKey = contentKey;

    function send(action, payload) {
      if (!iframeEl.contentWindow) {
        return false;
      }
      var body = { key: currentKey };
      if (payload) {
        for (var k in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, k)) {
            body[k] = payload[k];
          }
        }
      }
      iframeEl.contentWindow.postMessage(
        JSON.stringify({ action: action, payload: body }), origin);
      return true;
    }

    function onMessage(e) {
      // origin 검증. 이게 없으면 아무 사이트나 우리 페이지에 메시지를 던질 수 있다.
      if (origin !== '*' && e.origin !== origin) {
        return;
      }
      var data;
      try {
        data = JSON.parse(e.data);
      } catch (err) {
        return;   // 브라우저 확장/외부 스크립트가 던지는 메시지는 무시
      }
      if (!data || !data.action) {
        return;
      }
      if (data.action === 'load') {
        ready = true;
        if (data.payload && data.payload.key) {
          currentKey = data.payload.key;   // list 계열에서는 이게 정답이다
        }
      }
      dispatch(data.action, data);
      dispatch('*', data);
    }

    function dispatch(key, data) {
      var list = handlers[key];
      if (!list) {
        return;
      }
      for (var i = 0; i < list.length; i++) {
        try {
          list[i](data.payload, data);
        } catch (err) {
          if (global.console) {
            global.console.error('[charlla-bridge] handler error', err);
          }
        }
      }
    }

    global.addEventListener('message', onMessage);

    return {
      send: send,
      on: function (action, fn) {
        if (!handlers[action]) {
          handlers[action] = [];
        }
        handlers[action].push(fn);
        return this;
      },
      isReady: function () {
        return ready;
      },
      /** 실제로 전송에 쓰이는 키. load 를 받았다면 그 값이다. */
      getKey: function () {
        return currentKey;
      },
      /** 화면을 벗어날 때 반드시 호출. 안 하면 리스너가 쌓인다. */
      destroy: function () {
        global.removeEventListener('message', onMessage);
        handlers = {};
        ready = false;
      },

      // ---- 편의 래퍼 ----
      play: function () { return send('play'); },
      pause: function () { return send('pause'); },
      seek: function (sec) { return send('seek', { time: sec }); },
      mute: function (on) { return send('mute', { mode: on ? 'on' : 'off' }); },
      pip: function (on) { return send('pip', { mode: on ? 'on' : 'off' }); },
      mini: function (on) { return send('mini', { mode: on ? 'on' : 'off' }); },
      like: function (status) { return send('like', { status: !!status }); },
      banner: function (title, data) { return send('banner', { title: title, data: data }); }
    };
  }

  global.createCharllaBridge = createCharllaBridge;
  global.CHARLLA_IN_ACTIONS = IN_ACTIONS;
  global.CHARLLA_OUT_ACTIONS = OUT_ACTIONS;

  // Node(테스트) 환경에서도 쓸 수 있게
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCharllaBridge: createCharllaBridge };
  }
})(typeof window !== 'undefined' ? window : globalThis);
