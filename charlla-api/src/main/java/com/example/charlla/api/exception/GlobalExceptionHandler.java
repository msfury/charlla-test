package com.example.charlla.api.exception;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

/** 찰나 원본 에러를 그대로 노출하지 않고 우리 표준 응답으로 변환한다. */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CharllaApiException.class)
    public ResponseEntity<Map<String, Object>> handle(CharllaApiException e) {
        log.error("[CHARLLA] {} (status={})", e.getMessage(), e.getStatusCode());

        Map<String, Object> body = new HashMap<>();
        body.put("error", "CHARLLA_API_ERROR");
        body.put("message", e.getMessage());

        HttpStatus status = e.getStatusCode() == 404 ? HttpStatus.NOT_FOUND
                : e.getStatusCode() == 401 || e.getStatusCode() == 403 ? HttpStatus.UNAUTHORIZED
                : HttpStatus.BAD_GATEWAY;

        return ResponseEntity.status(status).body(body);
    }
}
