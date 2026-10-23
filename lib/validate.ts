import { isRequired, isVisible } from '../forms/rules'
import type { Answers, FormDef, Group, Question } from '../forms/types'

export interface FieldError {
  questionId: string
  message: string
}

const SHORT_MAX = 200
const LONG_MAX = 3000
const OTHER_PREFIX = '기타: '

function isEmpty(v: string | string[] | undefined): boolean {
  return v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === '')
}

function emptyMessage(q: Question): string {
  if (q.type === 'consent') return '동의해야 신청할 수 있어요'
  if (q.type === 'multi') return '하나 이상 골라 주세요'
  if (q.type === 'single') return '하나를 골라 주세요'
  if (q.type === 'date') return '날짜를 골라 주세요'
  return '꼭 적어 주세요'
}

function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function allowedChoice(q: Question, v: string): boolean {
  if (q.options?.includes(v)) return true
  return !!q.other && v.startsWith(OTHER_PREFIX) && v.length > OTHER_PREFIX.length
}

/** 값이 있을 때의 오류 한 건. 없으면 null. */
function checkValue(q: Question, v: string | string[], today: string): string | null {
  const tooShort = `${SHORT_MAX}자까지 적을 수 있어요`
  switch (q.type) {
    case 'long':
      return typeof v !== 'string' ? '고를 수 없는 값이에요' : v.length > LONG_MAX ? '3,000자까지 적을 수 있어요' : null
    case 'short':
      return typeof v !== 'string' ? '고를 수 없는 값이에요' : v.length > SHORT_MAX ? tooShort : null
    case 'email':
      if (typeof v !== 'string') return '이메일을 다시 확인해 주세요'
      if (v.length > SHORT_MAX) return tooShort
      return v.includes('@') ? null : '이메일을 다시 확인해 주세요'
    case 'phone': {
      if (typeof v !== 'string') return '연락처를 다시 확인해 주세요'
      if (v.length > SHORT_MAX) return tooShort
      const ok = /^[0-9\- ]+$/.test(v) && v.replace(/\D/g, '').length >= 9
      return ok ? null : '연락처를 다시 확인해 주세요'
    }
    case 'single':
      if (typeof v !== 'string' || !allowedChoice(q, v)) return '고를 수 없는 값이에요'
      return v.length > SHORT_MAX ? tooShort : null
    case 'multi':
      if (!Array.isArray(v) || !v.every((x) => allowedChoice(q, x))) return '고를 수 없는 값이에요'
      return v.some((x) => x.length > SHORT_MAX) ? tooShort : null
    case 'date':
      if (typeof v !== 'string' || !isRealDate(v)) return '날짜를 골라 주세요'
      return v < today ? '오늘 이후 날짜를 골라 주세요' : null
    case 'consent':
      return v === '동의' ? null : '동의해야 신청할 수 있어요'
  }
}

export function validateGroup(group: Group, a: Answers, today: string): FieldError[] {
  const errors: FieldError[] = []
  for (const q of group.questions) {
    if (!isVisible(q, a)) continue
    const v = a[q.id]
    const blocked = q.blockIf && (Array.isArray(v) ? v : [v]).includes(q.blockIf.value)
    if (blocked) {
      errors.push({ questionId: q.id, message: q.blockIf!.message })
      continue
    }
    // 특례: 2순위 날짜가 있으면 2순위 시간대도 필수.
    const required = isRequired(q, a) || (q.id === 'wish2_slot' && !isEmpty(a['wish2_date']))
    if (isEmpty(v)) {
      if (required) errors.push({ questionId: q.id, message: emptyMessage(q) })
      continue
    }
    const message = checkValue(q, v!, today)
    if (message) errors.push({ questionId: q.id, message })
  }
  return errors
}

export function validateForm(form: FormDef, a: Answers, today: string): FieldError[] {
  return form.groups.flatMap((g) => validateGroup(g, a, today))
}
