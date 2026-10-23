import type { Answers, FormDef, Group, Question } from './types'

function asArray(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

/** 보이는 문항인가. showIf 가 안 맞거나 optionalIfOnly 가 맞으면 숨는다. */
export function isVisible(q: Question, a: Answers): boolean {
  if (q.showIf && a[q.showIf.questionId] !== q.showIf.equals) return false
  if (q.optionalIfOnly) {
    const picked = asArray(a[q.optionalIfOnly.questionId])
    if (picked.length > 0 && picked.every((v) => v === q.optionalIfOnly!.value)) return false
  }
  return true
}

/** 필수인가. 보이지 않으면 필수가 아니다. */
export function isRequired(q: Question, a: Answers): boolean {
  return isVisible(q, a) && q.required
}

/** 보이는 문항 중 blockIf 값을 고른 첫 문항. 없으면 null. */
export function blockedBy(group: Group, a: Answers): { questionId: string; message: string } | null {
  for (const q of group.questions) {
    if (!q.blockIf || !isVisible(q, a)) continue
    if (asArray(a[q.id]).includes(q.blockIf.value)) return { questionId: q.id, message: q.blockIf.message }
  }
  return null
}

export function allQuestions(form: FormDef): Question[] {
  return form.groups.flatMap((g) => g.questions)
}
