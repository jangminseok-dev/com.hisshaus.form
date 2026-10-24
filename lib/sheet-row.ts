import { allQuestions } from '../forms/rules'
import type { Answers, FormDef } from '../forms/types'
import { answerText } from './format'

export interface Meta {
  submissionId: string
  receivedAt: string
}

/** 시트 첫 줄: 접수 시각, 신청 ID, 그다음 정의 순서대로 문항 라벨. */
export function sheetHeader(form: FormDef): string[] {
  return ['접수 시각', '신청 ID', ...allQuestions(form).map((q) => q.label)]
}

/**
 * 헤더와 같은 길이의 한 행. 답이 없는 칸은 ''. 날짜는 정렬되게 원문으로.
 * 숨은 문항의 답은 여기서 거르지 않는다: 부르는 쪽(submit)이 visibleAnswers 로 먼저 거른다.
 */
export function sheetRow(form: FormDef, a: Answers, meta: Meta): string[] {
  return [meta.receivedAt, meta.submissionId, ...allQuestions(form).map((q) => answerText(q, a, { dateStyle: 'raw' }))]
}
