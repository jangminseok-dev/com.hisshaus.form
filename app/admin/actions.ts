'use server'

import { redirect } from 'next/navigation'

import { readSession, writeSession } from '../../lib/admin-guard'
import { checkPassword, checkPin, MAX_PIN_FAILS, SESSION_DAYS } from '../../lib/admin-session'

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
