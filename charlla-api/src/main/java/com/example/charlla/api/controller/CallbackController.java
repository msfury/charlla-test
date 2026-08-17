package com.example.charlla.api.controller;

import com.example.charlla.api.dto.UploadCallbackRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 찰나 업로드 결과 콜백 수신.
 *
 * 반드시 200 OK 로 응답해야 한다.
 * 잘못된 응답을 주면 10분 / 30분 / 1시간 뒤 총 3번 재콜백이 온다.
 */
@Slf4j
@RestController
@RequestMapping("/api")
public class CallbackController {

    /** 테스트 확인용 인메모리 보관. 운영이면 DB 로 간다. */
    private final List<UploadCallbackRequest> received =
            Collections.synchronizedList(new ArrayList<>());

    @PostMapping("/callback")
    public ResponseEntity<Void> onCallback(@RequestBody UploadCallbackRequest req) {
        try {
            if (req.isOk()) {
                log.info("[CHARLLA-CALLBACK] 업로드 성공. title={}, deployKey={}, mediaUrl={}",
                        req.getContent() == null ? null : req.getContent().getTitle(),
                        req.getContent() == null ? null : req.getContent().getContentDeployKey(),
                        req.getContent() == null ? null : req.getContent().getMediaUrl());
            } else {
                // EXCESS_DURATION(60초 초과) / ERR_TRANSCODING
                log.warn("[CHARLLA-CALLBACK] 업로드 실패. status={}, title={}",
                        req.getStatus(),
                        req.getContent() == null ? null : req.getContent().getTitle());
            }
            received.add(req);
        } catch (Exception e) {
            // 처리 중 예외가 나도 200 을 준다. 안 그러면 3번 더 온다.
            log.error("[CHARLLA-CALLBACK] 처리 실패했지만 200 응답", e);
        }
        return ResponseEntity.ok().build();
    }

    /** 테스트에서 수신 내역 확인용 */
    @GetMapping("/callback/received")
    public List<UploadCallbackRequest> received() {
        return new ArrayList<>(received);
    }
}
