import { applyForm, TRAINING_SERVICE } from '../forms/apply'
import { isEmpty, visibleAnswers } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef } from '../forms/types'
import { nowKst, todayKst } from './format'
import { isAnswers, isObject } from './guards'
import { isSubmissionId } from './id'
import { sheetRow, type Meta } from './sheet-row'
import { appendRow as defaultAppendRow, surveySubmitted as defaultSurveySubmitted, type SheetTab } from './sheets'
import { sendSlack as defaultSendSlack } from './slack'
import { applyMessages, surveyMessages, type SlackMessage } from './slack-blocks'
import { applyIdOf, surveyUrl } from './survey-link'
import { validateForm, type FieldError } from './validate'

export type SubmitResult =
  | { status: 'ok' }
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'failed' }

export interface Deps {
  appendRow?: typeof defaultAppendRow
  sendSlack?: typeof defaultSendSlack
  /** 이 신청 ID 의 검사지가 이미 시트에 있나. 기본은 시트를 읽는다. */
  surveySubmitted?: typeof defaultSurveySubmitted
  /** 검사지 링크 비밀값. 기본은 환경 변수(테스트만 넘긴다). */
  secret?: string
  /** 접수 시각 `YYYY-MM-DD HH:mm:ss` (KST). 기본은 지금. */
  now?: () => string
  /** 오늘 `YYYY-MM-DD` (KST). 기본은 오늘. */
  today?: () => string
}

const invalid = (): SubmitResult => ({ status: 'invalid', errors: [] })

/** 비었다고 보는 답(공백뿐인 글·빈 배열)을 뺀 새 답 맵. */
function withoutEmpty(a: Answers): Answers {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => !isEmpty(v)))
}

/**
 * 신청서·검사지 공통 순서: 허니팟 → 본문 모양·ID → 숨은 문항의 답·빈 답 버리기 → 답변 검증 → 시트 → 슬랙.
 * ID 는 양식마다 꺼내는 곳이 다르다(신청서: 본문의 신청 ID, 검사지: 링크의 신청 ID). `submitted` 가 있으면 시트에 쓰기 전에
 * 이미 낸 것인지 보고, 냈으면 쓰지도 보내지도 않고 성공으로 답한다(대개 응답을 못 받은 재시도다). 읽기 실패는 시트 실패다.
 * 로그에는 "무엇이 실패했나 + 신청 ID" 만 남긴다. 오류 객체·답변·요청 본문·주소는 찍지 않는다.
 */
async function submitForm(
  form: FormDef,
  tab: SheetTab,
  body: unknown,
  deps: Deps,
  idOf: (body: Record<string, unknown>) => string | null,
  messages: (answers: Answers, meta: Meta) => SlackMessage[],
  submitted?: (id: string) => Promise<boolean>,
): Promise<SubmitResult> {
  if (!isObject(body)) return invalid()
  // 허니팟: 사람 눈에 안 보이는 칸이다. 값이 있으면 봇이니 성공한 척 조용히 끝낸다.
  if (body.website) return { status: 'ok' }
  const submissionId = idOf(body)
  const given = body.answers
  if (submissionId === null || !isAnswers(given)) return invalid()
  // 숨은 문항의 답은 거부하지 않고 조용히 버린다: 화면이 옛 답을 지우지 않았을 뿐인 보호자를 막지 않으려는 것이다.
  // 검증은 숨은 문항을 건너뛰고 행·메시지는 숨김을 따지지 않으므로, 여기서 걸러야 길이·선택지 검증을 못 피한다.
  // 빈 답(공백뿐인 글·빈 배열)도 같은 까닭으로 버린다: 검증은 '답 없음' 으로 보고 건너뛰는데 행·메시지에는 그대로 실려
  // 공백이 시트 칸에 들어가고, 날짜 칸은 슬랙에서 날짜로 읽혀 깨진다. 버리면 시트는 '', 슬랙은 '—' 다.
  const answers = withoutEmpty(visibleAnswers(form, given))

  const errors = validateForm(form, answers, (deps.today ?? todayKst)())
  if (errors.length > 0) return { status: 'invalid', errors }

  const appendRow = deps.appendRow ?? defaultAppendRow
  const sendSlack = deps.sendSlack ?? defaultSendSlack
  const meta: Meta = { submissionId, receivedAt: (deps.now ?? nowKst)() }
  try {
    if (submitted && (await submitted(submissionId))) return { status: 'ok' }
    await appendRow(tab, sheetRow(form, answers, meta))
  } catch {
    console.error('시트 저장 실패', submissionId)
    return { status: 'failed' }
  }
  try {
    await sendSlack(messages(answers, meta))
  } catch {
    // 기록은 시트에 남았다. 사장님은 시트에서 보면 되니 보호자에게는 성공으로 답한다.
    console.error('슬랙 전송 실패', submissionId)
  }
  return { status: 'ok' }
}

export async function submitApply(body: unknown, deps: Deps = {}): Promise<SubmitResult> {
  return submitForm(
    applyForm,
    '예약신청',
    body,
    deps,
    (b) => (isSubmissionId(b.submissionId) ? b.submissionId : null),
    // 교육미용이 든 신청이면 사장님이 입금 확인 뒤 보낼 검사지 링크를 슬랙에 싣는다.
    (answers, meta) => {
      const training = Array.isArray(answers.services) && answers.services.includes(TRAINING_SERVICE)
      return applyMessages(answers, meta, training ? surveyUrl(meta.submissionId, deps.secret) : undefined)
    },
  )
}

/** 검사지. 본문은 `{ token, answers, website }` 이고, 신청 ID 는 링크(token)에서만 꺼낸다. 본문의 다른 ID 는 보지 않는다. */
export async function submitSurvey(body: unknown, deps: Deps = {}): Promise<SubmitResult> {
  const surveySubmitted = deps.surveySubmitted ?? defaultSurveySubmitted
  return submitForm(
    surveyForm,
    '검사지',
    body,
    deps,
    (b) => applyIdOf(b.token, deps.secret),
    (answers, meta) => surveyMessages(answers, meta),
    (id) => surveySubmitted(id),
  )
}
