import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { applyForm } from '../forms/apply'
import { allQuestions } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import { sheetRow } from '../lib/sheet-row'
import type { SheetTab } from '../lib/sheets'
import { applyMessages, cancelTrainingMessage, surveyMessages, type SlackMessage } from '../lib/slack-blocks'
import { cancelTraining, submitApply, submitSurvey, type Deps } from '../lib/submit'
import { validateForm } from '../lib/validate'
import { validAnswers } from './fixtures'

const ID = 'abcDEF1234'
const APPLY_ID = 'ZZzz112233'
const NOW = '2026-10-23 10:00:00'
const TODAY = '2026-10-23'
const meta = { submissionId: ID, receivedAt: NOW }
const INVALID = { status: 'invalid', errors: [] }
const SECRET = 'https://hooks.slack.test/services/T000/B000/SECRETTOKEN'

let errorSpy: MockInstance<typeof console.error>
// 로그 인자를 단언하고, 테스트 출력에는 잡음이 남지 않게 막는다.
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** 가짜 시트·슬랙. events 에 시작·끝 순서가 쌓인다. 시트는 한 틱 늦게 끝나서 병렬 호출이면 순서가 드러난다. */
function fakes() {
  const events: string[] = []
  const appendRow = vi.fn(async (_tab: SheetTab, _row: string[]) => {
    events.push('시트 시작')
    await Promise.resolve()
    events.push('시트 끝')
  })
  const sendSlack = vi.fn(async (_messages: SlackMessage[]) => {
    events.push('슬랙')
  })
  const deps: Deps = { appendRow, sendSlack, now: () => NOW, today: () => TODAY }
  return { events, appendRow, sendSlack, deps }
}

describe('테스트 픽스처', () => {
  it('validAnswers 는 두 양식의 검증을 통과한다', () => {
    for (const form of [applyForm, surveyForm]) expect(validateForm(form, validAnswers(form), TODAY)).toEqual([])
  })
})

