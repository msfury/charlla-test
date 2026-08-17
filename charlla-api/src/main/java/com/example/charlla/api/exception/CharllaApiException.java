package com.example.charlla.api.exception;

import lombok.Getter;

@Getter
public class CharllaApiException extends RuntimeException {

    private final int statusCode;
    private final String body;

    public CharllaApiException(String message) {
        this(message, 0, null, null);
    }

    public CharllaApiException(String message, Throwable cause) {
        this(message, 0, null, cause);
    }

    public CharllaApiException(String message, int statusCode, String body) {
        this(message, statusCode, body, null);
    }

    public CharllaApiException(String message, int statusCode, String body, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
        this.body = body;
    }
}
