import type { Answers, Question } from '../forms/types'
import { timeKo } from './slots'

const WEEKDAYS = '일월화수목금토'

/** 한국 시각의 날짜·시각 조각을 만든다. */
function kstParts(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** `YYYY-MM-DD HH:mm:ss` (Asia/Seoul) */
export function nowKst(d: Date = new Date()): string {
  return kstParts(d)
}

/** `YYYY-MM-DD` (Asia/Seoul) */
export function todayKst(d: Date = new Date()): string {
  return kstParts(d).slice(0, 10)
}

/** '2026-10-28' → '10월 28일 (수)' */
export function dateKo(ymd: string): string {
  const [y, m, day] = ymd.split('-').map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]
  return `${m}월 ${day}일 (${wd})`
}

/**
 * 숫자만 남겨 가운데를 가린다. 11자리 010-****-1234, 10자리 010-***-1234.
 * 국가 번호 꼴(+82 10-1234-5678)은 국내 꼴(01012345678)로 바꿔 같은 규칙으로 가린다. 국내 번호는 0 으로 시작하므로
 * 숫자가 82 로 시작하고 그다음이 0 이 아닐 때만 국가 번호로 본다.
 */
export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  const d = /^82[1-9]/.test(digits) ? `0${digits.slice(2)}` : digits
  if (d.length < 10) return p
  const tail = d.slice(-4)
  const head = d.slice(0, 3)
  const mid = '*'.repeat(d.length - 7)
  return `${head}-${mid}-${tail}`
}

/** 답을 한 줄 글로. 없으면 ''. date·time 은 기본 한국어 표기, `dateStyle: 'raw'` 면 원문('YYYY-MM-DD'·'HH:MM'). */
export function answerText(q: Question, a: Answers, opts: { dateStyle?: 'ko' | 'raw' } = {}): string {
  const v = a[q.id]
  if (v === undefined) return ''
  if (Array.isArray(v)) return v.join(', ')
  if (q.type === 'date' && v && opts.dateStyle !== 'raw') return dateKo(v)
  if (q.type === 'time' && v && opts.dateStyle !== 'raw') return timeKo(v)
  return v
}
