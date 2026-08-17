package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/** 콘텐츠 단건 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ContentDto {
    private String title;
    private String uploadFileKey;
    private String contentDeployKey;
    private String mediaUrl;
    private Integer width;
    private Integer height;
    private String createdAt;
}
