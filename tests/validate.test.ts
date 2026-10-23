import { describe, expect, it } from 'vitest'
import { applyForm } from '../forms/apply'
import { blockedBy, isRequired, isVisible } from '../forms/rules'
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
})
