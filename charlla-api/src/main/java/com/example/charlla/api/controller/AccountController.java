package com.example.charlla.api.controller;

import com.example.charlla.api.dto.AccountDto;
import com.example.charlla.api.service.CharllaService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccountController {

    private final CharllaService charllaService;

    /**
     * 연동 확인용. callbackUrl 이 돌아오면 인증·네트워크가 모두 정상이다.
     * serviceName 은 실서버가 주지 않으므로 판정 기준으로 쓰지 말 것.
     */
    @GetMapping("/account")
    public AccountDto account() {
        return charllaService.getAccount();
    }

    @PutMapping("/account/callback")
    public AccountDto updateCallback(@RequestParam String callbackUrl) {
        return charllaService.updateCallbackUrl(callbackUrl);
    }
}
