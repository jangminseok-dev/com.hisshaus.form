import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readSession, writeSession, redirect, requireAdmin, sendMail, createConsent, cancelConsent } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createConsent: vi.fn(),
  cancelConsent: vi.fn(),
  sendMail: vi.fn(),
  readSession: vi.fn(),
  writeSession: vi.fn(),
  // 진짜 redirect 처럼 던져서 이어지는 코드가 실행되지 않게 한다.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('../lib/admin-guard', () => ({ readSession, writeSession, requireAdmin }))
vi.mock('../lib/mail', () => ({ sendMail }))
vi.mock('../lib/consent-admin', async (orig) => ({ ...(await orig<typeof import('../lib/consent-admin')>()), createConsent, cancelConsent }))
vi.mock('next/navigation', () => ({ redirect }))

import { cancelConsentAction, createConsentAction, sendTestMail, unlock } from '../app/admin/actions'

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
  vi.stubEnv('MAIL_ADDRESS', 'shop@naver.com')
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

describe('sendTestMail — 메일 시험 보내기', () => {
  it('로그인(잠금 해제)을 먼저 확인한다', async () => {
    requireAdmin.mockRejectedValue(new Error('REDIRECT:/admin'))
    await expect(sendTestMail()).rejects.toThrow('REDIRECT:/admin')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('성공하면 자기 주소로 보내고 { ok: true } 를 돌려준다', async () => {
    requireAdmin.mockResolvedValue({})
    sendMail.mockResolvedValue(undefined)
    expect(await sendTestMail()).toEqual({ ok: true })
    expect(sendMail).toHaveBeenCalledWith({
      to: 'shop@naver.com',
      subject: '[히스하우스] 메일 설정 시험',
      text: '이 메일이 보이면 동의서 사본을 보낼 수 있어요.',
    })
  })

  it('실패하면 안내 문구를 돌려주고 로그에는 메일 전송 실패와 test 만 남긴다', async () => {
    requireAdmin.mockResolvedValue({})
    sendMail.mockRejectedValue(new Error('mail'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await sendTestMail()).toEqual({ error: '메일을 보내지 못했어요. 네이버 메일 설정을 확인해 주세요.' })
    expect(log.mock.calls).toEqual([['메일 전송 실패', 'test']])
    log.mockRestore()
  })
})

const createForm = (o: Record<string, string> = {}) => {
  const f = new FormData()
  const v = { applyId: 'AAAAAAAAAA', bundle: 'generalGrooming', guardianName: '김하나', phone: '010', petName: '보리', breed: '푸들', ...o }
  for (const [k, val] of Object.entries(v)) f.set(k, val)
  f.append('groomingParts', '등')
  f.append('groomingParts', '배')
  return f
}

describe('createConsentAction — 동의서 만들기', () => {
  it('로그인(잠금 해제)을 먼저 확인한다', async () => {
    requireAdmin.mockRejectedValue(new Error('REDIRECT:/admin'))
    await expect(createConsentAction({}, createForm())).rejects.toThrow('REDIRECT:/admin')
    expect(createConsent).not.toHaveBeenCalled()
  })

  it('폼 값을 입력으로 바꿔 만들고 id·url 을 돌려준다', async () => {
    requireAdmin.mockResolvedValue({})
    createConsent.mockResolvedValue({ id: 'NEWID12345', url: 'https://x/consent/NEWID12345-sig' })
    expect(await createConsentAction({}, createForm())).toEqual({ id: 'NEWID12345', url: 'https://x/consent/NEWID12345-sig' })
    expect(createConsent).toHaveBeenCalledWith({
      applyId: 'AAAAAAAAAA',
      bundle: 'generalGrooming',
      programName: '',
      goal: '',
      classTime: '',
      groomingParts: ['등', '배'],
      shown: { guardianName: '김하나', phone: '010', petName: '보리', breed: '푸들' },
    }, { id: expect.stringMatching(/^[A-Za-z0-9]{10}$/) })
  })

  it('검증 오류는 칸별 오류로 돌려준다', async () => {
    requireAdmin.mockResolvedValue({})
    createConsent.mockResolvedValue({ errors: { goal: '적어 주세요' } })
    expect(await createConsentAction({}, createForm())).toEqual({ errors: { goal: '적어 주세요' } })
  })

  it('시트 실패는 안내 문구를 주고 로그에는 시트 저장 실패만 남긴다', async () => {
    requireAdmin.mockResolvedValue({})
    createConsent.mockRejectedValue(new Error('sheets'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await createConsentAction({}, createForm())).toEqual({ error: '지금은 시트에 쓸 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(log.mock.calls).toEqual([['시트 저장 실패', expect.stringMatching(/^[A-Za-z0-9]{10}$/)]])
    log.mockRestore()
  })
})

describe('시트 오류가 아닌 예외', () => {
  it('만들기에서 다른 예외는 안내 문구로 바꾸지 않고 던지며 로그도 남기지 않는다', async () => {
    requireAdmin.mockResolvedValue({})
    createConsent.mockRejectedValue(new Error('SURVEY_LINK_SECRET'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(createConsentAction({}, createForm())).rejects.toThrow('SURVEY_LINK_SECRET')
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('취소에서 다른 예외도 그대로 던진다', async () => {
    requireAdmin.mockResolvedValue({})
    cancelConsent.mockRejectedValue(new Error('other'))
    await expect(cancelConsentAction('AAAAAAAAAA')).rejects.toThrow('other')
  })
})

describe('cancelConsentAction — 동의서 취소', () => {
  it('로그인(잠금 해제)을 먼저 확인한다', async () => {
    requireAdmin.mockRejectedValue(new Error('REDIRECT:/admin'))
    await expect(cancelConsentAction('AAAAAAAAAA')).rejects.toThrow('REDIRECT:/admin')
    expect(cancelConsent).not.toHaveBeenCalled()
  })

  it('결과를 돌려준다', async () => {
    requireAdmin.mockResolvedValue({})
    cancelConsent.mockResolvedValue('signed')
    expect(await cancelConsentAction('AAAAAAAAAA')).toEqual({ result: 'signed' })
  })

  it('시트 실패는 안내 문구를 주고 로그에는 시트 저장 실패와 ID 만 남긴다', async () => {
    requireAdmin.mockResolvedValue({})
    cancelConsent.mockRejectedValue(new Error('sheets'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await cancelConsentAction('AAAAAAAAAA')).toEqual({ error: '지금은 시트에 쓸 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(log.mock.calls).toEqual([['시트 저장 실패', 'AAAAAAAAAA']])
    log.mockRestore()
  })
})
