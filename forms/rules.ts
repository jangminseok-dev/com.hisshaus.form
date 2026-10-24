import type { Answers, FormDef, Group, Question, ShowIf } from './types'

function asArray(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

/** showIf 조건 하나가 맞나. 답이 equals 와 같거나(배열이면 그중 하나와 같거나) 참. */
function matches(c: ShowIf, a: Answers): boolean {
  const v = a[c.questionId]
  return typeof v === 'string' && (Array.isArray(c.equals) ? c.equals.includes(v) : v === c.equals)
}

/** 보이는 문항인가. showIf(여럿이면 하나라도)가 안 맞거나 optionalIfOnly 가 맞으면 숨는다. */
export function isVisible(q: Question, a: Answers): boolean {
  if (q.showIf) {
    const conds = Array.isArray(q.showIf) ? q.showIf : [q.showIf]
    if (!conds.some((c) => matches(c, a))) return false
  }
  if (q.optionalIfOnly) {
    const picked = asArray(a[q.optionalIfOnly.questionId])
    if (picked.length > 0 && picked.every((v) => v === q.optionalIfOnly!.value)) return false
  }
  return true
}

/** 답이 없다. 없거나, 공백뿐인 글이거나, 빈 배열이다. 검증과 requiredIf 가 같은 판단을 쓴다. */
export function isEmpty(v: string | string[] | undefined): boolean {
  return v === undefined || (Array.isArray(v) ? v.length === 0 : v.trim() === '')
}

/** 필수인가. 보이지 않으면 필수가 아니다. requiredIf 의 문항에 답이 있으면 required 가 거짓이어도 필수다. */
export function isRequired(q: Question, a: Answers): boolean {
  if (!isVisible(q, a)) return false
  return q.required || (q.requiredIf !== undefined && !isEmpty(a[q.requiredIf.questionId]))
}

/** 보이는 문항 중 blockIf 값을 고른 첫 문항. 없으면 null. */
export function blockedBy(group: Group, a: Answers): { questionId: string; message: string } | null {
  for (const q of group.questions) {
    if (!q.blockIf || !isVisible(q, a)) continue
    if (asArray(a[q.id]).includes(q.blockIf.value)) return { questionId: q.id, message: q.blockIf.message }
  }
  return null
}

/** 보이는 묶음인가. showIf 의 문항에서 그 값을 골랐을 때만 보인다. */
export function isGroupVisible(g: Group, a: Answers): boolean {
  return !g.showIf || asArray(a[g.showIf.questionId]).includes(g.showIf.includes)
}

/** 지금 답으로 보이는 묶음만, 정의 순서대로. 화면 진행·검증·슬랙이 같은 목록을 쓴다. */
export function visibleGroups(form: FormDef, a: Answers): Group[] {
  return form.groups.filter((g) => isGroupVisible(g, a))
}

export function allQuestions(form: FormDef): Question[] {
  return form.groups.flatMap((g) => g.questions)
}

/** 보이는 묶음의 보이는 문항의 답만 남긴 새 답 맵. 숨은 묶음·숨은 문항의 답과 양식에 없는 키는 버린다. */
export function visibleAnswers(form: FormDef, a: Answers): Answers {
  const shown: Answers = {}
  // 부모는 자식보다 앞에 정의된다(서비스 문항은 서비스별 묶음보다 앞). 받은 답이 아니라 지금까지 걸러 만든 결과로
  // 보이는지 따져야 숨은 부모의 옛 답 때문에 자식이 보이는 것으로 잘못 가려지지 않는다.
  for (const g of form.groups) {
    if (!isGroupVisible(g, shown)) continue
    for (const q of g.questions) {
      if (isVisible(q, shown) && a[q.id] !== undefined) shown[q.id] = a[q.id]
    }
  }
  return shown
}
