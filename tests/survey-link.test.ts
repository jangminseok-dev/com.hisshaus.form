import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyIdOf, surveyToken, surveyUrl } from '../lib/survey-link'

const S = 'test-survey-link-secret-0123456789abcdef'
const OTHER = 'other-survey-link-secret-0123456789abcdef'
const ID = 'Ab3dE5gH7j'

afterEach(() => vi.unstubAllEnvs())

describe('검사지 링크', () => {
  it('신청 ID 뒤에 - 와 32자 서명(16진수)을 붙이고, 같은 ID 면 늘 같다 — 끝이 영숫자라 카톡·슬랙이 링크 끝을 자르지 않는다', () => {
    const token = surveyToken(ID, S)
    expect(token).toMatch(/^Ab3dE5gH7j-[0-9a-f]{32}$/)
    expect(surveyToken(ID, S)).toBe(token)
  })

  it('비밀값이 다르면 서명도 다르다', () => {
    expect(surveyToken(ID, S)).not.toBe(surveyToken(ID, OTHER))
  })

  it('맞는 링크에서 신청 ID 를 꺼낸다', () => {
    expect(applyIdOf(surveyToken(ID, S), S)).toBe(ID)
  })

  it('비밀값을 주지 않으면 환경 변수의 비밀값을 쓴다', () => {
    vi.stubEnv('SURVEY_LINK_SECRET', S)
    expect(surveyToken(ID)).toBe(surveyToken(ID, S))
    expect(applyIdOf(surveyToken(ID, S))).toBe(ID)
  })

  describe('틀린 링크는 예외 없이 null', () => {
    const token = surveyToken(ID, S)
    const sig = token.slice(11)
    const flip = (c: string) => (c === '0' ? '1' : '0')
    const cases: [string, unknown][] = [
      ['다른 비밀값으로 만든 링크', surveyToken(ID, OTHER)],
      ['서명 한 글자를 바꾼 링크', `${ID}-${flip(sig[0])}${sig.slice(1)}`],
      ['서명의 글자를 대문자로 바꾼 링크', `${ID}-${sig.toUpperCase()}`],
      ['다른 신청 ID 에 남의 서명', `Zz9Yy8Xx7W-${sig}`],
      ['빈 값', ''],
      ['서명 없음', ID],
      ['- 뒤가 빔', `${ID}-`],
      ['신청 ID 9자', `${ID.slice(1)}-${sig}`],
      ['서명 31자', `${ID}-${sig.slice(1)}`],
      ['서명 33자', `${ID}-${sig}a`],
      ['숫자', 123],
      ['undefined', undefined],
    ]
    it.each(cases)('%s', (_label, value) => {
      if (typeof value === 'string') expect(value).not.toBe(token)
      expect(applyIdOf(value, S)).toBeNull()
    })
  })

  it('링크 주소는 히스하우스 경로 아래의 /survey/{링크} 다', () => {
    expect(surveyUrl(ID, S)).toBe(`https://chagocnote.com/hisshaus/survey/${surveyToken(ID, S)}`)
  })
})
