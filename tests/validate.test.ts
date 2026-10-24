import { describe, expect, it } from 'vitest'
import { applyForm, DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import {
  allQuestions,
  blockedBy,
  isEmpty,
  isGroupVisible,
  isRequired,
  isVisible,
  visibleAnswers,
  visibleGroups,
} from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef, Group } from '../forms/types'
import { validateForm, validateGroup } from '../lib/validate'
import { validAnswers } from './fixtures'

const TODAY = '2026-10-23'
const guardian = applyForm.groups[0]
const pet = applyForm.groups[1]
const visit = applyForm.groups[2]
const groupOf = (id: string) => applyForm.groups.find((g) => g.id === id)!
const grooming = groupOf('grooming')
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

  // 숫자·공백·하이픈·괄호와 맨 앞의 + 만 받고, 숫자는 9자 이상이어야 한다.
  const phone = (v: string) => msg(validateGroup(guardian, { guardian_name: '가', guardian_phone: v, privacy_consent: '동의' }, TODAY), 'guardian_phone')

  it.each(['+82 10-1234-5678', '(02) 123-4567', '010 1234 5678', '010-1234-5678', '02-123-4567'])('연락처 %s 는 통과한다', (v) => {
    expect(phone(v)).toBeUndefined()
  })

  it.each([
    ['글자가 섞이면', '010-1234-567가'],
    ['영문이 섞이면', '+82 10-ABCD-5678'],
    ['+ 가 맨 앞이 아니면', '010+1234-5678'],
    ['+ 가 둘이면', '++82 10-1234-5678'],
    ['다른 기호가 섞이면', '010.1234.5678'],
    ['숫자가 9자 미만이면', '(02) 123-456'],
  ])('연락처는 %s 거부한다', (_, v) => {
    expect(phone(v)).toBe('연락처를 다시 확인해 주세요')
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
    const errs = validateGroup(grooming, { groom_date: '2026-10-22' }, TODAY)
    expect(msg(errs, 'groom_date')).toBe('오늘 이후 날짜를 골라 주세요')
  })

  it('희망 날짜 형식이 틀리면 거부한다', () => {
    const errs = validateGroup(grooming, { groom_date: '10/28' }, TODAY)
    expect(msg(errs, 'groom_date')).toBe('날짜를 골라 주세요')
  })

  it('희망 날짜가 오늘이면 통과한다', () => {
    const errs = validateGroup(grooming, { groom_date: TODAY }, TODAY)
    expect(msg(errs, 'groom_date')).toBeUndefined()
  })

  it('서비스별 묶음은 날짜(호텔은 체크인·체크아웃 날짜와 시간)만 필수고 나머지는 비워도 된다', () => {
    expect(validateGroup(grooming, { groom_date: TODAY }, TODAY)).toEqual([])
    expect(validateGroup(groupOf('daycare'), { daycare_date: TODAY }, TODAY)).toEqual([])
    expect(validateGroup(groupOf('training'), { training_date: TODAY }, TODAY)).toEqual([])
    // 2026-11-03 은 화요일(10:00~15:30), 2026-11-05 는 목요일이다.
    const hotel = { hotel_checkin_date: '2026-11-03', hotel_checkin_time: '15:00', hotel_checkout_date: '2026-11-05', hotel_checkout_time: '11:00' }
    expect(validateGroup(groupOf('hotel'), hotel, TODAY)).toEqual([])
    expect(validateGroup(groupOf('hotel'), { hotel_checkin_date: '2026-11-03', hotel_checkin_time: '15:00' }, TODAY).map((e) => e.questionId)).toEqual([
      'hotel_checkout_date',
      'hotel_checkout_time',
    ])
    expect(validateGroup(groupOf('deposit'), {}, TODAY)).toEqual([])
  })

  describe('시간', () => {
    const timeQ = allQuestions(applyForm).find((q) => q.id === 'hotel_checkin_time')!
    const optional = allQuestions(applyForm).find((q) => q.id === 'groom_time')!
    // 2026-11-03 은 화요일(10:00~15:30), 2026-11-05 는 목요일(10:00~19:30)이다.
    const TUE = '2026-11-03'
    const THU = '2026-11-05'

    it('필수 시간을 비우면 시간을 골라 달라 하고, 선택 시간은 비워도 된다', () => {
      expect(msg(validateGroup(groupOf('hotel'), { hotel_checkin_date: TUE }, TODAY), timeQ.id)).toBe('시간을 골라 주세요')
      expect(msg(validateGroup(grooming, { groom_date: TUE }, TODAY), optional.id)).toBeUndefined()
    })

    it('HH:MM 꼴이 아니거나 영업시간 밖이면 거부한다', () => {
      for (const v of ['25:00', '오후', '10:15', '09:30', '20:00', '15시']) {
        expect(msg(validateGroup(grooming, { groom_date: THU, groom_time: v }, TODAY), 'groom_time')).toBe('시간을 골라 주세요')
      }
      expect(msg(validateGroup(grooming, { groom_date: THU, groom_time: ['10:00'] }, TODAY), 'groom_time')).toBe('시간을 골라 주세요')
    })

    it('짝 날짜의 요일에는 닫는 시간이면 그날 영업시간 안의 시간을 골라 달라 한다', () => {
      // 화요일은 15:30 까지라 18:00 은 안 된다. 목요일은 된다.
      expect(msg(validateGroup(grooming, { groom_date: TUE, groom_time: '18:00' }, TODAY), 'groom_time')).toBe('그날 영업시간 안의 시간을 골라 주세요')
      expect(validateGroup(grooming, { groom_date: THU, groom_time: '18:00' }, TODAY)).toEqual([])
      expect(validateGroup(grooming, { groom_date: TUE, groom_time: '15:30' }, TODAY)).toEqual([])
      expect(msg(validateGroup(grooming, { groom_date: TUE, groom_time: '16:00' }, TODAY), 'groom_time')).toBe('그날 영업시간 안의 시간을 골라 주세요')
    })

    it('짝 날짜가 없거나 틀렸으면 합집합 안이면 통과한다 — 날짜 쪽 오류가 안내한다', () => {
      expect(validateGroup(grooming, { groom_time: '18:00' }, TODAY).map((e) => e.questionId)).toEqual(['groom_date'])
      expect(msg(validateGroup(grooming, { groom_date: '11/3', groom_time: '18:00' }, TODAY), 'groom_time')).toBeUndefined()
      expect(msg(validateGroup(grooming, { groom_date: '11/3', groom_time: '18:00' }, TODAY), 'groom_date')).toBe('날짜를 골라 주세요')
    })

    it('호텔 체크인·체크아웃 시간은 각자의 날짜를 본다', () => {
      // 체크인(화)은 15:00 까지 되고 체크아웃(목)은 18:00 도 된다. 서로 바꾸면 체크인만 틀린다.
      const ok = { hotel_checkin_date: TUE, hotel_checkin_time: '15:00', hotel_checkout_date: THU, hotel_checkout_time: '18:00' }
      expect(validateGroup(groupOf('hotel'), ok, TODAY)).toEqual([])
      const errs = validateGroup(groupOf('hotel'), { ...ok, hotel_checkin_time: '18:00' }, TODAY)
      expect(errs).toEqual([{ questionId: 'hotel_checkin_time', message: '그날 영업시간 안의 시간을 골라 주세요' }])
    })
  })

  it('복수 선택이 빈 배열이면 거부한다', () => {
    const errs = validateGroup(visit, { services: [] }, TODAY)
    expect(msg(errs, 'services')).toBe('하나 이상 골라 주세요')
  })

  it('validateForm 은 보이는 모든 묶음의 오류를 모은다', () => {
    const errs = validateForm(applyForm, { services: [GROOMING_SERVICE] }, TODAY)
    expect(msg(errs, 'guardian_name')).toBeDefined()
    expect(msg(errs, 'pet_health')).toBeDefined()
    expect(msg(errs, 'groom_date')).toBeDefined()
  })
})

