import { afterEach, describe, expect, test, vi } from 'vitest'

import { serviceAccount, sheetId, slackWebhookUrl } from '../lib/config'

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

  test.each([
    ['없으면', undefined],
    ['비어 있으면', ''],
  ])('변수가 %s 이름을 담아 던진다', (_label, value) => {
    for (const [name, fn] of [
      ['SLACK_WEBHOOK_URL', slackWebhookUrl],
      ['GOOGLE_SHEET_ID', sheetId],
      ['GOOGLE_SERVICE_ACCOUNT_JSON', serviceAccount],
    ] as const) {
      vi.stubEnv(name, value)
      expect(fn).toThrow(name)
    }
  })
})
