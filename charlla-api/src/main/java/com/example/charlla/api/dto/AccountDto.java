package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/** 1.1 API 계정 정보 조회 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class AccountDto {
    private String serviceName;
    private String callbackUrl;
}
