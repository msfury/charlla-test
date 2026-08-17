package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 2.3 업로드 진행상황 응답: { "result": { "progress": 0~100 } }
 * 공통 래퍼(data)가 아니라 result 임에 유의.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class UploadProgress {

    private Result result;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Result {
        private int progress;
    }

    public int progressOrZero() {
        return result == null ? 0 : result.getProgress();
    }
}
