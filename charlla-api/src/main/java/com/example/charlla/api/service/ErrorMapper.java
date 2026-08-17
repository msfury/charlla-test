package com.example.charlla.api.service;

import com.example.charlla.api.exception.CharllaApiException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;

import java.util.function.Supplier;

/**
 * 찰나 호출을 감싸 실패를 CharllaApiException 으로 바꾼다.
 *
 * 상태코드 의미의 기준은 swagger(/api-docs) 다. 정의서 PDF 와 다르니 주의할 것.
 *   정의서:  401 인증 오류 / 403 권한 없음 / 404 없는 콘텐츠
 *   swagger: 403 인증 정보가 잘못된 경우
 *            404 가입되어 있지 않거나 API 계정을 생성하지 않은 계정으로 요청한 경우
 *
 * 2026-08-14 실측: 잘못된 API_KEY 로 호출하면 401 이 아니라 404 가 온다.
 * 즉 404 를 "콘텐츠 없음"으로만 읽으면 인증 문제를 놓친다.
 */
final class ErrorMapper {

    private ErrorMapper() {
    }

    /**
     * @param what 실패했을 때 앞에 붙일 설명. 예: "계정 조회 실패"
     */
    static <T> T call(String what, Supplier<T> op) {
        try {
            return op.get();
        } catch (HttpStatusCodeException e) {
            throw new CharllaApiException(
                    what + " - " + describe(e.getRawStatusCode()),
                    e.getRawStatusCode(),
                    e.getResponseBodyAsString());
        } catch (ResourceAccessException e) {
            // 타임아웃 / 연결 실패
            throw new CharllaApiException(what + " - 통신 실패: " + e.getMessage(), e);
        }
    }

    private static String describe(int status) {
        switch (status) {
            case 400:
                return "400 요청 파라미터 오류 (title 누락/255자 초과, callbackUrl 형식 등)";
            case 401:
                return "401 인증 실패 (API_KEY 확인)";
            case 403:
                return "403 인증 정보 오류 (API_KEY 확인)";
            case 404:
                return "404 대상 없음 (API 계정 미생성이거나 존재하지 않는 콘텐츠. API_KEY 도 확인할 것)";
            case 500:
                return "500 찰나 서버 내부 오류";
            default:
                return status + " 예상치 못한 응답";
        }
    }
}
