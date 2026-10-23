import { describe, expect, it } from 'vitest'
import { surveyForm } from '../forms/survey'
import { allQuestions, blockedBy, isRequired, isVisible } from '../forms/rules'

const qs = allQuestions(surveyForm)
const q = (n: number) => qs.find((x) => x.id === `q${n}`)!

describe('검사지 정의', () => {
  it('검사지는 98문항이고 id 가 q1~q98 로 빠짐없다', () => {
    expect(qs.map((x) => x.id)).toEqual(Array.from({ length: 98 }, (_, i) => `q${i + 1}`))
  })

  it('묶음은 12개다', () => {
    expect(surveyForm.groups).toHaveLength(12)
    expect(surveyForm.groups.map((g) => g.id)).toEqual('abcdefghijkl'.split(''))
    expect(surveyForm.groups[5].title).toBe('식사·간식·영양제')
  })

  it('원문의 오타를 고치지 않았다', () => {
    expect(q(43).label).toBe('영영제를 급여하고 있습니까?')
    expect(q(56).label).toContain('편균')
    expect(q(71).options).toContain('훈현소를 다녀봤고 수료했다.')
    expect(q(83).options).toContain('반려견 목욖을 한다')
    expect(q(21).hint).toContain('b에서 12개')
  })

  it('필수 표시가 원문과 같다', () => {
    const optional = [31, 32, 44, 46, 47, 48, 50, 60, 62, 63, 70, 76, 78, 81, 82, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]
    expect(qs.filter((x) => !x.required).map((x) => Number(x.id.slice(1)))).toEqual(optional)
  })

  it('q83 에서 없음만 고르면 q84·q85 가 필수가 아니다', () => {
    expect(isRequired(q(84), { q83: ['없음'] })).toBe(false)
    expect(isRequired(q(85), { q83: ['없음'] })).toBe(false)
  })

  it('없음과 다른 것을 같이 고르면 q84·q85 는 필수다', () => {
    const a = { q83: ['없음', '미용실에서'] }
    expect(isRequired(q(84), a)).toBe(true)
    expect(isRequired(q(85), a)).toBe(true)
  })

  it('q2 에서 동의하지 않음을 고르면 진행이 막힌다', () => {
    const g = surveyForm.groups[0]
    expect(blockedBy(g, { q2: '동의하지 않음 (서비스 이용 불가)' })).not.toBeNull()
    expect(blockedBy(g, { q2: '동의함' })).toBeNull()
  })

  it('q50·q60·q62·q82 는 앞 문항이 예/네일 때만 보인다', () => {
    const cases: [number, string, string, string][] = [
      [50, 'q49', '예', '아니오'],
      [60, 'q59', '네', '아니오'],
      [62, 'q61', '네', '아니오'],
      [82, 'q81', '네', '아니오'],
    ]
    for (const [n, prev, yes, no] of cases) {
      expect(isVisible(q(n), { [prev]: yes })).toBe(true)
      expect(isVisible(q(n), { [prev]: no })).toBe(false)
      expect(isVisible(q(n), {})).toBe(false)
    }
  })

  it('기타가 있는 문항은 other 가 참이고 options 에 기타가 없다', () => {
    const others = [14, 16, 27, 29, 30, 33, 34, 50, 51, 55, 56, 63, 68, 69, 78, 79, 83, 86, 92, 96, 97]
    for (const x of qs) {
      const n = Number(x.id.slice(1))
      expect(x.other === true).toBe(others.includes(n))
      expect((x.options ?? []).some((o) => o.startsWith('기타'))).toBe(false)
    }
  })

  it('q69 는 선택지 22개, q83 은 48개다', () => {
    expect(q(69).options).toHaveLength(22)
    expect(q(83).options).toHaveLength(48)
  })
})
