package com.example.charlla.jsp;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collections;
import java.util.Map;

/**
 * 브라우저가 아니라 이 서버가 charlla-api 를 호출한다. 덕분에 CORS 설정이 아예 필요 없다.
 *
 * 업로드도 마찬가지다. 파일 바이트는
 *   브라우저 → charlla-jsp(8081) → charlla-api(8080) → 업로드 서버
 * 순으로 흐른다. 브라우저가 외부 업로드 서버로 직접 나가지 못하는 내부망을 전제한 구조다.
 * 브라우저가 알아야 하는 주소는 8081 하나뿐이다.
 */
@Slf4j
@Controller
public class PlayerViewController {

    private final RestTemplate restTemplate;
    /** 업로드는 파일 전송이라 조회용과 타임아웃이 다르다. (RestTemplateConfig 참고) */
    private final RestTemplate uploadRestTemplate;

    /**
     * @Qualifier 를 반드시 붙일 것.
     * RestTemplate 빈이 둘이고 조회용이 @Primary 라서, 이름만 맞춰서는 업로드용이 주입되지 않는다.
     * Spring 은 후보가 여럿일 때 @Primary 를 파라미터 이름 매칭보다 먼저 적용한다.
     * 실제로 이것 때문에 업로드가 10초에서 Read timed out 으로 끊겼다.
     */
    public PlayerViewController(RestTemplate restTemplate,
                                @Qualifier("uploadRestTemplate") RestTemplate uploadRestTemplate) {
        this.restTemplate = restTemplate;
        this.uploadRestTemplate = uploadRestTemplate;
    }

    @Value("${charlla.api-base-url}")
    private String apiBaseUrl;

    /** 업로드된 콘텐츠 목록 */
    @GetMapping({"/", "/contents"})
    public String contents(Model model) {
        try {
            Map<?, ?> res = restTemplate.getForObject(apiBaseUrl + "/api/contents", Map.class);
            Object contents = res == null ? null : res.get("contents");
            model.addAttribute("contents", contents == null ? Collections.emptyList() : contents);
        } catch (Exception e) {
            log.error("콘텐츠 목록 조회 실패", e);
            model.addAttribute("contents", Collections.emptyList());
            model.addAttribute("error", "charlla-api(" + apiBaseUrl + ") 호출에 실패했습니다: " + e.getMessage());
        }
        return "contents";
    }

    /** 업로드 화면 */
    @GetMapping("/upload")
    public String uploadForm() {
        return "upload";
    }

    /**
     * 파일 업로드. 받은 파일을 그대로 charlla-api 로 넘긴다.
     * getResource() 를 쓰므로 파일을 byte[] 로 읽지 않는다.
     */
    @PostMapping("/upload")
    @ResponseBody
    public Map<?, ?> upload(@RequestParam String title,
                            @RequestParam("file") MultipartFile file) {

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("title", title);
        body.add("file", file.getResource());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        return uploadRestTemplate.postForObject(
                apiBaseUrl + "/api/upload", new HttpEntity<>(body, headers), Map.class);
    }

    /** 전송 진행률(0~100). 100% 는 "전송 완료"이지 "인코딩 완료"가 아니다. */
    @GetMapping("/upload-progress")
    @ResponseBody
    public Map<?, ?> uploadProgress(@RequestParam String progressUrl) {
        return restTemplate.getForObject(
                apiBaseUrl + "/api/upload-progress?progressUrl={u}", Map.class, progressUrl);
    }

    /** 업로드 파일키로 콘텐츠를 찾는다. 인코딩이 끝났는지 화면에서 확인하는 용도. */
    @GetMapping("/find-content")
    @ResponseBody
    public Map<?, ?> findContent(@RequestParam String uploadFileKey) {
        try {
            Map<?, ?> res = restTemplate.getForObject(
                    apiBaseUrl + "/api/contents?keyword={k}", Map.class, uploadFileKey);
            Object contents = res == null ? null : res.get("contents");
            return Collections.singletonMap("contents",
                    contents == null ? Collections.emptyList() : contents);
        } catch (Exception e) {
            log.error("콘텐츠 조회 실패", e);
            return Collections.singletonMap("contents", Collections.emptyList());
        }
    }

    /** 플레이어 화면 */
    @GetMapping("/player")
    public String player(@RequestParam String key,
                         @RequestParam(required = false, defaultValue = "shoplayer") String type,
                         Model model) {

        Map<?, ?> res = restTemplate.getForObject(
                apiBaseUrl + "/api/player-url?key={key}&type={type}", Map.class, key, type);

        if (res == null) {
            throw new IllegalStateException("플레이어 URL 조회 실패");
        }

        model.addAttribute("playerUrl", res.get("url"));
        model.addAttribute("playerOrigin", res.get("playerOrigin"));
        model.addAttribute("contentKey", res.get("contentDeployKey"));
        model.addAttribute("playerType", res.get("type"));
        return "player";
    }
}
