<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ page import="java.util.List, java.util.Map" %>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>찰나 콘텐츠 목록 (JSP)</title>
  <style>
    body { font-family: -apple-system, "Malgun Gothic", sans-serif; margin: 24px; }
    table { border-collapse: collapse; width: 100%; max-width: 1100px; }
    th, td { border: 1px solid #ddd; padding: 8px 10px; font-size: 14px; text-align: left; }
    th { background: #fafafa; }
    a.btn { display: inline-block; padding: 5px 10px; border: 1px solid #ccc;
            border-radius: 5px; text-decoration: none; color: #333; }
    .err { background: #ffecec; border: 1px solid #ffb3b3; padding: 12px;
           border-radius: 6px; margin-bottom: 16px; }
    .empty { color: #888; }
  </style>
</head>
<body>

<h2>찰나 콘텐츠 목록</h2>

<p><a class="btn" href="upload">+ 영상 업로드</a></p>

<% if (request.getAttribute("error") != null) { %>
  <div class="err"><%= request.getAttribute("error") %></div>
<% } %>

<%
  List<Map<String, Object>> contents = (List<Map<String, Object>>) request.getAttribute("contents");
  if (contents == null || contents.isEmpty()) {
%>
  <p class="empty">
    업로드된 콘텐츠가 없습니다. <a href="upload">영상 업로드</a> 에서 올려 주세요.
    <br>
    업로드는 성공했는데 목록이 비어 있다면 인코딩이 끝나지 않은 것입니다.
  </p>
<%
  } else {
%>
<table>
  <thead>
    <tr>
      <th>제목</th><th>배포키</th><th>크기</th><th>업로드 일시</th><th>재생</th>
    </tr>
  </thead>
  <tbody>
<%
    for (Map<String, Object> c : contents) {
      String key = String.valueOf(c.get("contentDeployKey"));
%>
    <tr>
      <td><%= c.get("title") %></td>
      <td><code><%= key %></code></td>
      <td><%= c.get("width") %>x<%= c.get("height") %></td>
      <td><%= c.get("createdAt") %></td>
      <td>
        <a class="btn" href="player?key=<%= key %>&type=shoplayer">shoplayer</a>
        <a class="btn" href="player?key=<%= key %>&type=displayer">displayer</a>
      </td>
    </tr>
<%
    }
%>
  </tbody>
</table>
<%
  }
%>

</body>
</html>
