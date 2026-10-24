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

  it('사장님 결정(2026-10-24)으로 원문의 오타·틀린 숫자·잘못 복사된 설명을 고쳤다', () => {
    expect(q(43).label).toBe('영양제를 급여하고 있습니까?')
    expect(q(56).label).toContain('평균')
    expect(q(71).options).toContain('훈련소를 다녀봤고 수료했다.')
    expect(q(83).options).toContain('반려견 목욕을 한다')
    expect(q(21).hint).toBe('a에서 1개, b에서 1개 골라주세요 (a : 빈도, b : 정도)')
    expect(q(30).options).toContain('요구적인 행동 (관심을 끌려고 짖거나 앞발로 긁음 등)')
    expect(q(51).label).toBe('반려견은 밤에 어디에서 잡니까?')
    // 나이 선택지는 세 문항이 같다.
    expect(q(31).options).toEqual(q(19).options)
    expect(q(20).options).toEqual(q(19).options)
    // 구글폼용 선택 안내는 없다.
    for (const x of qs) expect(x.hint ?? '').not.toMatch(/선택해주세요$|표시하세요\.?$|표시해주세요\.?$|선택하세요$/)
  })

  it('필수 표시는 원문과 같고, 최근 사건 중 첫 것만 필수다(q24~q26 은 사건이 없을 수 있어 선택)', () => {
    const optional = [24, 25, 26, 31, 32, 44, 46, 47, 48, 50, 60, 62, 63, 70, 76, 78, 81, 82, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]
    expect(qs.filter((x) => !x.required).map((x) => Number(x.id.slice(1)))).toEqual(optional)
  })

  it('도입 안내에 없는 표시를 가리키는 "*표시는 필수 질문임" 줄이 없다', () => {
    expect(surveyForm.groups[0].note).not.toContain('*표시는 필수 질문임')
  })

  it('q84·q85 는 원문대로 선택이다', () => {
    expect(isRequired(q(84), { q83: ['미용실에서'] })).toBe(false)
    expect(isRequired(q(85), { q83: ['미용실에서'] })).toBe(false)
  })

  it('q2 에서 동의하지 않음을 고르면 진행이 막힌다', () => {
    const g = surveyForm.groups[0]
    expect(blockedBy(g, { q2: '동의하지 않음 (서비스 이용 불가)' })).not.toBeNull()
    expect(blockedBy(g, { q2: '동의함' })).toBeNull()
  })

  it('q50·q60·q62·q44·q88·q89 는 앞 문항이 예/네/그렇다일 때만 보인다', () => {
    const cases: [number, string, string, string][] = [
      [50, 'q49', '예', '아니오'],
      [60, 'q59', '네', '아니오'],
      [62, 'q61', '네', '아니오'],
      [44, 'q43', '그렇다.', '아니다'],
      [88, 'q87', '네', '아니오'],
      [89, 'q87', '네', '아니오'],
    ]
    for (const [n, prev, yes, no] of cases) {
      expect(isVisible(q(n), { [prev]: yes })).toBe(true)
      expect(isVisible(q(n), { [prev]: no })).toBe(false)
      expect(isVisible(q(n), {})).toBe(false)
    }
  })

  it('q82(치료 내용)는 현재 치료(q80)나 과거 치료(q81) 중 하나라도 네면 보인다', () => {
    expect(isVisible(q(82), { q80: '네', q81: '아니오' })).toBe(true)
    expect(isVisible(q(82), { q80: '아니오', q81: '네' })).toBe(true)
    expect(isVisible(q(82), { q80: '아니오', q81: '아니오' })).toBe(false)
    expect(isVisible(q(82), {})).toBe(false)
  })

  it('q72~q74 는 교육해본 적이 있을 때만, q75 는 훈련소 경험이 있을 때만 보이고 그때만 필수다', () => {
    const none = '뭔가를 교육해본 적은 없다'
    const home = '전문가와 교육 해본 적은 없지만 집에서 해보았다.'
    const school = '훈련소를 다녀봤고 수료했다.'
    for (const n of [72, 73, 74, 75]) {
      expect(isVisible(q(n), { q71: none })).toBe(false)
      expect(isRequired(q(n), { q71: none })).toBe(false)
      expect(isVisible(q(n), {})).toBe(false)
    }
    for (const n of [72, 73, 74]) expect(isRequired(q(n), { q71: home })).toBe(true)
    expect(isVisible(q(75), { q71: home })).toBe(false)
    expect(isRequired(q(75), { q71: school })).toBe(true)
  })

  it("'없음' 은 q30·q79·q83 에서 다른 선택지와 같이 고를 수 없고, q21 은 a·b 에서 하나씩이다", () => {
    for (const n of [30, 79, 83]) expect(q(n).exclusive).toBe('없음')
    expect(q(21).onePer).toEqual(['a.', 'b.'])
  })

  it('기타가 있는 문항은 other 가 참이고 options 에 기타가 없다', () => {
    const others = [14, 16, 27, 29, 30, 33, 34, 50, 51, 55, 56, 63, 68, 69, 78, 79, 83, 86, 92, 96, 97]
    for (const x of qs) {
      const n = Number(x.id.slice(1))
      expect(x.other === true).toBe(others.includes(n))
      expect((x.options ?? []).some((o) => o.startsWith('기타'))).toBe(false)
    }
  })

  it('q69 는 선택지 22개, q83 은 48개다. 둘 다 한 줄에 하나씩이고 q83 의 소제목은 실제 선택지 앞에 붙는다', () => {
    expect(q(69).options).toHaveLength(22)
    expect(q(83).options).toHaveLength(48)
    expect(q(69).layout).toBe('list')
    expect(q(83).layout).toBe('list')
    for (const option of Object.keys(q(83).headings!)) expect(q(83).options).toContain(option)
    expect(Object.keys(q(83).headings!)).toHaveLength(9)
  })
})
