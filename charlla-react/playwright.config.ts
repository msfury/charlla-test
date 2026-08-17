import { defineConfig } from '@playwright/test';

/**
 * e2e/charlla-player.spec.ts 용 설정.
 * dev 서버를 직접 띄우므로 charlla-api(8080)만 미리 올려 두면 된다.
 * CHARLLA_TEST_KEY 가 없으면 스펙이 스스로 건너뛴다.
 */
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/charlla-test',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
