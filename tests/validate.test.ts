import { describe, expect, it } from 'vitest'
import { applyForm } from '../forms/apply'
import { allQuestions, blockedBy, isRequired, isVisible, visibleAnswers } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef, Group } from '../forms/types'
import { validateForm, validateGroup } from '../lib/validate'

const TODAY = '2026-10-23'
const guardian = applyForm.groups[0]
const pet = applyForm.groups[1]
const visit = applyForm.groups[2]
const msg = (errs: { questionId: string; message: string }[], id: string) =>
  errs.find((e) => e.questionId === id)?.message

describe('답변 검증', () => {
  it('필수를 비우면 문항마다 오류가 난다', () => {
    const errs = validateGroup(guardian, {}, TODAY)
    expect(msg(errs, 'guardian_name')).toBe('꼭 적어 주세요')
    expect(msg(errs, 'guardian_phone')).toBe('꼭 적어 주세요')
    expect(msg(errs, 'privacy_consent')).toBe('동의해야 신청할 수 있어요')
  })

  it('연락처에 글자가 섞이면 거부한다', () => {
    const errs = validateGroup(guardian, { guardian_name: '가', guardian_phone: '010-abcd', privacy_consent: '동의' }, TODAY)
    expect(msg(errs, 'guardian_phone')).toBe('연락처를 다시 확인해 주세요')
  })

  it('하이픈 없는 11자리는 통과한다', () => {
    const errs = validateGroup(guardian, { guardian_name: '가', guardian_phone: '01012345678', privacy_consent: '동의' }, TODAY)
    expect(errs).toEqual([])
  })

  it('짧은 답 201자는 거부하고 200자는 통과한다', () => {
    const base: Answers = { guardian_name: 'a'.repeat(200), guardian_phone: '01012345678', privacy_consent: '동의' }
    expect(validateGroup(guardian, base, TODAY)).toEqual([])
    const errs = validateGroup(guardian, { ...base, guardian_name: 'a'.repeat(201) }, TODAY)
    expect(msg(errs, 'guardian_name')).toBe('200자까지 적을 수 있어요')
  })

  it('긴 답 3001자는 거부한다', () => {
    const errs = validateGroup(pet, { pet_health: 'a'.repeat(3001), pet_treatment: 'a'.repeat(3000) }, TODAY)
    expect(msg(errs, 'pet_health')).toBe('3,000자까지 적을 수 있어요')
    expect(msg(errs, 'pet_treatment')).toBeUndefined()
  })

  it('선택지에 없는 값은 거부한다', () => {
    const errs = validateGroup(pet, { pet_sex: '기타' }, TODAY)
    expect(msg(errs, 'pet_sex')).toBe('고를 수 없는 값이에요')
  })

  it('희망 날짜가 오늘 이전이면 거부한다', () => {
    const errs = validateGroup(visit, { wish1_date: '2026-10-22' }, TODAY)
    expect(msg(errs, 'wish1_date')).toBe('오늘 이후 날짜를 골라 주세요')
  })

  it('희망 날짜 형식이 틀리면 거부한다', () => {
    const errs = validateGroup(visit, { wish1_date: '10/28' }, TODAY)
    expect(msg(errs, 'wish1_date')).toBe('날짜를 골라 주세요')
  })

  it('희망 날짜가 오늘이면 통과한다', () => {
    const errs = validateGroup(visit, { wish1_date: TODAY }, TODAY)
    expect(msg(errs, 'wish1_date')).toBeUndefined()
  })

  it('2순위 날짜가 있으면 시간대도 있어야 한다', () => {
    const errs = validateGroup(visit, { wish2_date: '2026-10-30' }, TODAY)
    expect(msg(errs, 'wish2_slot')).toBe('하나를 골라 주세요')
    expect(msg(validateGroup(visit, {}, TODAY), 'wish2_slot')).toBeUndefined()
  })

  it('복수 선택이 빈 배열이면 거부한다', () => {
    const errs = validateGroup(visit, { services: [] }, TODAY)
    expect(msg(errs, 'services')).toBe('하나 이상 골라 주세요')
  })

  it('validateForm 은 모든 묶음의 오류를 모은다', () => {
    const errs = validateForm(applyForm, {}, TODAY)
    expect(msg(errs, 'guardian_name')).toBeDefined()
    expect(msg(errs, 'pet_health')).toBeDefined()
    expect(msg(errs, 'wish1_date')).toBeDefined()
  })
})

