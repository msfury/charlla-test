package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * external-api.charlla.io 공통 응답 래퍼.
 * 정의서 "공통 상태 및 응답값" 기준: { "message": "...", "data": { ... } }
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CharllaResponse<T> {
    private String message;
    private T data;
}
