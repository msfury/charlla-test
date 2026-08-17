package com.example.charlla.api.controller;

import com.example.charlla.api.dto.PlayerUrlDto;
import com.example.charlla.api.service.CharllaService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 화면 모듈(JSP / Next.js)이 쓰는 플레이어 정보.
 * URL 조립을 여기서만 하므로 옵션을 바꾸면 두 화면에 동시 반영된다.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class PlayerController {

    private final CharllaService charllaService;

    @GetMapping("/player-url")
    public PlayerUrlDto playerUrl(@RequestParam String key,
                                  @RequestParam(required = false) String type) {
        return charllaService.buildPlayerUrl(key, type);
    }
}