const fake: FormDef = {
  id: 'survey',
  title: '가짜',
  groups: [
    {
      id: 'g',
      title: 'g',
      questions: [
        { id: 'a', label: 'a', type: 'single', required: true, options: ['예', '아니오', '없음'], blockIf: { value: '없음', message: '이용할 수 없어요' } },
        { id: 'b', label: 'b', type: 'short', required: true, showIf: { questionId: 'a', equals: '예' } },
        { id: 'm', label: 'm', type: 'multi', required: true, options: ['x', 'y'] },
        { id: 'c', label: 'c', type: 'short', required: true, optionalIfOnly: { questionId: 'm', value: 'x' } },
      ],
    },
  ],
}
const chain: FormDef = {
  id: 'survey',
  title: '사슬',
  groups: [
    {
      id: 'g',
      title: 'g',
      questions: [
        { id: 'p', label: 'p', type: 'single', required: true, options: ['예', '아니오'] },
        { id: 'q', label: 'q', type: 'short', required: false, showIf: { questionId: 'p', equals: '예' } },
        { id: 'r', label: 'r', type: 'short', required: false, showIf: { questionId: 'q', equals: '네' } },
      ],
    },
  ],
}
const g: Group = fake.groups[0]
const [qa, qb, , qc] = g.questions

describe('규칙', () => {
  it('showIf 가 안 맞으면 보이지 않고 검사하지 않는다', () => {
    const a: Answers = { a: '아니오', m: ['y'], c: 'z' }
    expect(isVisible(qb, a)).toBe(false)
    expect(isRequired(qb, a)).toBe(false)
    expect(msg(validateGroup(g, a, TODAY), 'b')).toBeUndefined()
    expect(msg(validateGroup(g, { ...a, a: '예' }, TODAY), 'b')).toBe('꼭 적어 주세요')
  })

  it('optionalIfOnly 가 맞으면 필수가 풀린다', () => {
    expect(isRequired(qc, { m: ['x'] })).toBe(false)
    expect(isVisible(qc, { m: ['x'] })).toBe(false)
    expect(isRequired(qc, { m: ['x', 'y'] })).toBe(true)
    expect(isRequired(qa, {})).toBe(true)
  })

  it('blockIf 값이면 그 메시지를 낸다', () => {
    const a: Answers = { a: '없음', m: ['y'], c: 'z' }
    expect(blockedBy(g, a)).toEqual({ questionId: 'a', message: '이용할 수 없어요' })
    expect(msg(validateGroup(g, a, TODAY), 'a')).toBe('이용할 수 없어요')
    expect(blockedBy(g, { a: '예' })).toBeNull()
  })

  it('visibleAnswers: showIf 가 안 맞는 문항의 답은 빠지고 맞으면 남는다', () => {
    const a: Answers = { a: '아니오', b: '숨은 답', m: ['y'], c: 'z' }
    expect(visibleAnswers(fake, a)).toEqual({ a: '아니오', m: ['y'], c: 'z' })
    expect(visibleAnswers(fake, { ...a, a: '예' })).toEqual({ a: '예', b: '숨은 답', m: ['y'], c: 'z' })
    // 부모 답이 아예 없어도 자식은 숨은 것이다.
    expect(visibleAnswers(fake, { b: '숨은 답' })).toEqual({})
  })

  it('visibleAnswers: optionalIfOnly 로 숨은 문항의 답도 빠진다', () => {
    expect(visibleAnswers(fake, { m: ['x'], c: '숨은 답' })).toEqual({ m: ['x'] })
    expect(visibleAnswers(fake, { m: ['x', 'y'], c: '보이는 답' })).toEqual({ m: ['x', 'y'], c: '보이는 답' })
  })

  it('visibleAnswers: 양식에 없는 키는 빠진다', () => {
    const a: Answers = { a: '예', 없는키: '버려요', constructor: '이것도' }
    expect(visibleAnswers(fake, a)).toEqual({ a: '예' })
  })

  it('visibleAnswers: 부모가 숨으면 자식도 숨는다(걸러 낸 결과를 기준으로 본다)', () => {
    // 손자 r 의 조건(q 가 '네')은 받은 답으로는 맞지만, q 가 p 때문에 숨었으니 r 도 숨은 것이다.
    const stale: Answers = { p: '아니오', q: '네', r: '손자 답' }
    expect(visibleAnswers(chain, stale)).toEqual({ p: '아니오' })
    expect(visibleAnswers(chain, { ...stale, p: '예' })).toEqual({ p: '예', q: '네', r: '손자 답' })
  })

  it('visibleAnswers: 받은 답을 바꾸지 않고 새 객체를 돌려준다', () => {
    const a: Answers = { a: '아니오', b: '숨은 답' }
    const shown = visibleAnswers(fake, a)
    expect(shown).not.toBe(a)
    expect(a).toEqual({ a: '아니오', b: '숨은 답' })
  })
})

