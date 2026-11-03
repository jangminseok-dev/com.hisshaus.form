import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { adminPassword, adminPin, surveyLinkSecret } from './config'

// 사장님 화면 세션(서버 전용). 쿠키 값은 `{내용}.{서명}` 이다.
// 서명은 검사지 링크 비밀값을 키로 `admin:` 용도 접두와 ADMIN_PASSWORD 의 sha256 앞 8자를 함께 넣은 HMAC 이다.
// 비밀번호를 바꾸면 서명이 달라져 모든 기기가 로그아웃된다.

export interface AdminSession {
  /** 만료 시각(ms). */
  exp: number
  /** 아이패드 잠금 상태. 잠겨 있으면 PIN 을 넣어야 한다. */
  locked: boolean
  /** PIN 을 틀린 횟수. */
  fails: number
}

export const SESSION_COOKIE = 'hh_admin'
export const SESSION_DAYS = 30
export const MAX_PIN_FAILS = 5

function sign(body: string): string {
  const stamp = createHash('sha256').update(adminPassword()).digest('hex').slice(0, 8)
  return createHmac('sha256', surveyLinkSecret()).update(`admin:${stamp}:${body}`).digest('hex')
}

export function sealSession(s: AdminSession): string {
  const body = Buffer.from(JSON.stringify({ exp: s.exp, locked: s.locked, fails: s.fails })).toString('base64url')
  return `${body}.${sign(body)}`
}

/** 맞게 봉인됐고 만료 전이면 세션, 아니면 null. */
export function openSession(raw: string | undefined, now: number = Date.now()): AdminSession | null {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const given = Buffer.from(sig)
  const expected = Buffer.from(sign(body))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof v.exp !== 'number' || typeof v.locked !== 'boolean' || !Number.isInteger(v.fails)) return null
    if (v.exp <= now) return null
    return { exp: v.exp, locked: v.locked, fails: v.fails }
  } catch {
    return null
  }
}

/** 길이가 달라도 비교 시간이 새지 않게 sha256 으로 맞춰 비교한다. */
function matches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const hash = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(hash(given), hash(expected))
}

export function checkPassword(given: unknown): boolean {
  return matches(given, adminPassword())
}

export function checkPin(given: unknown): boolean {
  return matches(given, adminPin())
}
