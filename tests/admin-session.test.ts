import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkPassword, checkPin, openSession, sealSession } from '../lib/admin-session'

const SECRET = 'test-survey-link-secret-0123456789abcdef'
const NOW = 1_800_000_000_000

beforeEach(() => {
  vi.stubEnv('SURVEY_LINK_SECRET', SECRET)
  vi.stubEnv('ADMIN_PASSWORD', 'correct-password-1')
  vi.stubEnv('ADMIN_PIN', '4321')
})
afterEach(() => vi.unstubAllEnvs())

describe('사장님 세션 봉인', () => {
  const session = { exp: NOW + 1000, locked: false, fails: 0 }

  it('봉인한 세션은 열리고, 한 글자만 바꿔도·만료가 지나도·비밀번호를 바꿔도 열리지 않는다', () => {
    const raw = sealSession(session)
    expect(openSession(raw, NOW)).toEqual(session)

    const last = raw.slice(-1)
    const tampered = raw.slice(0, -1) + (last === 'a' ? 'b' : 'a')
    expect(openSession(tampered, NOW)).toBeNull()
    const first = raw.slice(0, 1)
    expect(openSession((first === 'x' ? 'y' : 'x') + raw.slice(1), NOW)).toBeNull()

    expect(openSession(raw, NOW + 1000)).toBeNull()
    expect(openSession(raw, NOW + 5000)).toBeNull()

    vi.stubEnv('ADMIN_PASSWORD', 'another-password-2')
    expect(openSession(raw, NOW)).toBeNull()
  })

  it('없거나 깨진 값은 null 이다', () => {
    expect(openSession(undefined, NOW)).toBeNull()
    expect(openSession('', NOW)).toBeNull()
    expect(openSession('abc', NOW)).toBeNull()
    expect(openSession('a.b.c', NOW)).toBeNull()
  })

  it('잠금·실패 횟수도 봉인에 담긴다', () => {
    const locked = { exp: NOW + 1000, locked: true, fails: 3 }
    expect(openSession(sealSession(locked), NOW)).toEqual(locked)
  })
})

describe('비밀번호·PIN 비교', () => {
  it('비밀번호·PIN 비교는 맞을 때만 참이고 문자열이 아니면 거짓이다', () => {
    expect(checkPassword('correct-password-1')).toBe(true)
    expect(checkPassword('correct-password-2')).toBe(false)
    expect(checkPassword('')).toBe(false)
    expect(checkPassword(null)).toBe(false)
    expect(checkPassword(1234)).toBe(false)
    expect(checkPin('4321')).toBe(true)
    expect(checkPin('1234')).toBe(false)
    expect(checkPin('43211')).toBe(false)
    expect(checkPin(4321)).toBe(false)
    expect(checkPin(undefined)).toBe(false)
  })
})
