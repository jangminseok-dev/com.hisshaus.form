import { afterEach, describe, expect, it, vi } from 'vitest'

import { consentIdOf, consentToken, consentUrl, newConsentId } from '../lib/consent-link'
import { isSubmissionId } from '../lib/id'
import { applyIdOf, surveyToken } from '../lib/survey-link'

const S = 'test-survey-link-secret-0123456789abcdef'
const OTHER = 'other-survey-link-secret-0123456789abcdef'
const ID = 'Ab3dE5gH7j'

afterEach(() => vi.unstubAllEnvs())

describe('동의서 서명 링크', () => {
  it('동의서 ID 뒤에 - 와 32자 서명(16진수)을 붙이고, 같은 ID 면 늘 같다', () => {
    const token = consentToken(ID, S)
    expect(token).toMatch(/^Ab3dE5gH7j-[0-9a-f]{32}$/)
    expect(consentToken(ID, S)).toBe(token)
    expect(consentToken(ID, OTHER)).not.toBe(token)
  })

  it('만든 링크는 그 ID 로 열리고, 서명이 틀리거나 모양이 깨지면 null 이다', () => {
    const token = consentToken(ID, S)
    const sig = token.slice(11)
    expect(consentIdOf(token, S)).toBe(ID)
    const bad: unknown[] = [
      consentToken(ID, OTHER),
      `${ID}-${sig[0] === '0' ? '1' : '0'}${sig.slice(1)}`,
      `${ID}-${sig.toUpperCase()}`,
      `Zz9Yy8Xx7W-${sig}`,
      '',
      ID,
      `${ID}-`,
      `${ID.slice(1)}-${sig}`,
      `${ID}-${sig.slice(1)}`,
      `${ID}-${sig}a`,
      123,
      undefined,
    ]
    for (const v of bad) expect(consentIdOf(v, S)).toBeNull()
  })

  it('검사지 링크로는 동의서가 안 열리고 동의서 링크로는 검사지가 안 열린다', () => {
    expect(consentIdOf(surveyToken(ID, S), S)).toBeNull()
    expect(applyIdOf(consentToken(ID, S), S)).toBeNull()
  })

  it('비밀값을 주지 않으면 환경 변수의 비밀값을 쓴다', () => {
    vi.stubEnv('SURVEY_LINK_SECRET', S)
    expect(consentToken(ID)).toBe(consentToken(ID, S))
    expect(consentIdOf(consentToken(ID))).toBe(ID)
  })

  it('링크 주소는 히스하우스 경로 아래의 /consent/{링크} 다', () => {
    expect(consentUrl(ID, S)).toBe(`https://chagocnote.com/hisshaus/consent/${consentToken(ID, S)}`)
  })

  it('newConsentId 는 영숫자 10자이고 매번 다르다', () => {
    const ids = Array.from({ length: 200 }, () => newConsentId())
    for (const id of ids) expect(isSubmissionId(id)).toBe(true)
    expect(new Set(ids).size).toBe(200)
  })
})
