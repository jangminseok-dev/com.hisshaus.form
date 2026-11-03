import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readSession, writeSession, redirect } = vi.hoisted(() => ({
  readSession: vi.fn(),
  writeSession: vi.fn(),
  // 진짜 redirect 처럼 던져서 이어지는 코드가 실행되지 않게 한다.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('../lib/admin-guard', () => ({ readSession, writeSession }))
vi.mock('next/navigation', () => ({ redirect }))

import { unlock } from '../app/admin/actions'

const form = (pin: string) => {
  const f = new FormData()
  f.set('pin', pin)
  return f
}
const locked = (fails: number) => ({ exp: Date.now() + 100_000, locked: true, fails })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('SURVEY_LINK_SECRET', 'test-survey-link-secret-0123456789abcdef')
  vi.stubEnv('ADMIN_PASSWORD', 'correct-password-1')
  vi.stubEnv('ADMIN_PIN', '4321')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

/** 틀린 PIN 은 1초 기다리므로 가짜 시간을 흘려 끝낸다. */
async function wrong(fails: number) {
  readSession.mockResolvedValue(locked(fails))
  const p = unlock({}, form('0000')).catch((e: Error) => e)
  await vi.advanceTimersByTimeAsync(1000)
  return p
}

describe('unlock — PIN 5번 틀리면 로그아웃', () => {
  it('틀린 PIN 1~4번째는 실패 횟수를 1씩 늘려 다시 쓰고 오류를 돌려준다', async () => {
    for (let fails = 0; fails < 4; fails++) {
      writeSession.mockClear()
      const result = await wrong(fails)
      expect(result).toEqual({ error: 'PIN 이 맞지 않아요' })
      expect(writeSession).toHaveBeenCalledTimes(1)
      expect(writeSession).toHaveBeenCalledWith(expect.objectContaining({ locked: true, fails: fails + 1 }))
    }
  })

  it('5번째 틀리면 쿠키를 지우고 /admin 으로 보낸다', async () => {
    const result = await wrong(4)
    expect(result).toEqual(new Error('REDIRECT:/admin'))
    expect(writeSession).toHaveBeenCalledTimes(1)
    expect(writeSession).toHaveBeenCalledWith(null)
  })

  it('틀린 PIN 은 1초 기다린 뒤에야 답한다', async () => {
    readSession.mockResolvedValue(locked(0))
    let done = false
    const p = unlock({}, form('0000')).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(999)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(done).toBe(true)
  })

  it('맞는 PIN 은 잠금을 풀고 실패 횟수를 0 으로 쓴다', async () => {
    readSession.mockResolvedValue(locked(3))
    await expect(unlock({}, form('4321'))).rejects.toThrow('REDIRECT:/admin')
    expect(writeSession).toHaveBeenCalledWith(expect.objectContaining({ locked: false, fails: 0 }))
  })

  it('세션이 없거나 잠겨 있지 않으면 쿠키를 쓰지 않고 /admin 으로 보낸다', async () => {
    for (const session of [null, { exp: Date.now() + 100_000, locked: false, fails: 0 }]) {
      readSession.mockResolvedValue(session)
      await expect(unlock({}, form('4321'))).rejects.toThrow('REDIRECT:/admin')
      await expect(unlock({}, form('0000'))).rejects.toThrow('REDIRECT:/admin')
    }
    expect(writeSession).not.toHaveBeenCalled()
  })
})
