import { describe, expect, it } from 'vitest'
import { applyForm, DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { allQuestions } from '../forms/rules'

const group = (id: string) => applyForm.groups.find((g) => g.id === id)!
const question = (id: string) => allQuestions(applyForm).find((q) => q.id === id)!

describe('신청서 정의', () => {
  it('묶음은 보호자·반려견·이용 안내, 서비스별 넷, 예약금 안내 순서고 문항 id 가 겹치지 않는다', () => {
    expect(applyForm.groups.map((g) => g.id)).toEqual(['guardian', 'pet', 'visit', 'grooming', 'daycare', 'hotel', 'training', 'deposit'])
    const ids = allQuestions(applyForm).map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('서비스별 묶음은 이용 서비스에서 그 서비스를 골랐을 때만 보이고, 나머지 묶음은 조건이 없다', () => {
    expect(group('grooming').showIf).toEqual({ questionId: 'services', includes: GROOMING_SERVICE })
    expect(group('daycare').showIf).toEqual({ questionId: 'services', includes: DAYCARE_SERVICE })
    expect(group('hotel').showIf).toEqual({ questionId: 'services', includes: HOTEL_SERVICE })
    expect(group('training').showIf).toEqual({ questionId: 'services', includes: TRAINING_SERVICE })
    for (const id of ['guardian', 'pet', 'visit', 'deposit']) expect(group(id).showIf).toBeUndefined()
    // 조건이 가리키는 문항은 서비스별 묶음보다 앞 묶음의 복수 선택이다.
    expect(question('services').type).toBe('multi')
    expect(applyForm.groups.indexOf(group('visit'))).toBeLessThan(applyForm.groups.indexOf(group('grooming')))
  })

  it('서비스 선택지는 미용·데이케어·호텔·교육미용 넷에 기타 직접 입력이고, 알게 된 경로는 선택이다', () => {
    expect(question('services').options).toEqual([GROOMING_SERVICE, DAYCARE_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE])
    expect(question('services').required).toBe(true)
    expect(question('services').other).toBe(true)
    expect(question('visit_source')).toMatchObject({ type: 'single', required: false, other: true, options: ['인스타그램', '블로그', '지인 소개', '간판'] })
  })

  it('필수 문항은 보호자·반려견·이용 안내 전부와 서비스별 날짜(호텔은 체크인·체크아웃 날짜와 시간)뿐이다', () => {
    const required = allQuestions(applyForm)
      .filter((q) => q.required)
      .map((q) => q.id)
    // 이용 서비스 묶음에서 알게 된 경로만 선택이다.
    const always = ['guardian', 'pet', 'visit'].flatMap((id) => group(id).questions.filter((q) => q.id !== 'visit_source').map((q) => q.id))
    expect(required).toEqual([
      ...always,
      'groom_date',
      'daycare_date',
      'hotel_checkin_date',
      'hotel_checkin_time',
      'hotel_checkout_date',
      'hotel_checkout_time',
      'training_date',
    ])
    // 예약금 안내의 요청 사항은 선택이다.
    expect(group('deposit').questions.map((q) => [q.id, q.required])).toEqual([['request', false]])
  })

  it('서비스별 날짜 문항은 date 유형이고 시간 문항은 짝 날짜를 가리키는 time 유형이다', () => {
    for (const id of ['groom_date', 'daycare_date', 'hotel_checkin_date', 'hotel_checkout_date', 'training_date']) {
      expect(question(id).type).toBe('date')
    }
    const pairs: [string, string][] = [
      ['groom_time', 'groom_date'],
      ['daycare_time', 'daycare_date'],
      ['hotel_checkin_time', 'hotel_checkin_date'],
      ['hotel_checkout_time', 'hotel_checkout_date'],
      ['training_time', 'training_date'],
    ]
    for (const [time, date] of pairs) {
      expect(question(time).type).toBe('time')
      expect(question(time).dateId).toBe(date)
      // 짝 날짜는 같은 묶음의 앞 문항이다(화면이 날짜 답을 시간 칩에 넘긴다).
      const g = applyForm.groups.find((x) => x.questions.some((q) => q.id === time))!
      const ids = g.questions.map((q) => q.id)
      expect(ids.indexOf(date)).toBeGreaterThanOrEqual(0)
      expect(ids.indexOf(date)).toBeLessThan(ids.indexOf(time))
    }
    // 시간 문항에 선택지는 없다(영업시간이 정한다).
    for (const q of allQuestions(applyForm).filter((x) => x.type === 'time')) expect(q.options).toBeUndefined()
  })

  it('라벨이 겹치지 않는다 — 시트 열 이름이라 묶음이 달라도 가려져야 한다', () => {
    const labels = allQuestions(applyForm).map((x) => x.label)
    expect(new Set(labels).size).toBe(labels.length)
    // 미용의 '희망 시간' 과 겹치지 않게 교육미용 쪽은 앞에 교육미용을 붙였다.
    expect(question('training_time').label).toBe('교육미용 희망 시간')
    // 호텔은 날짜와 시간을 나눠 받는다.
    expect(['hotel_checkin_date', 'hotel_checkin_time', 'hotel_checkout_date', 'hotel_checkout_time'].map((id) => question(id).label)).toEqual([
      '체크인 날짜',
      '체크인 시간',
      '체크아웃 날짜',
      '체크아웃 시간',
    ])
  })

  it('신청서에는 requiredIf·문항 showIf·blockIf 를 쓰지 않는다 — 조건은 묶음 showIf 하나다', () => {
    for (const q of allQuestions(applyForm)) {
      expect(q.requiredIf).toBeUndefined()
      expect(q.showIf).toBeUndefined()
      expect(q.blockIf).toBeUndefined()
    }
  })
})
