import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendMail } from '../lib/mail'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const mail = { to: 'b@example.com', subject: '제목', text: '본문' }

describe('sendMail', () => {
  it('MAIL_FAKE_URL 이 있으면 가짜 서비스에 JSON 으로 보내고 첨부는 base64 다', async () => {
    vi.stubEnv('MAIL_ADDRESS', 'archive@example.invalid')
    vi.stubEnv('MAIL_FAKE_URL', 'http://127.0.0.1:3031')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = new Uint8Array([1, 2, 3, 250])

    await sendMail({ ...mail, attachment: { filename: 'a.pdf', content: bytes } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:3031/mail')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.from).toBe('archive@example.invalid')
    expect(body.to).toBe('b@example.com')
    expect(body.attachment).toEqual({ filename: 'a.pdf', base64: Buffer.from(bytes).toString('base64') })
  })

  it('가짜 서비스가 실패로 답하면 Error("mail") 만 던진다', async () => {
    vi.stubEnv('MAIL_ADDRESS', 'archive@example.invalid')
    vi.stubEnv('MAIL_FAKE_URL', 'http://127.0.0.1:3031')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(sendMail(mail)).rejects.toThrow(/^mail$/)
  })

  it('보내기가 실패하면 원래 오류를 버리고 Error("mail") 만 던진다', async () => {
    const send = vi.fn().mockRejectedValue(new Error('smtp://user:pass@smtp.naver.com'))
    const error = await sendMail(mail, { send }).then(
      () => undefined,
      (e: Error) => e,
    )
    expect(error?.message).toBe('mail')
    expect(error?.message).not.toContain('pass')
    expect(error?.cause).toBeUndefined()
  })

  it('주입한 send 를 그대로 쓴다', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await sendMail(mail, { send })
    expect(send).toHaveBeenCalledWith(mail)
  })
})
