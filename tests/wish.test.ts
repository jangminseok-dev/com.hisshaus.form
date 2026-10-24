import { describe, expect, it } from 'vitest'
import { DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { wishText } from '../lib/wish'

// 2026-11-01 은 일요일, 2026-11-02 는 월요일, 2026-11-03 은 화요일이다.
describe('희망 일시 한 줄', () => {
  it('서비스 하나면 이름 없이 일시만 — 날짜만 골랐으면 날짜만', () => {
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '2026-11-01' })).toBe('11월 1일 (일)')
    expect(wishText({ services: [DAYCARE_SERVICE], daycare_date: '2026-11-02' })).toBe('11월 2일 (월)')
    expect(wishText({ services: [TRAINING_SERVICE], training_date: '2026-11-02' })).toBe('11월 2일 (월)')
  })

  it('서비스 하나, 날짜와 시간을 둘 다 골랐으면 날짜 뒤에 시간을 오전·오후 꼴로 붙인다', () => {
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '2026-11-01', groom_time: '14:00' })).toBe('11월 1일 (일) 오후 2:00')
    expect(wishText({ services: [DAYCARE_SERVICE], daycare_date: '2026-11-02', daycare_time: '10:00' })).toBe('11월 2일 (월) 오전 10:00')
    expect(wishText({ services: [TRAINING_SERVICE], training_date: '2026-11-02', training_time: '12:30' })).toBe('11월 2일 (월) 오후 12:30')
  })

  it('호텔은 체크인 날짜·시간 뒤에 체크인을 붙인다 — 체크아웃은 요약에 넣지 않는다', () => {
    const a = {
      services: [HOTEL_SERVICE],
      hotel_checkin_date: '2026-11-03',
      hotel_checkin_time: '15:00',
      hotel_checkout_date: '2026-11-05',
      hotel_checkout_time: '11:00',
    }
    expect(wishText(a)).toBe('11월 3일 (화) 오후 3:00 체크인')
    expect(wishText({ services: [HOTEL_SERVICE], hotel_checkin_date: '2026-11-03' })).toBe('11월 3일 (화) 체크인')
  })

  it('시간만 있고 날짜가 없으면 시간만 붙인다', () => {
    expect(wishText({ services: [GROOMING_SERVICE], groom_time: '13:00' })).toBe('오후 1:00')
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '  ', groom_time: '13:00' })).toBe('오후 1:00')
    expect(wishText({ services: [HOTEL_SERVICE], hotel_checkin_time: '15:00' })).toBe('오후 3:00 체크인')
  })

  it('서비스가 둘 이상이면 이름을 앞에 붙여 정의 순서(미용·데이케어·호텔·교육미용)로 쉼표로 잇는다', () => {
    const a = {
      services: [HOTEL_SERVICE, GROOMING_SERVICE],
      groom_date: '2026-11-01',
      groom_time: '13:00',
      hotel_checkin_date: '2026-11-03',
      hotel_checkout_date: '2026-11-05',
    }
    expect(wishText(a)).toBe('미용 11월 1일 (일) 오후 1:00, 호텔 11월 3일 (화) 체크인')
    expect(
      wishText({
        services: [TRAINING_SERVICE, DAYCARE_SERVICE],
        daycare_date: '2026-11-02',
        training_date: '2026-11-01',
        training_time: '10:00',
      }),
    ).toBe('데이케어 11월 2일 (월), 교육미용 11월 1일 (일) 오전 10:00')
  })

  it('고르지 않은 서비스의 답은 섞이지 않는다', () => {
    const a = { services: [GROOMING_SERVICE], groom_date: '2026-11-01', hotel_checkin_date: '2026-11-03', training_date: '2026-11-02' }
    expect(wishText(a)).toBe('11월 1일 (일)')
  })

  it('아무 일시도 없으면 빈 문자열이다', () => {
    expect(wishText({})).toBe('')
    expect(wishText({ services: [] })).toBe('')
    expect(wishText({ services: [GROOMING_SERVICE] })).toBe('')
    expect(wishText({ services: [HOTEL_SERVICE], hotel_checkout_date: '2026-11-05', hotel_checkout_time: '11:00' })).toBe('')
  })

  it('둘을 골랐으면 일시를 적은 서비스가 하나뿐이어도 이름을 붙인다 — 어느 서비스의 일시인지 보이게', () => {
    expect(wishText({ services: [GROOMING_SERVICE, HOTEL_SERVICE], groom_date: '2026-11-01' })).toBe('미용 11월 1일 (일)')
  })
})
