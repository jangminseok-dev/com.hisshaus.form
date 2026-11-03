import { describe, expect, it } from 'vitest'
import { shop } from '../content/shop'
import { isOpenDay, timeKo, timeSlots } from '../lib/slots'

/** 'HH:MM' 에서 'HH:MM' 까지 30분 간격(마지막 포함). */
const every30 = (from: string, to: string): string[] => {
  const min = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))
  const out: string[] = []
  for (let t = min(from); t <= min(to); t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  return out
}

// 영업시간은 화요일(쉬는 날)을 뺀 매일 10:00~20:00 이다(content/shop.ts). 2026-11-01 은 일요일, 11-03 은 화요일, 11-05 는 목요일이다.
describe('시간 칸', () => {
  it('영업시간 표가 첫 화면 문구와 같은 값이다 — 둘 중 하나만 바꾸면 알아챈다', () => {
    expect(shop.openHours).toEqual([{ days: [0, 1, 3, 4, 5, 6], open: '10:00', close: '20:00' }])
    expect(shop.hours).toBe('매일 10:00~20:00\n화요일·공휴일 휴무')
  })

  it('날짜가 없으면 모든 요일을 합친 범위 10:00~19:30, 30분 단위 20개다', () => {
    const slots = timeSlots()
    expect(slots).toHaveLength(20)
    expect(slots).toEqual(every30('10:00', '19:30'))
  })

  it('화요일은 쉬는 날이라 칸이 없다', () => {
    expect(timeSlots('2026-11-03')).toEqual([])
  })

  it('화요일 밖의 모든 요일은 10:00~19:30 20개다 — 문 닫는 20:00 은 없다', () => {
    // 2026-11-02 월, 11-04 수, 11-05 목, 11-06 금, 11-07 토, 11-01 일.
    for (const d of ['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-01']) {
      expect(timeSlots(d)).toEqual(every30('10:00', '19:30'))
    }
    expect(timeSlots('2026-11-01')).not.toContain('20:00')
  })

  it('isOpenDay 는 영업시간 표에 없는 요일(화요일)만 거짓이다', () => {
    for (const d of ['2026-11-03', '2026-11-10']) expect(isOpenDay(d)).toBe(false)
    for (const d of ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) expect(isOpenDay(d)).toBe(true)
  })

  it('isOpenDay 는 공휴일 목록에 든 날도 거짓이다', () => {
    // 2026-12-25 는 금요일(여는 요일)이지만 공휴일이다.
    expect(isOpenDay('2026-12-25', ['2026-12-25'])).toBe(false)
    expect(isOpenDay('2026-12-24', ['2026-12-25'])).toBe(true)
    expect(isOpenDay('2026-12-25')).toBe(true)
  })

  it('날짜 꼴이 아니면 합집합이다', () => {
    for (const d of ['', '11/3', '2026-11-3', '어제']) expect(timeSlots(d)).toEqual(timeSlots())
  })

  it('timeKo 는 오전·오후와 12시간 표기로 바꾸고, 시간 꼴이 아니면 그대로 둔다', () => {
    expect(timeKo('10:00')).toBe('오전 10:00')
    expect(timeKo('12:00')).toBe('오후 12:00')
    expect(timeKo('13:30')).toBe('오후 1:30')
    expect(timeKo('19:30')).toBe('오후 7:30')
    expect(timeKo('00:30')).toBe('오전 12:30')
    for (const v of ['', '오후', '9:00', '10시', '기타: 오후 2시']) expect(timeKo(v)).toBe(v)
  })
})
