import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { type AdminSession, openSession, SESSION_COOKIE, SESSION_DAYS, sealSession } from './admin-session'
import { BASE_PATH } from './base-path'
import { isProduction } from './config'

// 서버 전용. 쿠키는 이 웹의 경로(BASE_PATH) 아래에서만 보낸다.

export async function readSession(): Promise<AdminSession | null> {
  return openSession((await cookies()).get(SESSION_COOKIE)?.value)
}

/** 세션을 쿠키에 쓴다. null 이면 지운다. */
export async function writeSession(s: AdminSession | null): Promise<void> {
  const jar = await cookies()
  if (!s) {
    jar.set(SESSION_COOKIE, '', { path: BASE_PATH, maxAge: 0 })
    return
  }
  jar.set(SESSION_COOKIE, sealSession(s), {
    httpOnly: true,
    sameSite: 'lax',
    path: BASE_PATH,
    secure: isProduction(),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

/** 로그인했고 잠기지 않았을 때만 세션을 돌려주고, 아니면 /admin(로그인·잠금 화면)으로 보낸다. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await readSession()
  if (!session || session.locked) redirect('/admin')
  return session
}
