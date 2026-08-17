package com.example.charlla.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/** 화면 모듈(JSP / Next.js)에 내려주는 플레이어 정보 */
@Data
@AllArgsConstructor
public class PlayerUrlDto {
    private String contentDeployKey;
    private String type;
    private String url;
    /** 브릿지에서 postMessage targetOrigin 으로 사용 */
    private String playerOrigin;
}