describe('기타 선택지', () => {
  // q14: 단일 선택 + 기타, q16: 복수 선택 + 기타(검사지 원문 그대로).
  const single = surveyForm.groups.find((g) => g.id === 'c')!
  const multi = surveyForm.groups.find((g) => g.id === 'd')!
  const optionOf = (id: string) => allQuestions(surveyForm).find((q) => q.id === id)!.options![0]
  const q14 = (v: string) => msg(validateGroup(single, { q14: v }, TODAY), 'q14')
  const q16 = (v: string[]) => msg(validateGroup(multi, { q16: v }, TODAY), 'q16')

  it.each([
    ['내용이 없으면', '기타: '],
    ['내용이 공백뿐이면', '기타:    '],
    ['내용이 줄바꿈과 탭뿐이면', '기타: \t\n'],
    ['내용이 전각 공백뿐이면', '기타: \u3000'],
  ])('단일: 기타를 골랐는데 %s "기타 내용을 적어 주세요"', (_, v) => {
    expect(q14(v)).toBe('기타 내용을 적어 주세요')
  })

  it('단일: 기타 내용이 있으면 통과한다', () => {
    expect(q14('기타: 직접')).toBeUndefined()
    expect(q14('기타:    직접')).toBeUndefined()
  })

  it.each([
    ['내용이 없으면', ['기타: ']],
    ['내용이 공백뿐이면', ['기타:    ']],
    ['다른 선택지와 함께여도 내용이 없으면', [optionOf('q16'), '기타: ']],
    ['기타가 둘이고 하나만 비어 있으면', ['기타: 직접', '기타:  ']],
  ])('복수: 기타를 골랐는데 %s "기타 내용을 적어 주세요"', (_, v) => {
    expect(q16(v)).toBe('기타 내용을 적어 주세요')
  })

  it('복수: 기타 내용이 있으면 통과한다', () => {
    expect(q16(['기타: 직접'])).toBeUndefined()
    expect(q16([optionOf('q16'), '기타: 직접'])).toBeUndefined()
  })

  it('기타: 로 시작하지 않는 값은 여전히 고를 수 없는 값이다', () => {
    expect(q14('기타:')).toBe('고를 수 없는 값이에요')
    expect(q14('기타')).toBe('고를 수 없는 값이에요')
    expect(q16(['기타:'])).toBe('고를 수 없는 값이에요')
  })

  it('기타 선택지가 없는 문항은 기타: 값을 고를 수 없는 값으로 본다', () => {
    // pet_sex 는 other 가 없다. 내용이 비었든 있든 같은 문구다.
    expect(msg(validateGroup(pet, { pet_sex: '기타: ' }, TODAY), 'pet_sex')).toBe('고를 수 없는 값이에요')
    expect(msg(validateGroup(pet, { pet_sex: '기타: 직접' }, TODAY), 'pet_sex')).toBe('고를 수 없는 값이에요')
  })
})
