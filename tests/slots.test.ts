import { describe, expect, it } from 'vitest'
import { shop } from '../content/shop'
import { timeKo, timeSlots } from '../lib/slots'

/** 'HH:MM' 에서 'HH:MM' 까지 30분 간격(마지막 포함). */
const every30 = (from: string, to: string): string[] => {
  const min = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))
  const out: string[] = []
  for (let t = min(from); t <= min(to); t += 30) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  return out
}

// 영업시간은 월~수 10:00~16:00, 목~일 10:00~20:00 이다(content/shop.ts). 2026-11-01 은 일요일, 11-03 은 화요일, 11-05 는 목요일이다.
describe('시간 칸', () => {
  it('영업시간 표가 첫 화면 문구와 같은 값이다 — 둘 중 하나만 바꾸면 알아챈다', () => {
    expect(shop.openHours).toEqual([
      { days: [1, 2, 3], open: '10:00', close: '16:00' },
      { days: [4, 5, 6, 0], open: '10:00', close: '20:00' },
    ])
    expect(shop.hours).toBe('월~수 10:00~16:00\n목~일 10:00~20:00')
  })

  it('날짜가 없으면 모든 요일을 합친 범위 10:00~19:30, 30분 단위 20개다', () => {
    const slots = timeSlots()
    expect(slots).toHaveLength(20)
    expect(slots).toEqual(every30('10:00', '19:30'))
  })

  it('화요일은 10:00~15:30 12개 — 문 닫는 16:00 은 없다', () => {
    const slots = timeSlots('2026-11-03')
    expect(slots).toHaveLength(12)
    expect(slots).toEqual(every30('10:00', '15:30'))
    expect(slots).not.toContain('16:00')
  })

  it('월·수요일도 화요일과 같고, 목·금·토·일요일은 10:00~19:30 20개다', () => {
    // 2026-11-02 월, 11-04 수, 11-05 목, 11-06 금, 11-07 토, 11-01 일.
    for (const d of ['2026-11-02', '2026-11-04']) expect(timeSlots(d)).toEqual(every30('10:00', '15:30'))
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-01']) expect(timeSlots(d)).toEqual(every30('10:00', '19:30'))
    expect(timeSlots('2026-11-01')).not.toContain('20:00')
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
