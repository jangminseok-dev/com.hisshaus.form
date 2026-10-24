import { describe, expect, it } from 'vitest'
import { DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { wishText } from '../lib/wish'

// 2026-11-01 은 일요일, 2026-11-02 는 월요일이다.
describe('희망 일시 한 줄', () => {
  it('서비스 하나면 이름 없이 일시만 — 날짜만 적었으면 날짜만', () => {
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '2026-11-01' })).toBe('11월 1일 (일)')
    expect(wishText({ services: [DAYCARE_SERVICE], daycare_date: '2026-11-02' })).toBe('11월 2일 (월)')
    expect(wishText({ services: [TRAINING_SERVICE], training_date: '2026-11-02' })).toBe('11월 2일 (월)')
  })

  it('서비스 하나, 날짜와 시간대를 둘 다 적었으면 날짜 뒤에 시간대를 그대로 붙인다', () => {
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '2026-11-01', groom_time: '기타: 오후 2시' })).toBe('11월 1일 (일) 오후 2시')
    expect(wishText({ services: [DAYCARE_SERVICE], daycare_date: '2026-11-02', daycare_time: ' 10시~16시 ' })).toBe('11월 2일 (월) 10시~16시')
  })

  it('호텔은 체크인을 적은 그대로 뒤에 체크인을 붙인다', () => {
    expect(wishText({ services: [HOTEL_SERVICE], hotel_checkin: '11/3 15:00', hotel_checkout: '11/5 11:00' })).toBe('11/3 15:00 체크인')
  })

  it('서비스가 둘 이상이면 이름을 앞에 붙여 정의 순서(미용·데이케어·호텔·교육미용)로 쉼표로 잇는다', () => {
    const a = {
      services: [HOTEL_SERVICE, GROOMING_SERVICE],
      groom_date: '2026-11-01',
      groom_time: '오후',
      hotel_checkin: '11/3',
      hotel_checkout: '11/5',
    }
    expect(wishText(a)).toBe('미용 11월 1일 (일) 오후, 호텔 11/3 체크인')
    expect(
      wishText({
        services: [TRAINING_SERVICE, DAYCARE_SERVICE],
        daycare_date: '2026-11-02',
        training_date: '2026-11-01',
        training_time: '오전',
      }),
    ).toBe('데이케어 11월 2일 (월), 교육미용 11월 1일 (일) 오전')
  })

  it('고르지 않은 서비스의 답은 섞이지 않는다', () => {
    const a = { services: [GROOMING_SERVICE], groom_date: '2026-11-01', hotel_checkin: '옛 답', training_date: '2026-11-02' }
    expect(wishText(a)).toBe('11월 1일 (일)')
  })

  it('아무 날짜도 없으면 빈 문자열이다', () => {
    expect(wishText({})).toBe('')
    expect(wishText({ services: [] })).toBe('')
    expect(wishText({ services: [GROOMING_SERVICE] })).toBe('')
    expect(wishText({ services: [GROOMING_SERVICE], groom_date: '  ', groom_time: '오후' })).toBe('오후')
    expect(wishText({ services: [HOTEL_SERVICE], hotel_checkout: '11/5' })).toBe('')
  })

  it('둘을 골랐으면 일시를 적은 서비스가 하나뿐이어도 이름을 붙인다 — 어느 서비스의 일시인지 보이게', () => {
    expect(wishText({ services: [GROOMING_SERVICE, HOTEL_SERVICE], groom_date: '2026-11-01' })).toBe('미용 11월 1일 (일)')
  })
})
