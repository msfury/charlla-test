package com.example.charlla.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 3.1 컨텐츠 전체 조회 응답 (data 안에 담겨 온다) */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ContentListDto {
    private int count;
    private int page;
    private int perPage;
    private String order;
    private String sort;
    private List<ContentDto> contents = new ArrayList<>();
}
