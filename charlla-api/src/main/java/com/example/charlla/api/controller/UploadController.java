package com.example.charlla.api.controller;

import com.example.charlla.api.dto.UploadUrlResponse;
import com.example.charlla.api.service.CharllaService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UploadController {

    private final CharllaService charllaService;

    /** 업로드 URL 발급만. 클라이언트가 uploadUrl 로 직접 보낼 수 있을 때 쓴다. */
    @PostMapping("/upload-url")
    public UploadUrlResponse createUploadUrl(@RequestParam String title) {
        return charllaService.createUploadUrl(title);
    }

    /**
     * 파일까지 이 서버가 대신 올린다.
     * 내부망에서 브라우저가 업로드 서버로 직접 나가지 못하는 경우를 위한 경로다.
     */
    @PostMapping("/upload")
    public UploadUrlResponse upload(@RequestParam String title,
                                    @RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 없습니다.");
        }
        return charllaService.upload(title, file.getResource());
    }

    @GetMapping("/upload-progress")
    public Map<String, Integer> progress(@RequestParam String progressUrl) {
        return Collections.singletonMap("progress", charllaService.getProgress(progressUrl));
    }
}
