import { shop } from '../content/shop'

/** 'HH:MM' → 분. */
const minutes = (hm: string) => {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** 'YYYY-MM-DD' 의 요일(0 = 일). 시간대에 안 끌리게 UTC 로 센다. */
const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay()

/**
 * 고를 수 있는 시간(30분 단위, 'HH:MM'). 날짜를 주면 그 요일의 영업시간 안에서, 안 주면 모든 요일을 합친 범위에서.
 * 마지막 칸은 문 닫는 시각 30분 전이다(닫을 때 시작하는 예약은 없다).
 */
export function timeSlots(date?: string): string[] {
  const spans = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? shop.openHours.filter((h) => (h.days as readonly number[]).includes(weekdayOf(date)))
    : shop.openHours
  const out = new Set<number>()
  for (const { open, close } of spans) {
    for (let t = minutes(open); t < minutes(close); t += 30) out.add(t)
  }
  return [...out].sort((a, b) => a - b).map(hm)
}

/** '13:30' → '오후 1:30', '10:00' → '오전 10:00', '12:00' → '오후 12:00'. 시간 꼴이 아니면 그대로. */
export function timeKo(v: string): string {
  if (!/^\d{2}:\d{2}$/.test(v)) return v
  const [h, m] = v.split(':').map(Number)
  const half = h < 12 ? '오전' : '오후'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${half} ${hour}:${String(m).padStart(2, '0')}`
}
