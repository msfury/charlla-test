package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 콘텐츠 삭제 응답. swagger 의 ContentCommandResponseDto 기준이다.
 *
 * 정의서 PDF 와 두 군데가 다르다.
 *   구조: 정의서는 content.title / content.contentDeployKey 로 표기했지만 swagger 는 평면이다.
 *   상태: 정의서는 (COMPLETED, FAIL) 이지만 swagger 는 4종이고 FAIL 이 아니라 FAILED 다.
 *
 * 삭제할 콘텐츠가 아직 없어 실측하지 못했다. 실제 응답을 받으면 이 주석부터 확인할 것.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeleteResultDto {

    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_COMPLETED = "COMPLETED";
    public static final String STATUS_FAILED = "FAILED";

    private String title;
    private String contentDeployKey;

    /** APPROVED | REJECTED | COMPLETED | FAILED */
    private String status;

    public boolean isCompleted() {
        return STATUS_COMPLETED.equals(status);
    }
}
