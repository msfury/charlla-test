package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 4. 콜백 요청 바디.
 * status: OK | EXCESS_DURATION | ERR_TRANSCODING
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class UploadCallbackRequest {

    public static final String STATUS_OK = "OK";
    public static final String STATUS_EXCESS_DURATION = "EXCESS_DURATION";
    public static final String STATUS_ERR_TRANSCODING = "ERR_TRANSCODING";

    /** UPLOAD */
    private String type;
    private String status;
    private ContentDto content;

    public boolean isOk() {
        return STATUS_OK.equals(status);
    }
}
