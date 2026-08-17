package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 2.2 콘텐츠 업로드 응답.
 * 주의: 업로드 서버는 공통 래퍼(data)를 쓰지 않고 이 형태로 바로 응답한다.
 * HTTP 200 이어도 error != 0 이면 실패다.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class UploadResult {
    /** 0: 정상, 1: 에러 */
    private int error;
    private String message;

    public boolean isSuccess() {
        return error == 0;
    }
}
