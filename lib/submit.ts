import { applyForm } from '../forms/apply'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef } from '../forms/types'
import { nowKst, todayKst } from './format'
import { isSubmissionId } from './id'
import { sheetRow, type Meta } from './sheet-row'
import { appendRow as defaultAppendRow, type SheetTab } from './sheets'
import { sendSlack as defaultSendSlack } from './slack'
import { applyMessages, cancelTrainingMessage, surveyMessages, type SlackMessage } from './slack-blocks'
import { validateForm, type FieldError } from './validate'

export type SubmitResult =
  | { status: 'ok' }
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'failed' }

export interface Deps {
  appendRow?: typeof defaultAppendRow
  sendSlack?: typeof defaultSendSlack
  /** 접수 시각 `YYYY-MM-DD HH:mm:ss` (KST). 기본은 지금. */
  now?: () => string
  /** 오늘 `YYYY-MM-DD` (KST). 기본은 오늘. */
  today?: () => string
}

/** 짧은 답 상한(validate.ts)과 같다. */
const NAME_MAX = 200

const invalid = (): SubmitResult => ({ status: 'invalid', errors: [] })

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isText = (v: unknown): v is string => typeof v === 'string'

/** 값이 전부 문자열이거나 문자열 배열인 객체. 그 밖의 값은 검증기가 다루지 못한다. */
function isAnswers(v: unknown): v is Answers {
  return isObject(v) && Object.values(v).every((x) => isText(x) || (Array.isArray(x) && x.every(isText)))
}

/**
 * 신청서·검사지 공통 순서: 허니팟 → 본문 모양·ID·답변 검증 → 시트 → 슬랙.
 * 로그에는 "무엇이 실패했나 + 신청 ID" 만 남긴다. 오류 객체·답변·요청 본문·주소는 찍지 않는다.
 */
async function submitForm(
  form: FormDef,
  tab: SheetTab,
  body: unknown,
  deps: Deps,
  messages: (answers: Answers, meta: Meta, applyId?: string) => SlackMessage[],
): Promise<SubmitResult> {
  if (!isObject(body)) return invalid()
  // 허니팟: 사람 눈에 안 보이는 칸이다. 값이 있으면 봇이니 성공한 척 조용히 끝낸다.
  if (body.website) return { status: 'ok' }
  const { submissionId, answers } = body
  if (!isSubmissionId(submissionId) || !isAnswers(answers)) return invalid()

  // 검사지만 신청 ID 를 이어서 받는다. 없는 것(undefined·null·'')은 괜찮고, 있으면 형식이 맞아야 한다.
  let applyId: string | undefined
  const rawApplyId = body.applyId
  if (form.id === 'survey' && rawApplyId != null && rawApplyId !== '') {
    if (!isSubmissionId(rawApplyId)) return invalid()
    applyId = rawApplyId
  }

  const errors = validateForm(form, answers, (deps.today ?? todayKst)())
  if (errors.length > 0) return { status: 'invalid', errors }

  const appendRow = deps.appendRow ?? defaultAppendRow
  const sendSlack = deps.sendSlack ?? defaultSendSlack
  const meta: Meta = { submissionId, receivedAt: (deps.now ?? nowKst)() }
  try {
    await appendRow(tab, sheetRow(form, answers, meta))
  } catch {
    console.error('시트 저장 실패', submissionId)
    return { status: 'failed' }
  }
  try {
    await sendSlack(messages(answers, meta, applyId))
  } catch {
    // 기록은 시트에 남았다. 사장님은 시트에서 보면 되니 보호자에게는 성공으로 답한다.
    console.error('슬랙 전송 실패', submissionId)
  }
  return { status: 'ok' }
}

export async function submitApply(body: unknown, deps: Deps = {}): Promise<SubmitResult> {
  return submitForm(applyForm, '예약신청', body, deps, (answers, meta) => applyMessages(answers, meta))
}

export async function submitSurvey(body: unknown, deps: Deps = {}): Promise<SubmitResult> {
  return submitForm(surveyForm, '검사지', body, deps, (answers, meta, applyId) =>
    surveyMessages(answers, { ...meta, applyId }),
  )
}

/** 이름 칸: 문자열이고 앞뒤 공백을 뗀 길이가 1~200자면 그 값, 아니면 null. */
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const name = v.trim()
  return name !== '' && name.length <= NAME_MAX ? name : null
}

/** "교육미용은 아니에요". 시트는 건드리지 않고 슬랙에 한 통만 보낸다. 기록이 시트에 없으니 슬랙 실패는 그대로 알린다. */
export async function cancelTraining(body: unknown, deps: Deps = {}): Promise<SubmitResult> {
  if (!isObject(body)) return invalid()
  const { submissionId } = body
  const petName = cleanName(body.petName)
  const guardianName = cleanName(body.guardianName)
  if (!isSubmissionId(submissionId) || petName === null || guardianName === null) return invalid()

  const sendSlack = deps.sendSlack ?? defaultSendSlack
  try {
    await sendSlack([cancelTrainingMessage({ petName, guardianName, submissionId })])
  } catch {
    console.error('슬랙 전송 실패', submissionId)
    return { status: 'failed' }
  }
  return { status: 'ok' }
}