describe('서비스별 묶음 — 고른 서비스의 묶음만 보인다', () => {
  const services = [GROOMING_SERVICE, HOTEL_SERVICE]

  it('isGroupVisible: showIf 가 없는 묶음은 늘 보이고, 있는 묶음은 그 서비스를 골랐을 때만 보인다', () => {
    expect(isGroupVisible(guardian, {})).toBe(true)
    expect(isGroupVisible(groupOf('deposit'), {})).toBe(true)
    expect(isGroupVisible(grooming, {})).toBe(false)
    expect(isGroupVisible(grooming, { services: [] })).toBe(false)
    expect(isGroupVisible(grooming, { services: [HOTEL_SERVICE] })).toBe(false)
    expect(isGroupVisible(grooming, { services })).toBe(true)
    expect(isGroupVisible(groupOf('hotel'), { services })).toBe(true)
    // 답이 배열이 아니어도(손으로 만든 요청) 터지지 않고 그 값 하나로 본다.
    expect(isGroupVisible(grooming, { services: GROOMING_SERVICE })).toBe(true)
  })

  it('visibleGroups: 정의 순서대로, 고른 서비스의 묶음만 끼운다', () => {
    expect(visibleGroups(applyForm, {}).map((g) => g.id)).toEqual(['guardian', 'pet', 'visit', 'deposit'])
    expect(visibleGroups(applyForm, { services }).map((g) => g.id)).toEqual(['guardian', 'pet', 'visit', 'grooming', 'hotel', 'deposit'])
    // 고른 순서가 아니라 정의 순서다.
    expect(visibleGroups(applyForm, { services: [TRAINING_SERVICE, DAYCARE_SERVICE] }).map((g) => g.id)).toEqual([
      'guardian',
      'pet',
      'visit',
      'daycare',
      'training',
      'deposit',
    ])
  })

  it('visibleAnswers: 고르지 않은 서비스 묶음의 옛 답은 버리고 고른 묶음의 답은 남긴다', () => {
    const a: Answers = {
      services: [GROOMING_SERVICE],
      groom_date: '2026-11-01',
      groom_time: '13:00',
      hotel_checkin_date: '옛 답',
      hotel_stayed: 'O',
      training_date: '2026-11-02',
      request: '요청',
    }
    expect(visibleAnswers(applyForm, a)).toEqual({ services: [GROOMING_SERVICE], groom_date: '2026-11-01', groom_time: '13:00', request: '요청' })
    expect(visibleAnswers(applyForm, { ...a, services: [GROOMING_SERVICE, HOTEL_SERVICE] })).toEqual({
      services: [GROOMING_SERVICE, HOTEL_SERVICE],
      groom_date: '2026-11-01',
      groom_time: '13:00',
      hotel_checkin_date: '옛 답',
      hotel_stayed: 'O',
      request: '요청',
    })
    // 서비스를 하나도 안 골랐으면 서비스별 묶음의 답은 전부 빠진다.
    expect(visibleAnswers(applyForm, { groom_date: '2026-11-01', hotel_checkin_date: '옛 답' })).toEqual({})
  })

  it('validateForm: 숨은 묶음의 필수가 비어도 오류가 아니고, 보이면 오류다', () => {
    const base = validAnswers(applyForm) // services 는 Grooming 하나
    expect(validateForm(applyForm, base, TODAY)).toEqual([])
    // 호텔을 고르지 않았으니 체크인·체크아웃이 비어도 된다.
    expect(validateForm(applyForm, { ...base, hotel_checkin_date: '' }, TODAY)).toEqual([])
    // 호텔을 고르면 체크인·체크아웃의 날짜와 시간 넷이 다 필수다.
    expect(validateForm(applyForm, { ...base, services }, TODAY).map((e) => e.questionId)).toEqual([
      'hotel_checkin_date',
      'hotel_checkin_time',
      'hotel_checkout_date',
      'hotel_checkout_time',
    ])
    // 숨은 묶음의 틀린 값(옛 날짜)도 검증하지 않는다.
    expect(validateForm(applyForm, { ...base, daycare_date: '2000-01-01' }, TODAY)).toEqual([])
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

describe('isEmpty — 답이 없다는 판단은 한 곳', () => {
  // each 는 배열 항목을 인자로 펼치므로 값 하나씩 한 겹 더 싼다(빈 배열·배열 답을 그대로 넘기려고).
  it.each([[undefined], [''], ['   '], ['\t\n'], [[]]])('%j 는 비어 있다', (v) => {
    expect(isEmpty(v)).toBe(true)
  })

  it.each([['가'], [' 가 '], [['x']]])('%j 는 비어 있지 않다', (v) => {
    expect(isEmpty(v)).toBe(false)
  })
})

describe('requiredIf — 앞 문항에 답이 있으면 필수', () => {
  // 신청서는 더 쓰지 않는 규칙이라(옛 2순위 날짜·시간대) 합성 문항으로 본다.
  const pair: Group = {
    id: 'g',
    title: 'g',
    questions: [
      { id: 'd', label: 'd', type: 'date', required: false },
      { id: 's', label: 's', type: 'single', required: false, options: ['오전', '오후'], requiredIf: { questionId: 'd' } },
    ],
  }
  const [, slot] = pair.questions

  it('선택 시간대는 날짜를 골랐을 때만 필수다', () => {
    expect(isRequired(slot, {})).toBe(false)
    expect(isRequired(slot, { d: '2026-10-30' })).toBe(true)
    expect(msg(validateGroup(pair, { d: '2026-10-30' }, TODAY), 's')).toBe('하나를 골라 주세요')
    expect(msg(validateGroup(pair, {}, TODAY), 's')).toBeUndefined()
  })

  it('대상이 비었거나 공백뿐이면 선택이다', () => {
    expect(isRequired(slot, { d: '' })).toBe(false)
    expect(isRequired(slot, { d: '   ' })).toBe(false)
  })

  // 특례는 문항 정의에 있다. id 로 가리지 않는다.
  const depends: FormDef = {
    id: 'survey',
    title: '조건',
    groups: [
      {
        id: 'g',
        title: 'g',
        questions: [
          { id: 'tags', label: 'tags', type: 'multi', required: false, options: ['x', 'y'] },
          { id: 'why', label: 'why', type: 'short', required: false, requiredIf: { questionId: 'tags' } },
          { id: 'gate', label: 'gate', type: 'single', required: false, options: ['예', '아니오'] },
          {
            id: 'hidden',
            label: 'hidden',
            type: 'short',
            required: false,
            requiredIf: { questionId: 'tags' },
            showIf: { questionId: 'gate', equals: '예' },
          },
          { id: 'both', label: 'both', type: 'short', required: true, requiredIf: { questionId: 'tags' } },
        ],
      },
    ],
  }
  const [, why, , hidden, both] = depends.groups[0].questions

  it('대상이 배열이면 길이로 본다', () => {
    expect(isRequired(why, { tags: [] })).toBe(false)
    expect(isRequired(why, { tags: ['x'] })).toBe(true)
  })

  it('q.required 가 이미 참이면 대상과 상관없이 필수다', () => {
    expect(isRequired(both, {})).toBe(true)
    expect(isRequired(both, { tags: ['x'] })).toBe(true)
  })

  it('보이지 않는 문항은 대상에 답이 있어도 필수가 아니다', () => {
    expect(isRequired(hidden, { tags: ['x'] })).toBe(false)
    expect(isRequired(hidden, { tags: ['x'], gate: '예' })).toBe(true)
  })

  it('validateGroup 은 requiredIf 로 필수가 된 문항을 비웠으면 알린다', () => {
    const g = depends.groups[0]
    expect(msg(validateGroup(g, { tags: ['x'], both: '가' }, TODAY), 'why')).toBe('꼭 적어 주세요')
    expect(msg(validateGroup(g, { tags: ['x'], both: '가', why: '가' }, TODAY), 'why')).toBeUndefined()
    expect(msg(validateGroup(g, { tags: [], both: '가' }, TODAY), 'why')).toBeUndefined()
  })

  it('같은 모양의 문항이라도 requiredIf 가 없으면 필수가 아니다', () => {
    const plain: Group = {
      id: 'g',
      title: 'g',
      questions: [
        { id: 'd', label: 'd', type: 'date', required: false },
        { id: 's', label: 's', type: 'single', required: false, options: ['오전'] },
      ],
    }
    expect(validateGroup(plain, { d: '2026-10-30' }, TODAY)).toEqual([])
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

describe('복수 선택의 중복·개수', () => {
  // 화면은 같은 칩을 두 번 넣지 못하고 기타도 하나뿐이다. 그 밖의 답은 손으로 만든 요청이다(시트 한 칸이 끝없이 길어진다).
  const services = (v: string[]) => msg(validateGroup(visit, { services: v }, TODAY), 'services')
  const multi = surveyForm.groups.find((g) => g.id === 'd')!
  const q16 = allQuestions(surveyForm).find((q) => q.id === 'q16')!
  const q16Of = (v: string[]) => msg(validateGroup(multi, { q16: v }, TODAY), 'q16')

  it('같은 선택지가 두 번 있으면 고를 수 없는 값이다', () => {
    expect(services(['Hotel 호텔', 'Hotel 호텔'])).toBe('고를 수 없는 값이에요')
    expect(services(['Grooming 미용', 'Hotel 호텔', 'Grooming 미용'])).toBe('고를 수 없는 값이에요')
  })

  it('같은 기타 값이 두 번 있어도 고를 수 없는 값이다', () => {
    expect(q16Of(['기타: 소파', '기타: 소파'])).toBe('고를 수 없는 값이에요')
  })

  it('선택지 수(기타가 있으면 하나 더)보다 많으면 고를 수 없는 값이다', () => {
    // q16 은 선택지 다섯 + 기타다. 서로 다른 기타 값 둘로 일곱 개를 만든다.
    expect(q16.options).toHaveLength(5)
    expect(q16.other).toBe(true)
    expect(q16Of([...q16.options!, '기타: 가', '기타: 나'])).toBe('고를 수 없는 값이에요')
  })

  it('선택지를 모두 고르고 기타 하나를 더해도 통과한다', () => {
    expect(q16Of([...q16.options!, '기타: 가'])).toBeUndefined()
    expect(services(applyForm.groups[2].questions.find((q) => q.id === 'services')!.options!)).toBeUndefined()
  })
})
