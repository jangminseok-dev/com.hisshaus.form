import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { register } from '../instrumentation'

const account = Buffer.from(JSON.stringify({ client_email: 'a@b', private_key: 'k' })).toString('base64')

beforeEach(() => {
  vi.stubEnv('SLACK_WEBHOOK_URL', 'https://hooks.example/x')
  vi.stubEnv('GOOGLE_SHEET_ID', 'sheet123')
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', account)
  vi.stubEnv('SURVEY_LINK_SECRET', 'x'.repeat(32))
})
afterEach(() => vi.unstubAllEnvs())

describe('서버 시작 검사', () => {
  it('필수 넷이 있으면 통과한다', () => {
    expect(register).not.toThrow()
  })

  it.each(['SLACK_WEBHOOK_URL', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'SURVEY_LINK_SECRET'])(
    '%s 가 없으면 그 이름을 담아 바로 던진다',
    (name) => {
      vi.stubEnv(name, '')
      expect(register).toThrow(name)
    },
  )

  it('검사지 링크 비밀값이 짧아도 바로 던진다', () => {
    vi.stubEnv('SURVEY_LINK_SECRET', 'short')
    expect(register).toThrow('환경 변수 SURVEY_LINK_SECRET 이 너무 짧다.')
  })
})
