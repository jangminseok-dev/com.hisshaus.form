import { defineConfig, devices } from '@playwright/test'

import { FAKE_PORT, FAKE_URL, WEB_PORT } from './tests/e2e/fake'

// 진짜 서비스 계정이 아니다. 앱은 시작할 때 모양만 읽고, 토큰은 SHEETS_FAKE_TOKEN 이 대신한다.
const dummyAccount = Buffer.from(
  JSON.stringify({ client_email: 'e2e@example.invalid', private_key: 'e2e-not-a-real-key' }),
).toString('base64')

// 진짜 슬랙·시트를 절대 부르지 않는다. 두 서버 모두 e2e 전용 포트에서 새로 띄우고(reuseExistingServer: false),
// 이미 떠 있는 서버(진짜 설정을 읽었을 수 있다)는 재사용하지 않는다. 앱이 읽는 다섯 값은 전부 여기서 넘긴다:
// Next 는 이미 있는 환경 변수를 .env.local 로 덮지 않아서 이 값이 이긴다.
// 주의: `pnpm dev` 가 떠 있으면 Next 16 이 같은 폴더의 두 번째 next dev 를 막는다. 개발 서버를 끄고 돌린다.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/playwright',
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Pixel 7'],
    // localhost 로 연다: next dev 는 127.0.0.1 로 연 브라우저의 코드를 막는다.
    baseURL: `http://localhost:${WEB_PORT}`,
    // 막힌 버튼처럼 끝내 누를 수 없는 것을 테스트 제한(60초)까지 기다리지 않고 일찍 알린다.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `node tests/e2e/fake-services.mjs ${FAKE_PORT}`,
      url: `${FAKE_URL}/__state`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec next dev -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SLACK_WEBHOOK_URL: `${FAKE_URL}/slack`,
        SLACK_MENTION: 'U0E2ETESTID',
        SHEETS_BASE_URL: FAKE_URL,
        SHEETS_FAKE_TOKEN: 'e2e-token',
        GOOGLE_SHEET_ID: 'e2e-sheet',
        GOOGLE_SERVICE_ACCOUNT_JSON: dummyAccount,
      },
    },
  ],
})
