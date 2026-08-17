package com.example.charlla.api.controller;

import com.example.charlla.api.dto.ContentDto;
import com.example.charlla.api.dto.ContentListDto;
import com.example.charlla.api.dto.DeleteResultDto;
import com.example.charlla.api.service.CharllaService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contents")
@RequiredArgsConstructor
public class ContentController {

    private final CharllaService charllaService;

    /**
     * 콘텐츠 목록.
     * sort = 정렬 기준(title | createdAt), order = 정렬 순서(asc | desc).
     * 정의서 PDF 는 이 둘을 반대로 적어 두었다. swagger 기준이 맞다.
     */
    @GetMapping
    public ContentListDto list(@RequestParam(required = false) String keyword,
                               @RequestParam(required = false) String start,
                               @RequestParam(required = false) String end,
                               @RequestParam(required = false) Integer page,
                               @RequestParam(required = false) Integer perPage,
                               @RequestParam(required = false) String sort,
                               @RequestParam(required = false) String order) {
        return charllaService.searchContents(keyword, start, end, page, perPage, sort, order);
    }

    @GetMapping("/{contentDeployKey}")
    public ContentDto get(@PathVariable String contentDeployKey) {
        return charllaService.getContent(contentDeployKey);
    }

    @DeleteMapping("/{contentDeployKey}")
    public DeleteResultDto delete(@PathVariable String contentDeployKey) {
        return charllaService.deleteContent(contentDeployKey);
    }
}
