package com.example.charlla.api;

import com.example.charlla.api.dto.AccountDto;
import com.example.charlla.api.dto.ContentDto;
import com.example.charlla.api.dto.PlayerUrlDto;
import com.example.charlla.api.dto.UploadUrlResponse;
import com.example.charlla.api.service.CharllaService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.io.File;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * 실제 찰나 서버를 호출하는 통합 테스트.
 *
 * 실행:
 *   ./gradlew :charlla-api:test -PincludeExternal --tests '*CharllaUploadIT'
 *   (API_KEY 는 application.yml 기본값을 쓴다. CHARLLA_API_KEY 를 주면 그쪽이 우선한다)
 *
 * 준비물 (프로젝트 루트의 sample/ 폴더):
 *   sample/sample-10s.mp4            (60초 미만)
 *   sample/sample-10s-vertical.mp4   세로 1080x1920
 *   sample/sample-70s.mp4            (EXCESS_DURATION 확인용, 선택)
 */
@Tag("external")
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CharllaUploadIT {

    @Autowired CharllaService charlla;

    private static String uploadedFileKey;
    private static String deployKey;

    @Test
    @Order(1)
    @DisplayName("1) 계정 조회 - 인증과 네트워크가 한 번에 검증된다")
    void 계정_조회() {
        AccountDto account = charlla.getAccount();

        System.out.println("serviceName  = " + account.getServiceName());
        System.out.println("callbackUrl  = " + account.getCallbackUrl());

        // 실서버는 serviceName 을 주지 않는다 (2026-08-14 실측).
        // swagger AccountDto 의 required 도 callbackUrl 뿐이다.
        // serviceName 을 관문으로 잡으면 연동이 정상인데도 실패한다.
        assertThat(account.getCallbackUrl()).isNotBlank();
    }

    @Test
    @Order(2)
    @DisplayName("2) 업로드 URL 발급 → 파일 업로드 → 진행률 100%")
    void 업로드() throws Exception {
        File sample = sampleFile("sample-10s.mp4");
        assumeTrue(sample != null, "샘플 영상이 없어 건너뜁니다: <프로젝트루트>/sample/sample-10s.mp4");

        String title = "연동테스트-" + System.currentTimeMillis();

        UploadUrlResponse issued = charlla.uploadAndWait(title, sample,
                p -> System.out.println("  진행률 " + p + "%"));

        System.out.println("uploadFileKey = " + issued.getUploadFileKey());
        assertThat(issued.getUploadFileKey()).isNotBlank();

        uploadedFileKey = issued.getUploadFileKey();
    }

    @Test
    @Order(3)
    @DisplayName("3) 업로드 파일키로 콘텐츠 조회 - contentDeployKey 획득")
    void 콘텐츠_조회() {
        assumeTrue(uploadedFileKey != null, "업로드 테스트가 선행되어야 합니다.");

        // 진행률 100% 는 "전송 완료"이지 "인코딩 완료"가 아니다.
        // 인코딩이 끝나야 목록에 뜬다. 콜백을 못 받는 망이면 이 폴링이 대체 경로다.
        Optional<ContentDto> found = Optional.empty();
        for (int i = 0; i < 30 && !found.isPresent(); i++) {
            found = charlla.findByUploadFileKey(uploadedFileKey);
            if (!found.isPresent()) {
                sleep(3000);   // 분당 60회 제한을 고려해 넉넉히
            }
        }

        assertThat(found).as("인코딩 완료 후 콘텐츠가 조회되어야 합니다.").isPresent();

        ContentDto content = found.get();
        System.out.println("contentDeployKey = " + content.getContentDeployKey());
        System.out.println("mediaUrl         = " + content.getMediaUrl());
        System.out.println("size             = " + content.getWidth() + "x" + content.getHeight());

        assertThat(content.getContentDeployKey()).isNotBlank();
        deployKey = content.getContentDeployKey();
    }

    @Test
    @Order(4)
    @DisplayName("4) 플레이어 URL 생성 - 이 URL 을 두 화면에 그대로 꽂는다")
    void 플레이어_URL() {
        assumeTrue(deployKey != null, "콘텐츠 조회가 선행되어야 합니다.");

        PlayerUrlDto dto = charlla.buildPlayerUrl(deployKey, "shoplayer");

        System.out.println();
        System.out.println("=== 화면에서 사용할 값 ===");
        System.out.println("contentDeployKey = " + dto.getContentDeployKey());
        System.out.println("playerUrl        = " + dto.getUrl());
        System.out.println("JSP    : http://localhost:8081/player?key=" + dto.getContentDeployKey());
        System.out.println("Next.js: http://localhost:3000/charlla-test?key=" + dto.getContentDeployKey());
        System.out.println();

        assertThat(dto.getUrl()).contains(deployKey);
    }

    /**
     * 샘플 영상은 프로젝트 루트의 sample/ 에 둔다. 화면 테스트에서도 같은 파일을 쓰기 위해서다.
     * 테스트는 charlla-api/ 에서 실행되므로 상위 폴더를 먼저 본다.
     */
    private File sampleFile(String name) {
        File[] candidates = {
                new File("../sample/" + name),
                new File("sample/" + name),
        };
        for (File f : candidates) {
            if (f.isFile()) {
                return f;
            }
        }
        return null;
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
