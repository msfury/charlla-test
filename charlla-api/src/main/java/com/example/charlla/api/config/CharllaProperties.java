package com.example.charlla.api.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Positive;

@Data
@Validated
@ConfigurationProperties(prefix = "charlla")
public class CharllaProperties {

    /** 찰나에서 발급받은 API KEY. Basic 인증에 사용 */
    @NotBlank
    private String apiKey;

    /** external-api.charlla.io */
    @NotBlank
    private String baseUrl;

    /** player.charlla.io */
    @NotBlank
    private String playerUrl;

    private Http http = new Http();
    private Upload upload = new Upload();
    private Player player = new Player();

    @Data
    public static class Http {
        @Positive private int connectTimeoutMs = 3000;
        @Positive private int responseTimeoutMs = 30000;
        /** 업로드는 파일 전송이라 훨씬 길게 */
        @Positive private int uploadTimeoutMs = 600000;
    }

    @Data
    public static class Upload {
        /**
         * 진행률 폴링 간격.
         * 정의서 권장은 "1초 이상" 이지만 호출 제한이 분당 60회라
         * 1초로 두면 이 API 하나로 한도를 다 쓴다. 기본 2초.
         */
        @Positive private int progressPollIntervalMs = 2000;
        @Positive private int progressTimeoutMs = 300000;
        /** 찰나 제약: 60초 이내 영상만 업로드 가능 */
        @Positive private int maxDurationSeconds = 60;
    }

    @Data
    public static class Player {
        /** 기본 플레이어 타입: displayer | shoplayer | playlist */
        private String defaultType = "shoplayer";
        /** 배너를 banner 액션으로 주입할지 */
        private boolean customBanner = true;
        /** 배너 클릭을 open 액션으로 받을지 */
        private boolean bannerLinkExternal = true;
        /** 공유 클릭을 share 액션으로 받을지 */
        private boolean shareExternal = true;
        /** 배너 이미지 오류 시 대체 이미지 (비우면 미사용) */
        private String bannerDefaultImage;
    }
}
