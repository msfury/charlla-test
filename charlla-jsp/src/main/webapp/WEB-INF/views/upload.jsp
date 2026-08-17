<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>찰나 영상 업로드 (JSP)</title>
  <style>
    body { font-family: -apple-system, "Malgun Gothic", sans-serif; margin: 24px; }
    h2 { margin-bottom: 4px; }
    .sub { color: #777; font-size: 13px; margin-top: 0; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 18px 20px;
            max-width: 640px; margin-top: 18px; }
    .row { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 13px; font-weight: 600; }
    input[type=text] { padding: 7px 9px; border: 1px solid #ccc; border-radius: 5px;
                       font-size: 14px; width: 100%; box-sizing: border-box; }
    small { color: #888; font-size: 12px; }
    button { padding: 8px 16px; border: 1px solid #333; background: #333; color: #fff;
             border-radius: 5px; font-size: 14px; cursor: pointer; }
    button:disabled { background: #aaa; border-color: #aaa; cursor: default; }
    progress { width: 100%; height: 16px; margin-top: 6px; }
    .log { max-width: 640px; margin-top: 16px; font-size: 13px; }
    .log div { padding: 5px 0; border-bottom: 1px solid #f0f0f0; }
    .ok { color: #197a3d; }
    .err { color: #b3261e; }
    .muted { color: #888; }
    a.btn { display: inline-block; padding: 6px 12px; border: 1px solid #ccc;
            border-radius: 5px; text-decoration: none; color: #333; margin-right: 6px; }
    code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; }
  </style>
</head>
<body>

<h2>찰나 영상 업로드</h2>
<p class="sub">파일은 <code>브라우저 → JSP(8081) → charlla-api(8080) → 찰나 업로드 서버</code> 로 흐른다.</p>
<p><a class="btn" href="contents">콘텐츠 목록</a></p>

<div class="card">
  <form id="uploadForm">
    <div class="row">
      <label for="title">제목</label>
      <input type="text" id="title" maxlength="255" placeholder="예: 연동테스트 영상" required>
      <small>255자까지. 넘으면 찰나가 400 을 준다.</small>
    </div>
    <div class="row">
      <label for="file">영상 파일</label>
      <input type="file" id="file" accept="video/*" required>
      <small>60초 이내. 초과하면 업로드는 되지만 찰나가 EXCESS_DURATION 으로 거부한다.</small>
    </div>
    <button type="submit" id="submitBtn">업로드</button>
    <progress id="bar" max="100" value="0" style="display:none"></progress>
  </form>
</div>

<div class="log" id="log"></div>

<script>
(function () {
  'use strict';

  var MAX_SECONDS = 60;
  var form = document.getElementById('uploadForm');
  var titleEl = document.getElementById('title');
  var fileEl = document.getElementById('file');
  var btn = document.getElementById('submitBtn');
  var bar = document.getElementById('bar');
  var logEl = document.getElementById('log');

  function log(msg, cls) {
    var d = document.createElement('div');
    if (cls) { d.className = cls; }
    d.innerHTML = msg;
    logEl.appendChild(d);
  }

  /** 파일 길이를 브라우저에서 미리 재서 60초 초과를 걸러낸다. */
  function readDuration(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = function () {
        URL.revokeObjectURL(url);
        resolve(v.duration);
      };
      v.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);   // 못 읽으면 통과시키고 서버 판단에 맡긴다
      };
      v.src = url;
    });
  }

  function postFile(title, file) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('title', title);
      fd.append('file', file);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', 'upload');
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          bar.value = Math.round((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (err) { reject(new Error('응답을 해석하지 못했습니다: ' + xhr.responseText)); }
        } else {
          reject(new Error('HTTP ' + xhr.status + ' ' + xhr.responseText));
        }
      };
      xhr.onerror = function () { reject(new Error('네트워크 오류')); };
      xhr.send(fd);
    });
  }

  function getJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      return r.json();
    });
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /** 전송 진행률. 100% 는 전송 완료이지 인코딩 완료가 아니다. */
  function pollTransfer(progressUrl) {
    var tries = 0;
    function step() {
      tries++;
      return getJson('upload-progress?progressUrl=' + encodeURIComponent(progressUrl))
        .then(function (res) {
          var p = res && res.progress != null ? res.progress : 0;
          if (p >= 100 || tries >= 30) {
            log('전송 진행률 ' + p + '%', p >= 100 ? 'ok' : 'muted');
            return p;
          }
          return wait(2000).then(step);   // 분당 60회 제한 때문에 2초
        })
        .catch(function (e) {
          log('진행률 조회 실패: ' + e.message, 'muted');
          return -1;
        });
    }
    return step();
  }

  /** 인코딩이 끝나야 콘텐츠로 조회된다. 콜백을 못 받는 망에서의 대체 경로다. */
  function pollContent(uploadFileKey) {
    var tries = 0;
    function step() {
      tries++;
      return getJson('find-content?uploadFileKey=' + encodeURIComponent(uploadFileKey))
        .then(function (res) {
          var list = (res && res.contents) || [];
          for (var i = 0; i < list.length; i++) {
            if (list[i].uploadFileKey === uploadFileKey) { return list[i]; }
          }
          if (tries >= 40) { return null; }   // 약 2분
          return wait(3000).then(step);
        })
        .catch(function () { return null; });
    }
    return step();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var file = fileEl.files[0];
    var title = titleEl.value.trim();
    if (!file || !title) { return; }

    btn.disabled = true;
    logEl.innerHTML = '';
    bar.value = 0;
    bar.style.display = 'block';

    readDuration(file)
      .then(function (sec) {
        if (sec != null) {
          log('영상 길이 ' + sec.toFixed(1) + '초');
          if (sec > MAX_SECONDS) {
            throw new Error('60초를 넘습니다 (' + sec.toFixed(1) + '초). 찰나가 EXCESS_DURATION 으로 거부합니다.');
          }
        }
        log('업로드 시작: ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)');
        return postFile(title, file);
      })
      .then(function (issued) {
        log('업로드 완료. uploadFileKey = <code>' + issued.uploadFileKey + '</code>', 'ok');
        return pollTransfer(issued.progressUrl).then(function () {
          log('인코딩 대기 중… (완료돼야 목록에 뜬다)', 'muted');
          return pollContent(issued.uploadFileKey);
        });
      })
      .then(function (content) {
        if (content && content.contentDeployKey) {
          var key = content.contentDeployKey;
          log('인코딩 완료. contentDeployKey = <code>' + key + '</code>', 'ok');
          log('<a class="btn" href="player?key=' + key + '&type=shoplayer">shoplayer 로 재생</a>'
            + '<a class="btn" href="player?key=' + key + '&type=displayer">displayer 로 재생</a>');
        } else {
          log('아직 콘텐츠로 조회되지 않습니다. 인코딩이 끝나면 목록에 나타납니다.', 'muted');
          log('<a class="btn" href="contents">콘텐츠 목록에서 확인</a>');
        }
      })
      .catch(function (err) {
        log('실패: ' + err.message, 'err');
      })
      .then(function () {
        btn.disabled = false;
      });
  });
})();
</script>

</body>
</html>
