import { isEmpty, isRequired, isVisible } from '../forms/rules'
import type { Answers, FormDef, Group, Question } from '../forms/types'

export interface FieldError {
  questionId: string
  message: string
}

// 화면(components/fields)의 글자 수 제한과 기타 값 모양이 이 값을 그대로 쓴다.
export const SHORT_MAX = 200
export const LONG_MAX = 3000
export const OTHER_PREFIX = '기타: '

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

/** 기타를 골랐는데 내용이 없다. 공백뿐인 것도 비었다고 본다. */
function emptyOther(q: Question, v: string): boolean {
  return !!q.other && v.startsWith(OTHER_PREFIX) && v.slice(OTHER_PREFIX.length).trim() === ''
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
      // 숫자·공백·하이픈·괄호, 맨 앞의 + 만 받는다(+82 10-1234-5678, (02) 123-4567). 숫자는 9자 이상.
      const ok = /^\+?[0-9\-() ]+$/.test(v) && v.replace(/\D/g, '').length >= 9
      return ok ? null : '연락처를 다시 확인해 주세요'
    }
    case 'single':
      if (typeof v !== 'string') return '고를 수 없는 값이에요'
      if (emptyOther(q, v)) return '기타 내용을 적어 주세요'
      if (!allowedChoice(q, v)) return '고를 수 없는 값이에요'
      return v.length > SHORT_MAX ? tooShort : null
    case 'multi':
      if (!Array.isArray(v)) return '고를 수 없는 값이에요'
      if (v.some((x) => emptyOther(q, x))) return '기타 내용을 적어 주세요'
      if (!v.every((x) => allowedChoice(q, x))) return '고를 수 없는 값이에요'
      // 화면은 같은 칩을 두 번 넣지 못하고 기타도 하나뿐이다. 같은 값을 거듭 넣거나 고를 수 있는 수보다 많은 답은
      // 손으로 만든 요청이라 거부한다(남기면 시트 한 칸이 끝없이 길어진다).
      if (new Set(v).size < v.length || v.length > (q.options?.length ?? 0) + (q.other ? 1 : 0)) return '고를 수 없는 값이에요'
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
    if (isEmpty(v)) {
      if (isRequired(q, a)) errors.push({ questionId: q.id, message: emptyMessage(q) })
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
