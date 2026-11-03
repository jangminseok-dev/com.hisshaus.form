'use server'

import { redirect } from 'next/navigation'

import { readSession, requireAdmin, writeSession } from '../../lib/admin-guard'
import { checkPassword, checkPin, MAX_PIN_FAILS, SESSION_DAYS } from '../../lib/admin-session'
import { mailAddress } from '../../lib/config'
import { sendMail } from '../../lib/mail'

export type ActionState = { error?: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!checkPassword(form.get('password'))) {
    // 비밀번호를 연달아 시도하는 속도를 늦춘다.
    await wait(1000)
    return { error: '비밀번호가 맞지 않아요' }
  }
  await writeSession({ exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000, locked: false, fails: 0 })
  redirect('/admin')
}

export async function logout(): Promise<void> {
  await writeSession(null)
  redirect('/admin')
}

/** 잠긴 세션에서만 PIN 을 받는다. 5번 틀리면 로그아웃해서 비밀번호부터 다시 넣게 한다. */
export async function unlock(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await readSession()
  if (!session || !session.locked) redirect('/admin')
  if (checkPin(form.get('pin'))) {
    await writeSession({ ...session, locked: false, fails: 0 })
    redirect('/admin')
  }
  // PIN 도 비밀번호처럼 연달아 시도하는 속도를 늦춘다.
  await wait(1000)
  const fails = session.fails + 1
  if (fails >= MAX_PIN_FAILS) {
    await writeSession(null)
    redirect('/admin')
  }
  await writeSession({ ...session, fails })
  return { error: 'PIN 이 맞지 않아요' }
}

/** 운영에서 네이버 발송이 되는지 확인하는 시험 메일. 사장님 자기 주소로 보낸다. */
export async function sendTestMail(): Promise<ActionState & { ok?: boolean }> {
  await requireAdmin()
  try {
    await sendMail({
      to: mailAddress(),
      subject: '[히스하우스] 메일 설정 시험',
      text: '이 메일이 보이면 동의서 사본을 보낼 수 있어요.',
    })
    return { ok: true }
  } catch {
    console.error('메일 전송 실패', 'test')
    return { error: '메일을 보내지 못했어요. 네이버 메일 설정을 확인해 주세요.' }
  }
}
