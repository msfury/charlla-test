package com.example.charlla.api.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * 찰나 호출용 HTTP 클라이언트.
 *
 * WebClient 를 쓰다가 RestTemplate 으로 바꿨다. 이유는 두 가지다.
 *
 *   1) 모든 호출이 .block() 이었다. 비동기 이점을 하나도 쓰지 않으면서 복잡도만 떠안고 있었다.
 *   2) 업로드 서버(kollus)가 Transfer-Encoding: chunked 요청을 404 로 거부한다.
 *      WebClient 의 fromMultipartData 는 본문 길이를 몰라 chunked 로 보내서 실패했고,
 *      Content-Length 를 붙이려고 multipart 를 손으로 조립해야 했다.
 *      RestTemplate 의 FormHttpMessageConverter 는 본문을 버퍼링하면서 Content-Length 를
 *      자동으로 채우므로 그 문제가 아예 생기지 않는다.
 *
 * 대가는 업로드 시 파일이 메모리에 올라간다는 것이다. 찰나가 60초 영상만 받으므로 감수한다.
 * (스트리밍하려면 bufferRequestBody=false 인데, 그러면 Content-Length 가 빠져 다시 404 다)
 */
@Configuration
@EnableConfigurationProperties(CharllaProperties.class)
public class RestTemplateConfig {

    /**
     * external-api.charlla.io 전용.
     *
     * 인증은 "API_KEY 와 :(콜론) 을 조합한 후 base64" 다.
     * basicAuthentication(apiKey, "") 가 정확히 base64(apiKey + ":") 를 만든다.
     * 직접 인코딩하지 말 것. 콜론을 빠뜨리면 인증이 깨진다.
     */
    @Bean
    @Primary
    public RestTemplate charllaRestTemplate(RestTemplateBuilder builder, CharllaProperties props) {
        return builder
                .rootUri(props.getBaseUrl())
                .basicAuthentication(props.getApiKey(), "")
                .setConnectTimeout(Duration.ofMillis(props.getHttp().getConnectTimeoutMs()))
                .setReadTimeout(Duration.ofMillis(props.getHttp().getResponseTimeoutMs()))
                .build();
    }

    /**
     * 업로드 / 진행률 전용.
     *
     * uploadUrl, progressUrl 은 응답으로 받은 절대 URL 이라 rootUri 를 붙이면 안 된다.
     * 파일 전송이라 타임아웃도 따로 잡는다.
     */
    @Bean
    public RestTemplate charllaUploadRestTemplate(RestTemplateBuilder builder, CharllaProperties props) {
        return builder
                .basicAuthentication(props.getApiKey(), "")
                .setConnectTimeout(Duration.ofMillis(props.getHttp().getConnectTimeoutMs()))
                .setReadTimeout(Duration.ofMillis(props.getHttp().getUploadTimeoutMs()))
                .build();
    }
}