describe('신청서 제출', () => {
  it('성공하면 시트 한 줄 뒤 슬랙 메시지가 간다', async () => {
    const { events, appendRow, sendSlack, deps } = fakes()
    const answers = validAnswers(applyForm)
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })
    expect(events).toEqual(['시트 시작', '시트 끝', '슬랙'])
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(appendRow).toHaveBeenCalledWith('예약신청', sheetRow(applyForm, answers, meta))
    expect(appendRow.mock.calls[0][1].slice(0, 2)).toEqual([NOW, ID])
    expect(sendSlack).toHaveBeenCalledTimes(1)
    expect(sendSlack).toHaveBeenCalledWith(applyMessages(answers, meta))
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('허니팟에 값이 있으면 아무것도 보내지 않고 ok', async () => {
    const full = { submissionId: ID, answers: validAnswers(applyForm), website: 'http://spam.test' }
    for (const body of [full, { website: 'x' }]) {
      for (const submit of [submitApply, submitSurvey]) {
        const { appendRow, sendSlack, deps } = fakes()
        expect(await submit(body, deps)).toEqual({ status: 'ok' })
        expect(appendRow).not.toHaveBeenCalled()
        expect(sendSlack).not.toHaveBeenCalled()
      }
    }
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['공백 문자열', ' '],
    ['true', true],
    ['숫자 1', 1],
    ['객체', { url: 'http://spam.test' }],
  ])('허니팟에 다른 참 값(%s)이 있어도 아무것도 보내지 않고 ok', async (_label, website) => {
    const { appendRow, sendSlack, deps } = fakes()
    const body = { submissionId: ID, answers: validAnswers(applyForm), website }
    expect(await submitApply(body, deps)).toEqual({ status: 'ok' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it.each([
    ['빈 문자열', ''],
    ['null', null],
  ])('허니팟이 비어 있으면(%s) 정상 신청으로 본다', async (_label, website) => {
    const { appendRow, sendSlack, deps } = fakes()
    const body = { submissionId: ID, answers: validAnswers(applyForm), website }
    expect(await submitApply(body, deps)).toEqual({ status: 'ok' })
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(sendSlack).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['없음', undefined],
    ['null', null],
    ['빈 문자열', ''],
    ['9자', 'abcDEF123'],
    ['11자', 'abcDEF12345'],
    ['특수문자', 'abcDEF123!'],
    ['공백', 'abcDEF 123'],
    ['숫자', 1234567890],
  ])('ID 형식이 틀리면 invalid (%s)', async (_label, bad) => {
    for (const [submit, form] of [[submitApply, applyForm], [submitSurvey, surveyForm]] as const) {
      const { appendRow, sendSlack, deps } = fakes()
      expect(await submit({ submissionId: bad, answers: validAnswers(form) }, deps)).toEqual(INVALID)
      expect(appendRow).not.toHaveBeenCalled()
      expect(sendSlack).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['문자열', 'x'],
    ['숫자', 1],
    ['배열', []],
  ])('본문이 객체가 아니면(%s) 세 함수 모두 invalid 이다', async (_label, body) => {
    const { appendRow, sendSlack, deps } = fakes()
    for (const run of [submitApply, submitSurvey, cancelTraining]) expect(await run(body, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it.each([
    ['없음', undefined],
    ['null', null],
    ['문자열', 'x'],
    ['숫자', 1],
    ['배열', []],
  ])('answers 가 객체가 아니면(%s) invalid 이다', async (_label, answers) => {
    const { appendRow, sendSlack, deps } = fakes()
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual(INVALID)
    expect(await submitSurvey({ submissionId: ID, answers }, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it.each([
    ['숫자', { guardian_name: 5 }],
    ['null', { guardian_name: null }],
    ['객체', { guardian_name: { a: 1 } }],
    ['문자열이 아닌 배열 원소', { services: [1] }],
    ['중첩 배열', { services: [['Hotel 호텔']] }],
  ])('답변 값이 문자열이나 문자열 배열이 아니면(%s) 검증에서 터지지 않고 invalid 이다', async (_label, bad) => {
    const { appendRow, sendSlack, deps } = fakes()
    const answers = { ...validAnswers(applyForm), ...bad }
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('필수가 비면 invalid 와 오류 목록', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    const result = await submitApply({ submissionId: ID, answers: {} }, deps)
    expect(result.status).toBe('invalid')
    const errors = result.status === 'invalid' ? result.errors : []
    expect(errors.find((e) => e.questionId === 'guardian_name')?.message).toBe('꼭 적어 주세요')
    expect(errors.find((e) => e.questionId === 'privacy_consent')?.message).toBe('동의해야 신청할 수 있어요')
    expect(errors).toEqual(validateForm(applyForm, {}, TODAY))
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('오늘 날짜는 today() 로 정한다', async () => {
    const { appendRow, deps } = fakes()
    const body = { submissionId: ID, answers: validAnswers(applyForm) }
    // 고른 날짜(2099-01-01)가 주입한 오늘보다 앞이면 거부한다.
    const late = await submitApply(body, { ...deps, today: () => '2099-06-01' })
    expect(late.status === 'invalid' && late.errors.map((e) => e.questionId)).toEqual(['wish1_date'])
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('today 와 now 를 주지 않으면 한국 시각의 오늘과 지금을 쓴다', async () => {
    const { appendRow, sendSlack } = fakes()
    const base = validAnswers(applyForm)
    const past = await submitApply({ submissionId: ID, answers: { ...base, wish1_date: '2000-01-01' } }, { appendRow, sendSlack })
    expect(past.status === 'invalid' && past.errors.map((e) => e.questionId)).toEqual(['wish1_date'])
    expect(appendRow).not.toHaveBeenCalled()

    expect(await submitApply({ submissionId: ID, answers: base }, { appendRow, sendSlack })).toEqual({ status: 'ok' })
    expect(appendRow.mock.calls[0][1][0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('시트 실패면 failed 이고 슬랙을 부르지 않는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    appendRow.mockRejectedValue(new Error('sheets'))
    expect(await submitApply({ submissionId: ID, answers: validAnswers(applyForm) }, deps)).toEqual({ status: 'failed' })
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('시트 실패면 로그에 ID 만 남는다', async () => {
    const { appendRow, deps } = fakes()
    appendRow.mockRejectedValue(new Error(`${SECRET} 비밀보호자`))
    const answers = { ...validAnswers(applyForm), guardian_name: '비밀보호자' }
    await submitApply({ submissionId: ID, answers }, deps)
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/비밀보호자|SECRETTOKEN|hooks\.slack/)
  })

  it('슬랙 실패여도 ok 이고 로그에 ID 만 남는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    sendSlack.mockRejectedValue(new Error(`${SECRET} 비밀보호자`))
    const answers = { ...validAnswers(applyForm), guardian_name: '비밀보호자' }
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls).toEqual([['슬랙 전송 실패', ID]])
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/비밀보호자|SECRETTOKEN|hooks\.slack/)
  })
})

describe('검사지 제출', () => {
  it('검사지는 검사지 탭에 쓴다', async () => {
    const { events, appendRow, sendSlack, deps } = fakes()
    const answers = validAnswers(surveyForm)
    expect(await submitSurvey({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })
    expect(events).toEqual(['시트 시작', '시트 끝', '슬랙'])
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(appendRow).toHaveBeenCalledWith('검사지', sheetRow(surveyForm, answers, meta))
    expect(appendRow.mock.calls[0][1]).toHaveLength(100)
    expect(sendSlack).toHaveBeenCalledWith(surveyMessages(answers, meta))
  })

  it('검사지가 여러 통이어도 sendSlack 은 한 번에 통째로 받는다', async () => {
    const { sendSlack, deps } = fakes()
    // 긴 답 문항을 3,000자로 채워 여러 통으로 나뉘게 한다. 통 사이 간격은 sendSlack 이 맡는다.
    const long = allQuestions(surveyForm).filter((q) => q.type === 'long')
    const answers = { ...validAnswers(surveyForm), ...Object.fromEntries(long.map((q) => [q.id, '가'.repeat(3000)])) }
    expect(await submitSurvey({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })
    expect(sendSlack).toHaveBeenCalledTimes(1)
    const sent = sendSlack.mock.calls[0][0]
    expect(sent.length).toBeGreaterThan(1)
    expect(sent).toEqual(surveyMessages(answers, meta))
  })

  it('검사지에 applyId 가 있으면 슬랙 메시지에 그 ID 가 실린다', async () => {
    const { sendSlack, deps } = fakes()
    const answers = validAnswers(surveyForm)
    expect(await submitSurvey({ submissionId: ID, answers, applyId: APPLY_ID }, deps)).toEqual({ status: 'ok' })
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain(`예약 신청 ${APPLY_ID}의 검사지예요`)
    expect(sendSlack).toHaveBeenCalledWith(surveyMessages(answers, { ...meta, applyId: APPLY_ID }))
  })

  it.each([
    ['없음', undefined],
    ['null', null],
    ['빈 문자열', ''],
  ])('applyId 가 비어 있으면(%s) 없는 것으로 본다', async (_label, applyId) => {
    const { sendSlack, deps } = fakes()
    const body = { submissionId: ID, answers: validAnswers(surveyForm), applyId }
    expect(await submitSurvey(body, deps)).toEqual({ status: 'ok' })
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).not.toContain('검사지예요')
  })

  it.each([
    ['9자', 'abcDEF123'],
    ['11자', 'abcDEF12345'],
    ['특수문자', 'abcDEF123!'],
    ['숫자', 1234567890],
    ['객체', {}],
    ['배열', []],
  ])('applyId 가 있는데 형식이 틀리면(%s) invalid 이고 아무것도 부르지 않는다', async (_label, applyId) => {
    const { appendRow, sendSlack, deps } = fakes()
    const body = { submissionId: ID, answers: validAnswers(surveyForm), applyId }
    expect(await submitSurvey(body, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('검사지에서 필수가 비면 invalid 와 오류 목록이다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    const result = await submitSurvey({ submissionId: ID, answers: {} }, deps)
    expect(result).toEqual({ status: 'invalid', errors: validateForm(surveyForm, {}, TODAY) })
    expect(result.status === 'invalid' && result.errors.length).toBeGreaterThan(0)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('q2 에서 동의하지 않음을 고르면 invalid 이다', async () => {
    const { appendRow, deps } = fakes()
    const answers = { ...validAnswers(surveyForm), q2: '동의하지 않음 (서비스 이용 불가)' }
    const result = await submitSurvey({ submissionId: ID, answers }, deps)
    expect(result.status === 'invalid' && result.errors.map((e) => e.questionId)).toEqual(['q2'])
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('시트 실패면 failed 이고 슬랙을 부르지 않으며 로그에 ID 만 남는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    appendRow.mockRejectedValue(new Error(SECRET))
    expect(await submitSurvey({ submissionId: ID, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'failed' })
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
  })

  it('슬랙 실패여도 ok 이고 로그에 ID 만 남는다', async () => {
    const { sendSlack, deps } = fakes()
    sendSlack.mockRejectedValue(new Error(SECRET))
    expect(await submitSurvey({ submissionId: ID, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'ok' })
    expect(errorSpy.mock.calls).toEqual([['슬랙 전송 실패', ID]])
  })
})

describe('교육미용 취소', () => {
  const body = { submissionId: ID, petName: '초코', guardianName: '홍길동' }

  it('취소는 시트를 건드리지 않고 슬랙 한 통만 보낸다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    expect(await cancelTraining(body, deps)).toEqual({ status: 'ok' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).toHaveBeenCalledTimes(1)
    expect(sendSlack).toHaveBeenCalledWith([
      cancelTrainingMessage({ petName: '초코', guardianName: '홍길동', submissionId: ID }),
    ])
    expect(sendSlack.mock.calls[0][0]).toHaveLength(1)
  })

  it('이름은 앞뒤 공백을 떼고 보낸다', async () => {
    const { sendSlack, deps } = fakes()
    await cancelTraining({ ...body, petName: '  초코 ', guardianName: ' 홍길동\n' }, deps)
    expect(sendSlack).toHaveBeenCalledWith([cancelTrainingMessage({ petName: '초코', guardianName: '홍길동', submissionId: ID })])
  })

  it('이름이 200자면 통과한다', async () => {
    const { sendSlack, deps } = fakes()
    expect(await cancelTraining({ ...body, petName: '가'.repeat(200) }, deps)).toEqual({ status: 'ok' })
    expect(sendSlack).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['ID 가 틀림', { ...body, submissionId: 'abc' }],
    ['ID 가 없음', { petName: '초코', guardianName: '홍길동' }],
    ['반려견 이름이 없음', { submissionId: ID, guardianName: '홍길동' }],
    ['반려견 이름이 공백뿐', { ...body, petName: '   ' }],
    ['보호자 이름이 빈 문자열', { ...body, guardianName: '' }],
    ['이름이 문자열이 아님', { ...body, petName: 5 }],
    ['보호자 이름이 배열', { ...body, guardianName: ['홍길동'] }],
    ['반려견 이름이 201자', { ...body, petName: '가'.repeat(201) }],
    ['보호자 이름이 201자', { ...body, guardianName: '가'.repeat(201) }],
  ])('입력이 틀리면(%s) invalid 이고 아무것도 부르지 않는다', async (_label, bad) => {
    const { appendRow, sendSlack, deps } = fakes()
    expect(await cancelTraining(bad, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('슬랙 실패면 failed 이고 로그에 ID 만 남는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    sendSlack.mockRejectedValue(new Error(`${SECRET} 초코`))
    expect(await cancelTraining(body, deps)).toEqual({ status: 'failed' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['슬랙 전송 실패', ID]])
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(/초코|홍길동|SECRETTOKEN/)
  })
})
