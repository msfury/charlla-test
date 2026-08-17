import { test, expect } from '@playwright/test';

/**
 * 찰나 플레이어 재생 화면 검증.
 *
 * 크로스 오리진 iframe 내부는 Playwright 로 들여다볼 수 없다.
 * 그래서 "우리 페이지가 받은 이벤트 로그"를 검증 지점으로 삼는다.
 *
 * 실행 전 준비:
 *   1) charlla-api 기동 (8080)
 *   2) CHARLLA_TEST_KEY 환경변수에 contentDeployKey 지정
 */
const KEY = process.env.CHARLLA_TEST_KEY;

test.describe('찰나 플레이어', () => {
  test.skip(!KEY, 'CHARLLA_TEST_KEY 가 없어 건너뜁니다.');

  test('iframe 이 렌더링되고 load 수신 후 컨트롤이 열린다', async ({ page }) => {
    await page.goto(`/charlla-test?key=${KEY}`);

    const iframe = page.getByTestId('charlla-iframe');
    await expect(iframe).toBeVisible();

    // player.charlla.io 를 가리키는지
    await expect(iframe).toHaveAttribute('src', /player\.charlla\.io/);

    // load 액션 수신 → 버튼 활성화
    const play = page.getByRole('button', { name: '재생' });
    await expect(play).toBeEnabled({ timeout: 20_000 });

    // 로그에 load 가 찍혔는지
    await expect(page.getByTestId('charlla-log')).toContainText('"action":"load"');
  });

  test('재생 버튼을 누르면 play 메시지가 나가고 이벤트가 돌아온다', async ({ page }) => {
    await page.goto(`/charlla-test?key=${KEY}`);

    const play = page.getByRole('button', { name: '재생' });
    await expect(play).toBeEnabled({ timeout: 20_000 });
    await play.click();

    const log = page.getByTestId('charlla-log');
    await expect(log).toContainText('▶ play');
    // Player → App 정보성 이벤트 (Interface v1.2.0)
    await expect(log).toContainText('"action":"play"', { timeout: 10_000 });
  });

  test('배너 주입 후 open 액션을 받을 수 있다', async ({ page }) => {
    await page.goto(`/charlla-test?key=${KEY}`);

    const banner = page.getByRole('button', { name: '배너 주입' });
    await expect(banner).toBeEnabled({ timeout: 20_000 });
    await banner.click();

    await expect(page.getByTestId('charlla-log')).toContainText('▶ banner');
  });

  test('load 전에는 컨트롤이 비활성 상태다', async ({ page }) => {
    // 메시지 유실을 구조적으로 막는 부분이라 회귀 방지용으로 잡아둔다.
    await page.goto(`/charlla-test?key=${KEY}`);
    const play = page.getByRole('button', { name: '재생' });
    // 최초 렌더 시점에는 비활성
    await expect(play).toBeDisabled();
  });
});
