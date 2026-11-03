import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { readSession, writeSession, redirect, requireAdmin, sendMail, createConsent, cancelConsent, resendConsentMail } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createConsent: vi.fn(),
  cancelConsent: vi.fn(),
  resendConsentMail: vi.fn(),
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
vi.mock('../lib/consent-admin', async (orig) => ({
  ...(await orig<typeof import('../lib/consent-admin')>()),
  createConsent,
  cancelConsent,
  resendConsentMail,
}))
vi.mock('next/navigation', () => ({ redirect, RedirectType: { push: 'push', replace: 'replace' } }))

import {
  cancelConsentAction,
  createConsentAction,
  resendConsentMailAction,
  sendTestMail,
  startDeviceSign,
  unlock,
} from '../app/admin/actions'
import { consentToken } from '../lib/consent-link'

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

describe('startDeviceSign — 이 기기에서 바로 서명', () => {
  const token = () => consentToken('CCCCCCCCCC')
  const open = { exp: 123_456, locked: false, fails: 2 }

  it('로그인(잠금 해제)을 먼저 확인하고, 아니면 잠그지 않는다', async () => {
    requireAdmin.mockRejectedValue(new Error('REDIRECT:/admin'))
    await expect(startDeviceSign(token())).rejects.toThrow('REDIRECT:/admin')
    expect(writeSession).not.toHaveBeenCalled()
  })

  it('세션을 잠그고(실패 횟수 0, 만료는 그대로) 그 동의서의 서명 화면으로 보낸다', async () => {
    requireAdmin.mockResolvedValue(open)
    await expect(startDeviceSign(token())).rejects.toThrow(`REDIRECT:/consent/${token()}`)
    expect(writeSession).toHaveBeenCalledWith({ exp: 123_456, locked: true, fails: 0 })
    expect(writeSession.mock.invocationCallOrder[0]).toBeLessThan(redirect.mock.invocationCallOrder[0])
  })

  it('서명 화면으로 갈 때 방문 기록을 바꿔 써서 아이패드의 뒤로 가기에 사장님 홈이 남지 않는다', async () => {
    requireAdmin.mockResolvedValue(open)
    await expect(startDeviceSign(token())).rejects.toThrow('REDIRECT')
    expect(redirect).toHaveBeenCalledWith(`/consent/${token()}`, 'replace')
  })

  it('틀린 링크는 잠그지도 보내지도 않고 오류를 돌려준다', async () => {
    requireAdmin.mockResolvedValue(open)
    for (const bad of [`CCCCCCCCCC-${'0'.repeat(32)}`, 'CCCCCCCCCC', '../admin']) {
      expect(await startDeviceSign(bad)).toEqual({ error: '링크가 올바르지 않아요.' })
    }
    expect(writeSession).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('resendConsentMailAction — 메일 다시 보내기', () => {
  it('로그인(잠금 해제)을 먼저 확인한다', async () => {
    requireAdmin.mockRejectedValue(new Error('REDIRECT:/admin'))
    await expect(resendConsentMailAction('AAAAAAAAAA')).rejects.toThrow('REDIRECT:/admin')
    expect(resendConsentMail).not.toHaveBeenCalled()
  })

  it('보낸 결과(또는 not-signed·already-sent·changed)를 돌려준다', async () => {
    requireAdmin.mockResolvedValue({})
    resendConsentMail.mockResolvedValue({ archive: true, guardian: false })
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ result: { archive: true, guardian: false } })
    expect(resendConsentMail).toHaveBeenCalledWith('AAAAAAAAAA')
    resendConsentMail.mockResolvedValue('not-signed')
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ result: 'not-signed' })
    resendConsentMail.mockResolvedValue('already-sent')
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ result: 'already-sent' })
    resendConsentMail.mockResolvedValue('changed')
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ result: 'changed' })
  })

  it('시트를 못 읽으면 안내 문구를 주고 로그는 남기지 않는다', async () => {
    requireAdmin.mockResolvedValue({})
    resendConsentMail.mockRejectedValue(new Error('sheets'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ error: '지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('PDF 를 못 만들면 안내 문구를 주고 로그는 더 남기지 않는다(resendConsentMail 이 남긴다)', async () => {
    requireAdmin.mockResolvedValue({})
    resendConsentMail.mockRejectedValue(new Error('pdf'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await resendConsentMailAction('AAAAAAAAAA')).toEqual({ error: '지금은 PDF 를 다시 만들 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('그 밖의 예외는 그대로 던진다', async () => {
    requireAdmin.mockResolvedValue({})
    resendConsentMail.mockRejectedValue(new Error('other'))
    await expect(resendConsentMailAction('AAAAAAAAAA')).rejects.toThrow('other')
  })
})
