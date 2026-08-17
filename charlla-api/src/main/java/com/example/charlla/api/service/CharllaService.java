package com.example.charlla.api.service;

import com.example.charlla.api.config.CharllaProperties;
import com.example.charlla.api.dto.AccountDto;
import com.example.charlla.api.dto.CharllaResponse;
import com.example.charlla.api.dto.ContentDto;
import com.example.charlla.api.dto.ContentListDto;
import com.example.charlla.api.dto.DeleteResultDto;
import com.example.charlla.api.dto.PlayerUrlDto;
import com.example.charlla.api.dto.UploadProgress;
import com.example.charlla.api.dto.UploadResult;
import com.example.charlla.api.dto.UploadUrlResponse;
import com.example.charlla.api.exception.CharllaApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.File;
import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.IntConsumer;

/**
 * 찰나 연동 API 전부를 담는 단일 서비스.
 *
 * 기준 문서는 swagger 다: https://external-api.charlla.io/api-docs
 * 정의서 PDF v0.2 와 어긋나는 곳이 여러 군데라, 충돌하면 swagger 와 실측을 따른다.
 *
 * 구성
 *   1. 계정      GET /account, PUT /account/callback
 *   2. 업로드    POST /upload-url → POST {uploadUrl} → GET {progressUrl}
 *   3. 콘텐츠    GET /contents, GET·DELETE /contents/{contentDeployKey}
 *   4. 플레이어  URL 조립 (찰나 호출 없음. 화면 두 벌이 같은 URL 을 쓰게 하는 단일 지점)
 */
@Slf4j
@Service
public class CharllaService {

    /** swagger CreateUploadDto: title 은 1~255자 */
    private static final int TITLE_MAX_LENGTH = 255;

    /** 업로드 파일 파트명. 바꾸면 안 된다. */
    static final String PART_FILE = "upload-file";
    /** accept 파트는 필수다. 빠지면 업로드가 실패한다. */
    static final String PART_ACCEPT = "accept";

    private static final List<String> ALLOWED_PLAYER_TYPES =
            Arrays.asList("displayer", "shoplayer", "playlist");

    private final RestTemplate charlla;
    private final RestTemplate upload;
    private final CharllaProperties props;

    public CharllaService(RestTemplate charllaRestTemplate,
                          @Qualifier("charllaUploadRestTemplate") RestTemplate charllaUploadRestTemplate,
                          CharllaProperties props) {
        this.charlla = charllaRestTemplate;
        this.upload = charllaUploadRestTemplate;
        this.props = props;
    }

    /* ══════════════════ 1. 계정 ══════════════════ */

    /**
     * 계정 정보 조회. 연동 확인의 첫 관문이다.
     *
     * 관문 판정은 serviceName 이 아니라 callbackUrl 로 한다.
     * swagger AccountDto 의 required 는 callbackUrl 뿐이고, 실서버도 serviceName 을 주지 않는다.
     * (정의서는 serviceName 을 필수로 적어 두었다. 그대로 믿으면 정상 연동을 실패로 오판한다.)
     */
    public AccountDto getAccount() {
        CharllaResponse<AccountDto> res = ErrorMapper.call("계정 조회 실패", () ->
                charlla.exchange("/account", HttpMethod.GET, null,
                        new ParameterizedTypeReference<CharllaResponse<AccountDto>>() {}).getBody());

        if (res == null || res.getData() == null) {
            throw new CharllaApiException("계정 응답이 비어 있습니다.");
        }
        return res.getData();
    }

