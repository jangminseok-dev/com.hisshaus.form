import nodemailer from 'nodemailer'

import { mailAddress, mailAppPassword, mailFakeUrl } from './config'

export interface Mail {
  to: string
  subject: string
  text: string
  attachment?: { filename: string; content: Uint8Array }
}

export interface MailDeps {
  send?: (mail: Mail) => Promise<void>
}

const FAKE_TIMEOUT_MS = 10_000

/** 테스트용 가짜 메일 서비스에 JSON 으로 보낸다. 첨부는 base64. */
async function sendFake(url: string, mail: Mail): Promise<void> {
  const res = await fetch(`${url}/mail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: mailAddress(),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      attachment: mail.attachment && {
        filename: mail.attachment.filename,
        base64: Buffer.from(mail.attachment.content).toString('base64'),
      },
    }),
    signal: AbortSignal.timeout(FAKE_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error('fake')
}

async function sendSmtp(mail: Mail): Promise<void> {
  const transport = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 465,
    secure: true,
    auth: { user: mailAddress(), pass: mailAppPassword() },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  await transport.sendMail({
    from: mailAddress(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    attachments: mail.attachment ? [{ filename: mail.attachment.filename, content: Buffer.from(mail.attachment.content) }] : undefined,
  })
}

async function defaultSend(mail: Mail): Promise<void> {
  const fake = mailFakeUrl()
  if (fake) return sendFake(fake, mail)
  return sendSmtp(mail)
}

/**
 * 메일을 보낸다. 실패하면 `Error('mail')` 만 던진다.
 * 원래 오류는 버린다: 오류의 메시지나 cause 에 주소·비밀번호가 들어 있을 수 있다.
 */
export async function sendMail(mail: Mail, deps: MailDeps = {}): Promise<void> {
  const send = deps.send ?? defaultSend
  try {
    await send(mail)
  } catch {
    throw new Error('mail')
  }
}
