import { isGroupVisible, isRequired } from '../forms/rules'
import type { Answer, Answers, FormDef, Question } from '../forms/types'

function validValue(q: Question): Answer {
  switch (q.type) {
    case 'short':
    case 'long':
      return '가'
    case 'email':
      return 'a@b.co'
    case 'phone':
      return '01012345678'
    case 'single':
      return q.options![0]
    case 'multi':
      return [q.options![0]]
    case 'date':
      return '2099-01-01'
    case 'time':
      return '10:00'
    case 'consent':
      return '동의'
  }
}

/**
 * 보이는 묶음의 보이는 필수 문항만 유형별 유효값으로 채운 답. validateForm 을 오류 없이 통과하고 visibleAnswers 로 걸러도 그대로다.
 * 신청서는 복수 선택의 첫 선택지(미용)를 고르므로 서비스별 묶음 중 미용만 채워진다.
 */
export function validAnswers(form: FormDef): Answers {
  const answers: Answers = {}
  // 앞 문항의 답에 따라 뒤 묶음·뒤 문항이 보이는지가 달라지므로, 순서대로 채우며 본다.
  for (const g of form.groups) {
    if (!isGroupVisible(g, answers)) continue
    for (const q of g.questions) {
      if (isRequired(q, answers)) answers[q.id] = validValue(q)
    }
  }
  return answers
}