    /** 콜백 URL 수정. HTTPS 를 권장한다. */
    public AccountDto updateCallbackUrl(String callbackUrl) {
        if (callbackUrl == null || callbackUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("callbackUrl 은 필수입니다.");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> req =
                new HttpEntity<>(Collections.singletonMap("callbackUrl", callbackUrl), headers);

        CharllaResponse<AccountDto> res = ErrorMapper.call("콜백 URL 수정 실패", () ->
                charlla.exchange("/account/callback", HttpMethod.PUT, req,
                        new ParameterizedTypeReference<CharllaResponse<AccountDto>>() {}).getBody());

        if (res == null || res.getData() == null) {
            throw new CharllaApiException("콜백 URL 수정 응답이 비어 있습니다.");
        }
        return res.getData();
    }

    /* ══════════════════ 2. 업로드 ══════════════════ */

    /** 업로드 URL 발급. 발급 후 30분 안에 업로드를 마쳐야 한다. */
    public UploadUrlResponse createUploadUrl(String title) {
        if (title == null || title.trim().isEmpty()) {
            throw new IllegalArgumentException("title 은 필수입니다.");
        }
        // swagger CreateUploadDto 제약. 넘기면 찰나가 400 을 준다.
        if (title.length() > TITLE_MAX_LENGTH) {
            throw new IllegalArgumentException(
                    "title 은 " + TITLE_MAX_LENGTH + "자를 넘을 수 없습니다. 현재 " + title.length() + "자");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, String>> req =
                new HttpEntity<>(Collections.singletonMap("title", title), headers);

        CharllaResponse<UploadUrlResponse> res = ErrorMapper.call("업로드 URL 발급 실패", () ->
                charlla.exchange("/upload-url", HttpMethod.POST, req,
                        new ParameterizedTypeReference<CharllaResponse<UploadUrlResponse>>() {}).getBody());

        UploadUrlResponse data = res == null ? null : res.getData();
        if (data == null || data.getUploadUrl() == null) {
            throw new CharllaApiException("업로드 URL 발급 응답이 비어 있습니다.");
        }
        log.info("[CHARLLA] 업로드 URL 발급 완료. uploadFileKey={}, expireTime={}",
                data.getUploadFileKey(), data.getExpireTime());
        return data;
    }

    /** 파일 업로드. uploadUrl 은 발급받은 절대 URL 이다. */
    public UploadResult uploadFile(String uploadUrl, File file) {
        return uploadFile(uploadUrl, new FileSystemResource(file));
    }

    /**
     * 파일 업로드.
     *
     * 업로드 서버(upload.kr.kollus.com)는 Transfer-Encoding: chunked 요청을 404 로 거부한다.
     * RestTemplate 의 FormHttpMessageConverter 는 본문을 버퍼링하면서 Content-Length 를
     * 자동으로 채우므로 그냥 두면 된다. bufferRequestBody 를 끄지 말 것 — 끄는 순간 chunked 가 되어 404 다.
     */
    public UploadResult uploadFile(String uploadUrl, Resource fileResource) {
        MultiValueMap<String, Object> parts = new LinkedMultiValueMap<>();
        parts.add(PART_FILE, fileResource);
        parts.add(PART_ACCEPT, MediaType.APPLICATION_JSON_VALUE);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        UploadResult result = ErrorMapper.call("파일 업로드 실패", () ->
                upload.postForObject(URI.create(uploadUrl),
                        new HttpEntity<>(parts, headers), UploadResult.class));

        // HTTP 200 이어도 error != 0 이면 실패다. 상태코드만 보면 뚫린다.
        if (result == null || !result.isSuccess()) {
            String msg = result == null ? "응답 없음" : result.getMessage();
            throw new CharllaApiException("업로드 실패: " + msg);
        }
        log.info("[CHARLLA] 파일 업로드 완료");
        return result;
    }

    /**
     * 업로드 URL 발급 + 파일 전송을 한 번에. 진행률은 기다리지 않는다.
     * 화면 업로드 경로가 이걸 쓴다.
     */
    public UploadUrlResponse upload(String title, Resource fileResource) {
        UploadUrlResponse issued = createUploadUrl(title);
        uploadFile(issued.getUploadUrl(), fileResource);
        return issued;
    }

    /** 진행률 조회 (0~100) */
    public int getProgress(String progressUrl) {
        UploadProgress progress = ErrorMapper.call("진행률 조회 실패", () ->
                upload.getForObject(URI.create(progressUrl), UploadProgress.class));

        return progress == null ? 0 : progress.progressOrZero();
    }

    /**
     * 발급 → 업로드 → 진행률 100% 까지 한 번에.
     *
     * 주의: 여기의 100% 는 "전송 완료"이지 "인코딩 완료"가 아니다.
     * 인코딩이 끝나야 콘텐츠로 조회된다. 완료 통보는 콜백으로 오고,
     * 콜백을 받을 수 없는 망이면 findByUploadFileKey 폴링이 대체 경로다.
     *
     * @param onProgress 진행률 콜백 (null 허용)
     */
    public UploadUrlResponse uploadAndWait(String title, File file, IntConsumer onProgress) {
        UploadUrlResponse issued = createUploadUrl(title);
        uploadFile(issued.getUploadUrl(), file);

        long deadline = System.currentTimeMillis() + props.getUpload().getProgressTimeoutMs();
        int last = -1;

        while (System.currentTimeMillis() < deadline) {
            int progress = getProgress(issued.getProgressUrl());
            if (progress != last) {
                last = progress;
                if (onProgress != null) {
                    onProgress.accept(progress);
                }
            }
            if (progress >= 100) {
                return issued;
            }
            sleep(props.getUpload().getProgressPollIntervalMs());
        }
        throw new CharllaApiException(
                "업로드 진행률이 시간 내 100%에 도달하지 않았습니다. 마지막 진행률=" + last);
    }

    /* ══════════════════ 3. 콘텐츠 ══════════════════ */

    /**
     * 콘텐츠 조회.
     *
     * sort / order 의 의미가 정의서와 swagger 가 서로 반대다. swagger 와 실서버 응답을 따른다.
     *   sort  = 정렬 기준 (title | createdAt)   기본 createdAt
     *   order = 정렬 순서 (asc | desc)          기본 desc
     * 정의서 PDF 는 이 둘을 뒤집어 적어 두었으니 그대로 옮기지 말 것.
     */
    public ContentListDto searchContents(String keyword, String start, String end,
                                         Integer page, Integer perPage, String sort, String order) {

        // 완성된 URI 를 직접 만들어 넘긴다.
        // 상대경로 + URI 템플릿 변수 조합으로 하면 {perPage} 가 치환되지 않고 그대로 나가,
        // 숫자 파라미터에서 찰나가 400 을 준다. (문자열인 keyword 는 검색어로 먹혀 200 이라 더 헷갈린다)
        UriComponentsBuilder b = UriComponentsBuilder
                .fromHttpUrl(props.getBaseUrl())
                .path("/contents");

        if (keyword != null && !keyword.isEmpty()) b.queryParam("keyword", keyword);
        if (start != null && !start.isEmpty()) b.queryParam("start", start);
        if (end != null && !end.isEmpty()) b.queryParam("end", end);
        if (page != null) b.queryParam("page", page);
        if (perPage != null) b.queryParam("perPage", perPage);
        if (sort != null && !sort.isEmpty()) b.queryParam("sort", sort);
        if (order != null && !order.isEmpty()) b.queryParam("order", order);

        URI uri = b.build().encode().toUri();

        CharllaResponse<ContentListDto> res = ErrorMapper.call("콘텐츠 조회 실패", () ->
                charlla.exchange(uri, HttpMethod.GET, null,
                        new ParameterizedTypeReference<CharllaResponse<ContentListDto>>() {}).getBody());

        return res == null || res.getData() == null ? new ContentListDto() : res.getData();
    }

    public ContentListDto findAllContents() {
        return searchContents(null, null, null, null, null, null, null);
    }

    /**
     * 배포키로 단건 조회.
     *
     * swagger 는 data 가 ContentResponseDto 평면 구조라고 기술한다.
     * 정의서 PDF 는 content.* 로 표기했지만 그건 필드 경로 표기였던 것으로 보인다.
     * 실서버에 콘텐츠가 없어 아직 실측하지 못했다 — 콘텐츠가 생기면 여기부터 확인할 것.
     */
    public ContentDto getContent(String contentDeployKey) {
        CharllaResponse<ContentDto> res = ErrorMapper.call("콘텐츠 단건 조회 실패", () ->
                charlla.exchange("/contents/{key}", HttpMethod.GET, null,
                        new ParameterizedTypeReference<CharllaResponse<ContentDto>>() {},
                        contentDeployKey).getBody());

        if (res == null || res.getData() == null || res.getData().getContentDeployKey() == null) {
            throw new CharllaApiException("콘텐츠를 찾을 수 없습니다: " + contentDeployKey);
        }
        return res.getData();
    }

    /** 배포키로 삭제. 응답 status 는 APPROVED | REJECTED | COMPLETED | FAILED. */
    public DeleteResultDto deleteContent(String contentDeployKey) {
        CharllaResponse<DeleteResultDto> res = ErrorMapper.call("콘텐츠 삭제 실패", () ->
                charlla.exchange("/contents/{key}", HttpMethod.DELETE, null,
                        new ParameterizedTypeReference<CharllaResponse<DeleteResultDto>>() {},
                        contentDeployKey).getBody());

        if (res == null || res.getData() == null) {
            throw new CharllaApiException("삭제 응답이 비어 있습니다: " + contentDeployKey);
        }
        return res.getData();
    }

    /**
     * 업로드 파일키로 콘텐츠를 찾는다.
     * 콜백을 받을 수 없는 망에서 업로드 결과를 확인하는 경로다.
     * keyword 는 타이틀 / 배포키 / 업로드 파일키를 검색한다.
     */
    public Optional<ContentDto> findByUploadFileKey(String uploadFileKey) {
        return searchContents(uploadFileKey, null, null, null, null, null, null)
                .getContents().stream()
                .filter(c -> uploadFileKey.equals(c.getUploadFileKey()))
                .findFirst();
    }

    /* ══════════════════ 4. 플레이어 URL ══════════════════ */

    /**
     * 플레이어 URL 조립. 찰나를 호출하지 않는다.
     *
     * JSP 와 Next.js 가 각자 조립하면 쿼리 옵션이 갈라지므로 여기에서만 만든다.
     * 옵션은 Player Web Interface v1.1.0+ 의 URL query config 다.
     *
     * 경로 규칙은 타입마다 다르다. 찰나 공식 샘플(postmessage-new.html)의 CDK 획득 규칙 기준:
     *   displayer  →  /{cdk}                 ← 타입 세그먼트가 붙지 않는다
     *   shoplayer  →  /shoplayer/{cdk}
     *   playlist   →  /shoplayer/list/{cdk}  ← 샘플 기본 URL 기준
     *
     * 셋을 전부 /{type}/{cdk} 로 만들면 displayer 가 열리지 않는다.
     *
     * playlist 는 "URL 로는 CDK 를 확정할 수 없는" 계열이다.
     * 재생 중인 콘텐츠 키는 load(out).payload.key 로 오므로 브릿지가 그 값으로 갱신해야 한다.
     */
    public PlayerUrlDto buildPlayerUrl(String contentDeployKey, String type) {
        if (contentDeployKey == null || contentDeployKey.trim().isEmpty()) {
            throw new IllegalArgumentException("contentDeployKey 는 필수입니다.");
        }

        String resolvedType = (type == null || type.trim().isEmpty())
                ? props.getPlayer().getDefaultType()
                : type.trim();

        if (!ALLOWED_PLAYER_TYPES.contains(resolvedType)) {
            throw new IllegalArgumentException(
                    "지원하지 않는 플레이어 타입: " + resolvedType + " (가능: " + ALLOWED_PLAYER_TYPES + ")");
        }

        CharllaProperties.Player p = props.getPlayer();

        UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(props.getPlayerUrl());

        if ("displayer".equals(resolvedType)) {
            builder.pathSegment(contentDeployKey);
        } else if ("playlist".equals(resolvedType)) {
            builder.pathSegment("shoplayer", "list", contentDeployKey);
        } else {
            builder.pathSegment("shoplayer", contentDeployKey);
        }

        builder.queryParam("customBanner", p.isCustomBanner())
                .queryParam("bannerLinkExternal", p.isBannerLinkExternal())
                .queryParam("shareExternal", p.isShareExternal());

        if (p.getBannerDefaultImage() != null && !p.getBannerDefaultImage().isEmpty()) {
            builder.queryParam("bannerDefaultImage", p.getBannerDefaultImage());
        }

        return new PlayerUrlDto(contentDeployKey, resolvedType,
                builder.build().toUriString(), playerOrigin());
    }

    /**
     * postMessage targetOrigin 으로 쓸 오리진.
     * 브릿지에서 '*' 대신 이 값을 써야 아무 사이트나 메시지를 던지지 못한다.
     */
    public String playerOrigin() {
        URI uri = URI.create(props.getPlayerUrl());
        String origin = uri.getScheme() + "://" + uri.getHost();
        if (uri.getPort() != -1) {
            origin = origin + ":" + uri.getPort();
        }
        return origin;
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CharllaApiException("업로드 대기 중 인터럽트", e);
        }
    }
}
