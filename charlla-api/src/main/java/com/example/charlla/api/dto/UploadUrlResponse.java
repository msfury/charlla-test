package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/** 2.1 업로드 URL 발급 응답 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class UploadUrlResponse {
    private String uploadFileKey;
    private String uploadUrl;
    private String progressUrl;
    /** 업로드 가능 시각. 발급 후 기본 30분 */
    private String expireTime;
}
