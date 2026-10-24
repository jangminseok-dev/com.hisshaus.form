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

  it('서비스 선택지는 미용·데이케어·호텔·교육미용 넷이다', () => {
    expect(question('services').options).toEqual([GROOMING_SERVICE, DAYCARE_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE])
    expect(question('services').required).toBe(true)
  })

  it('필수 문항은 보호자·반려견·이용 안내 전부와 서비스별 날짜(호텔은 체크인·체크아웃)뿐이다', () => {
    const required = allQuestions(applyForm)
      .filter((q) => q.required)
      .map((q) => q.id)
    const always = ['guardian', 'pet', 'visit'].flatMap((id) => group(id).questions.map((q) => q.id))
    expect(required).toEqual([...always, 'groom_date', 'daycare_date', 'hotel_checkin', 'hotel_checkout', 'training_date'])
    // 예약금 안내의 요청 사항은 선택이다.
    expect(group('deposit').questions.map((q) => [q.id, q.required])).toEqual([['request', false]])
  })

  it('서비스별 날짜 문항은 date 유형이고 호텔 체크인·체크아웃은 날짜와 시간을 함께 적는 글이다', () => {
    for (const id of ['groom_date', 'daycare_date', 'training_date']) expect(question(id).type).toBe('date')
    expect(question('hotel_checkin').type).toBe('short')
    expect(question('hotel_checkout').type).toBe('short')
  })

  it('라벨이 겹치지 않는다 — 시트 열 이름이라 묶음이 달라도 가려져야 한다', () => {
    const labels = allQuestions(applyForm).map((x) => x.label)
    expect(new Set(labels).size).toBe(labels.length)
    // 미용의 '희망 시간대' 와 겹치지 않게 교육미용 쪽은 앞에 교육미용을 붙였다.
    expect(question('training_time').label).toBe('교육미용 희망 시간대')
  })

  it('신청서에는 requiredIf·문항 showIf·blockIf 를 쓰지 않는다 — 조건은 묶음 showIf 하나다', () => {
    for (const q of allQuestions(applyForm)) {
      expect(q.requiredIf).toBeUndefined()
      expect(q.showIf).toBeUndefined()
      expect(q.blockIf).toBeUndefined()
    }
  })
})
