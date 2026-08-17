package com.example.charlla.jsp.config;

import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * charlla-api 모듈 호출용.
 * 이 모듈은 찰나를 직접 호출하지 않는다. API_KEY 도 모른다.
 */
@Configuration
public class RestTemplateConfig {

    /** 조회용. 목록·플레이어URL 같은 짧은 호출. */
    @Bean
    @Primary
    public RestTemplate restTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(3))
                .setReadTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * 업로드 전용.
     *
     * 파일이 이 서버를 거쳐 charlla-api 로 가고, charlla-api 가 다시 찰나 업로드 서버로 보낸다.
     * 그 왕복이 끝날 때까지 기다려야 하므로 조회용 10초로는 어림도 없다.
     * (실측: 4.8MB 영상 한 건에 약 10.6초. 조회용 타임아웃으로 돌리면 1초 차이로 끊긴다)
     */
    @Bean
    public RestTemplate uploadRestTemplate(RestTemplateBuilder builder) {
        return builder
                .setConnectTimeout(Duration.ofSeconds(5))
                .setReadTimeout(Duration.ofMinutes(10))
                .build();
    }
}
