import { afterEach, describe, expect, test, vi } from 'vitest'

import { holidayApiKey, serviceAccount, sheetId, sheetsBaseUrl, sheetsFakeToken, slackWebhookUrl, surveyLinkSecret } from '../lib/config'

afterEach(() => vi.unstubAllEnvs())

describe('설정', () => {
  test('SLACK_WEBHOOK_URL 을 읽는다', () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.example/x')
    expect(slackWebhookUrl()).toBe('https://hooks.example/x')
  })

  test('GOOGLE_SHEET_ID 를 읽는다', () => {
    vi.stubEnv('GOOGLE_SHEET_ID', 'sheet123')
    expect(sheetId()).toBe('sheet123')
  })

  test('GOOGLE_SERVICE_ACCOUNT_JSON 의 base64 를 풀어 client_email 과 private_key 를 돌려준다', () => {
    const json = { client_email: 'a@b', private_key: '-----BEGIN PRIVATE KEY-----\nabc' }
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', Buffer.from(JSON.stringify(json)).toString('base64'))
    expect(serviceAccount()).toEqual({ clientEmail: 'a@b', privateKey: '-----BEGIN PRIVATE KEY-----\nabc' })
  })

  test('SURVEY_LINK_SECRET 을 읽는다', () => {
    vi.stubEnv('SURVEY_LINK_SECRET', 'x'.repeat(32))
    expect(surveyLinkSecret()).toBe('x'.repeat(32))
  })

  test('SURVEY_LINK_SECRET 이 32자보다 짧으면 이름만 담아 던진다 — 값은 메시지에 없다', () => {
    const short = 'short-secret-value-31-character'
    expect(short).toHaveLength(31)
    vi.stubEnv('SURVEY_LINK_SECRET', short)
    expect(surveyLinkSecret).toThrow('환경 변수 SURVEY_LINK_SECRET 이 너무 짧다.')
    expect(surveyLinkSecret).not.toThrow('short-secret')
  })

  test.each([
    ['없으면', undefined],
    ['비어 있으면', ''],
  ])('변수가 %s 이름을 담아 던진다', (_label, value) => {
    for (const [name, fn] of [
      ['SLACK_WEBHOOK_URL', slackWebhookUrl],
      ['GOOGLE_SHEET_ID', sheetId],
      ['GOOGLE_SERVICE_ACCOUNT_JSON', serviceAccount],
      ['SURVEY_LINK_SECRET', surveyLinkSecret],
    ] as const) {
      vi.stubEnv(name, value)
      expect(fn).toThrow(name)
    }
  })
})

describe('공휴일 API 키', () => {
  test('HOLIDAY_API_KEY 를 읽고, 없거나 비어 있으면 undefined 다 — 던지지 않고 공휴일을 막지 않을 뿐이다', () => {
    vi.stubEnv('HOLIDAY_API_KEY', 'key')
    expect(holidayApiKey()).toBe('key')
    vi.stubEnv('HOLIDAY_API_KEY', '')
    expect(holidayApiKey()).toBeUndefined()
  })
})

// e2e 가 가짜 시트 서비스로 돌릴 때만 쓰는 선택 변수 둘이다. 없어도 던지지 않고, 운영에서는 읽지 않는다.
describe('테스트용 선택 변수', () => {
  const GOOGLE = 'https://sheets.googleapis.com'

  test.each([
    ['없으면', undefined],
    ['비어 있으면', ''],
  ])('변수가 %s 던지지 않고 기본값을 돌려준다', (_label, value) => {
    vi.stubEnv('SHEETS_BASE_URL', value)
    vi.stubEnv('SHEETS_FAKE_TOKEN', value)
    expect(sheetsBaseUrl()).toBe(GOOGLE)
    expect(sheetsFakeToken()).toBeUndefined()
  })

  test.each(['development', 'test'])('NODE_ENV 가 %s 이면 있는 값을 그대로 읽는다', (env) => {
    vi.stubEnv('NODE_ENV', env)
    vi.stubEnv('SHEETS_BASE_URL', 'http://127.0.0.1:3031')
    vi.stubEnv('SHEETS_FAKE_TOKEN', 'e2e-token')
    expect(sheetsBaseUrl()).toBe('http://127.0.0.1:3031')
    expect(sheetsFakeToken()).toBe('e2e-token')
  })

  test('NODE_ENV 가 production 이면 있어도 둘 다 무시한다', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SHEETS_BASE_URL', 'http://127.0.0.1:3031')
    vi.stubEnv('SHEETS_FAKE_TOKEN', 'e2e-token')
    expect(sheetsBaseUrl()).toBe(GOOGLE)
    expect(sheetsFakeToken()).toBeUndefined()
  })
})
