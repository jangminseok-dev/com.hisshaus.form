import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import { BASE_PATH, SITE_ORIGIN } from './base-path'
import { surveyLinkSecret } from './config'
import { isSubmissionId } from './id'

// 동의서 서명 링크(서버 전용). 모양과 비밀값은 검사지 링크(`lib/survey-link.ts`)와 같고
// `{동의서 ID}-{서명}` 이다. 서명 메시지 앞에 `consent:` 를 붙여 용도를 나눈다.
// 그래서 검사지 링크로는 동의서가 열리지 않고, 동의서 링크로는 검사지가 열리지 않는다.

/** 서명 길이(16진수 32자 = 128비트). 영숫자만 써서 링크 끝이 `-`·`_` 로 끝나지 않는다. */
const SIG_LENGTH = 32

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 동의서 ID. 서버가 만드는 영숫자 10자(`isSubmissionId` 와 같은 모양). 글자마다 치우침 없이 뽑는다. */
export function newConsentId(): string {
  return Array.from({ length: 10 }, () => CHARS[randomInt(CHARS.length)]).join('')
}

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(`consent:${id}`).digest('hex').slice(0, SIG_LENGTH)
}

export function consentToken(id: string, secret: string = surveyLinkSecret()): string {
  return `${id}-${sign(id, secret)}`
}

/** 맞는 링크면 동의서 ID, 아니면(모양이 깨졌거나 서명이 틀리면) null. */
export function consentIdOf(token: unknown, secret: string = surveyLinkSecret()): string | null {
  if (typeof token !== 'string') return null
  const cut = token.indexOf('-')
  if (cut === -1) return null
  const id = token.slice(0, cut)
  const given = Buffer.from(token.slice(cut + 1))
  if (!isSubmissionId(id) || given.length !== SIG_LENGTH) return null
  return timingSafeEqual(given, Buffer.from(sign(id, secret))) ? id : null
}

/** 보호자에게 보내는 전체 주소. */
export function consentUrl(id: string, secret?: string): string {
  return `${SITE_ORIGIN}${BASE_PATH}/consent/${consentToken(id, secret)}`
}
