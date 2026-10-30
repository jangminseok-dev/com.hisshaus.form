import { createHmac, timingSafeEqual } from 'node:crypto'

import { BASE_PATH, SITE_ORIGIN } from './base-path'
import { surveyLinkSecret } from './config'
import { isSubmissionId } from './id'

// 검사지 링크(서버 전용). 링크는 `{신청 ID}-{서명}` 이고, 서명은 서버만 아는 비밀값으로 신청 ID 에 붙인 HMAC 이다.
// 만료가 없어 몇 번을 열어도 같은 링크다. 링크를 모르면 신청 ID 를 알아도 서명을 만들 수 없다.
// 비밀값을 바꾸면 이미 보낸 링크가 모두 막힌다. 비밀값 인자는 e2e 와 링크 만드는 명령이 직접 넘길 때만 쓴다.

/** 서명 길이(16진수 32자 = 128비트). 영숫자만 써서 링크 끝이 `-`·`_` 로 끝나지 않는다(카톡·슬랙이 링크 끝의 기호를 떼어 낼 수 있다). */
const SIG_LENGTH = 32

function sign(applyId: string, secret: string): string {
  return createHmac('sha256', secret).update(`survey:${applyId}`).digest('hex').slice(0, SIG_LENGTH)
}

export function surveyToken(applyId: string, secret: string = surveyLinkSecret()): string {
  return `${applyId}-${sign(applyId, secret)}`
}

/** 맞는 링크면 신청 ID, 아니면(모양이 깨졌거나 서명이 틀리면) null. */
export function applyIdOf(token: unknown, secret: string = surveyLinkSecret()): string | null {
  if (typeof token !== 'string') return null
  const cut = token.indexOf('-')
  if (cut === -1) return null
  const applyId = token.slice(0, cut)
  const given = Buffer.from(token.slice(cut + 1))
  if (!isSubmissionId(applyId) || given.length !== SIG_LENGTH) return null
  return timingSafeEqual(given, Buffer.from(sign(applyId, secret))) ? applyId : null
}

/** 사장님이 보호자에게 보내는 전체 주소. */
export function surveyUrl(applyId: string, secret?: string): string {
  return `${SITE_ORIGIN}${BASE_PATH}/survey/${surveyToken(applyId, secret)}`
}
