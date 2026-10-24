import { DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import type { Answers } from '../forms/types'
import { dateKo } from './format'

const text = (a: Answers, id: string): string => {
  const v = a[id]
  return typeof v === 'string' ? v.trim() : ''
}

/** 서비스별 희망 일시 한 줄. 날짜 문항은 한국어 날짜로, 시간대는 적은 그대로 뒤에 붙인다. */
const when = (date: string, time: string): string => [date && dateKo(date), time].filter(Boolean).join(' ')

/**
 * 고른 서비스의 희망 일시를 한 줄로. 완료 화면 요약과 슬랙 알림 미리보기가 쓴다.
 * 고른 서비스가 하나면 일시만("11월 1일 (일) 오후 2시"), 둘 이상이면 서비스 이름을 앞에 붙여 쉼표로 잇는다.
 * 숨은 묶음의 답이 섞이지 않게, 보낼 답(visibleAnswers)을 넘긴다.
 */
export function wishText(a: Answers): string {
  const services = Array.isArray(a.services) ? a.services : []
  const parts: [string, string][] = []
  if (services.includes(GROOMING_SERVICE)) parts.push(['미용', when(text(a, 'groom_date'), text(a, 'groom_time'))])
  if (services.includes(DAYCARE_SERVICE)) parts.push(['데이케어', when(text(a, 'daycare_date'), text(a, 'daycare_time'))])
  if (services.includes(HOTEL_SERVICE)) parts.push(['호텔', text(a, 'hotel_checkin') && `${text(a, 'hotel_checkin')} 체크인`])
  if (services.includes(TRAINING_SERVICE)) parts.push(['교육미용', when(text(a, 'training_date'), text(a, 'training_time'))])
  const filled = parts.filter(([, w]) => w !== '')
  if (parts.length === 1) return filled[0]?.[1] ?? ''
  return filled.map(([name, w]) => `${name} ${w}`).join(', ')
}
