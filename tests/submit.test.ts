import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { applyForm, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { allQuestions, isVisible, visibleAnswers } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import { sheetRow } from '../lib/sheet-row'
import type { SheetTab } from '../lib/sheets'
import { applyMessages, surveyMessages, type SlackMessage } from '../lib/slack-blocks'
import { submitApply, submitSurvey, type Deps } from '../lib/submit'
import { surveyToken, surveyUrl } from '../lib/survey-link'
import { validateForm } from '../lib/validate'
import { validAnswers } from './fixtures'

const ID = 'abcDEF1234'
const LINK_SECRET = 'test-survey-link-secret-0123456789abcdef'
/** ID 로 낸 신청의 검사지 링크. 검사지 행의 신청 ID 는 이 링크의 것(= ID)이다. */
const TOKEN = surveyToken(ID, LINK_SECRET)
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
  const surveySubmitted = vi.fn(async (_applyId: string) => {
    events.push('시트 읽기')
    return false
  })
  const deps: Deps = { appendRow, sendSlack, surveySubmitted, secret: LINK_SECRET, now: () => NOW, today: () => TODAY }
  return { events, appendRow, sendSlack, surveySubmitted, deps }
}

describe('테스트 픽스처', () => {
  it('validAnswers 는 두 양식의 검증을 통과하고 숨은 묶음·숨은 문항의 답을 담지 않는다', () => {
    for (const form of [applyForm, surveyForm]) {
      const a = validAnswers(form)
      expect(validateForm(form, a, TODAY)).toEqual([])
      expect(visibleAnswers(form, a)).toEqual(a)
    }
    // 신청서는 미용만 고르므로 다른 서비스 묶음의 답은 없다.
    const apply = validAnswers(applyForm)
    expect(apply.services).toEqual([GROOMING_SERVICE])
    expect(apply).toHaveProperty('groom_date')
    for (const id of ['daycare_date', 'hotel_checkin_date', 'hotel_checkin_time', 'hotel_checkout_date', 'hotel_checkout_time', 'training_date']) {
      expect(apply).not.toHaveProperty(id)
    }
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

  it('교육미용이 든 신청이면 슬랙에 그 신청의 검사지 링크를 싣는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    const answers = { ...validAnswers(applyForm), services: [GROOMING_SERVICE, TRAINING_SERVICE], training_date: '2099-01-02' }
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })
    expect(sendSlack).toHaveBeenCalledWith(applyMessages(answers, meta, surveyUrl(ID, LINK_SECRET)))
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain(surveyUrl(ID, LINK_SECRET))
    // 시트에는 링크를 적지 않는다(열이 그대로다).
    expect(appendRow).toHaveBeenCalledWith('예약신청', sheetRow(applyForm, answers, meta))
  })

  it('교육미용이 없는 신청이면 링크를 싣지 않는다', async () => {
    const { sendSlack, deps } = fakes()
    await submitApply({ submissionId: ID, answers: validAnswers(applyForm) }, deps)
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).not.toContain('검사지 링크')
  })

  it('허니팟에 값이 있으면 아무것도 보내지 않고 ok', async () => {
    const full = { submissionId: ID, token: TOKEN, answers: validAnswers(applyForm), website: 'http://spam.test' }
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
  ])('신청서의 ID 형식이 틀리면 invalid (%s)', async (_label, bad) => {
    const { appendRow, sendSlack, deps } = fakes()
    expect(await submitApply({ submissionId: bad, answers: validAnswers(applyForm) }, deps)).toEqual(INVALID)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['문자열', 'x'],
    ['숫자', 1],
    ['배열', []],
  ])('본문이 객체가 아니면(%s) 두 함수 모두 invalid 이다', async (_label, body) => {
    const { appendRow, sendSlack, deps } = fakes()
    for (const run of [submitApply, submitSurvey]) expect(await run(body, deps)).toEqual(INVALID)
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
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual(INVALID)
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
    expect(late.status === 'invalid' && late.errors.map((e) => e.questionId)).toEqual(['groom_date'])
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('today 와 now 를 주지 않으면 한국 시각의 오늘과 지금을 쓴다', async () => {
    const { appendRow, sendSlack } = fakes()
    const base = validAnswers(applyForm)
    const past = await submitApply({ submissionId: ID, answers: { ...base, groom_date: '2000-01-01' } }, { appendRow, sendSlack })
    expect(past.status === 'invalid' && past.errors.map((e) => e.questionId)).toEqual(['groom_date'])
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

describe('공백뿐인 선택 답', () => {
  // 비었다고 보는 답(forms/rules 의 isEmpty: 공백뿐인 글·빈 배열)은 검증 전에 버린다. 검증은 그런 답을 '없음' 으로 보고
  // 건너뛰므로, 남기면 길이·모양 검사 없이 공백이 시트 칸에 들어가고 날짜 칸은 슬랙에서 날짜 꼴로 읽혀 깨진다.
  const columnOf = (form: typeof applyForm, id: string) => 2 + allQuestions(form).findIndex((q) => q.id === id)
  const question = (form: typeof applyForm, id: string) => allQuestions(form).find((q) => q.id === id)!

  it('신청서의 선택 짧은 글·선택 단일 선택이 공백뿐이면 ok 이고, 시트 칸은 비고 슬랙은 답이 없을 때와 같다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    // 미용의 싫어하는 부위(짧은 글)와 호텔의 숙박 경험(단일 선택)은 선택 문항이다. 호텔 묶음이 보이게 호텔도 고른다.
    expect([question(applyForm, 'groom_sensitive'), question(applyForm, 'hotel_stayed')].map((q) => [q.type, q.required])).toEqual([
      ['short', false],
      ['single', false],
    ])
    // 2026-11-03 은 화요일(10:00~15:30), 2026-11-05 는 목요일이다.
    const base = {
      ...validAnswers(applyForm),
      services: [GROOMING_SERVICE, HOTEL_SERVICE],
      hotel_checkin_date: '2026-11-03',
      hotel_checkin_time: '15:00',
      hotel_checkout_date: '2026-11-05',
      hotel_checkout_time: '11:00',
    }
    const answers = { ...base, groom_sensitive: '   ', hotel_stayed: ' \t' }
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })

    const row = appendRow.mock.calls[0][1]
    expect(row[columnOf(applyForm, 'groom_sensitive')]).toBe('')
    expect(row[columnOf(applyForm, 'hotel_stayed')]).toBe('')
    expect(row).toEqual(sheetRow(applyForm, base, meta))

    const sent = sendSlack.mock.calls[0][0]
    expect(JSON.stringify(sent)).not.toMatch(/undefined|NaN/)
    expect(JSON.stringify(sent)).toContain(`*${question(applyForm, 'groom_sensitive').label}*\\n—`)
    expect(sent).toEqual(applyMessages(base, meta))
    // 고르지 않은 미용 시간은 알림 미리보기의 희망 일시에 붙지 않고, 호텔은 체크인 날짜·시간이 한국어로 붙는다.
    expect(sent[0].text).toContain('· 미용 1월 1일 (목), 호텔 11월 3일 (화) 오후 3:00 체크인')
  })

  it('고르지 않은 서비스 묶음의 답은 검증하지 않고 시트·슬랙에서 빠진다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    // 미용만 골랐다. 호텔·데이케어 묶음의 옛 답(틀린 날짜·선택지 밖 값·너무 긴 글)이 남아 있어도 거부하지 않고 버린다.
    const visible = validAnswers(applyForm)
    const answers = { ...visible, daycare_date: '2000-01-01', hotel_stayed: '선택지 밖 값', hotel_caution: '숨'.repeat(40_000) }
    expect(await submitApply({ submissionId: ID, answers }, deps)).toEqual({ status: 'ok' })

    const row = appendRow.mock.calls[0][1]
    expect(row[columnOf(applyForm, 'daycare_date')]).toBe('')
    expect(row[columnOf(applyForm, 'hotel_stayed')]).toBe('')
    expect(row[columnOf(applyForm, 'hotel_caution')]).toBe('')
    expect(row).toEqual(sheetRow(applyForm, visible, meta))

    const sent = sendSlack.mock.calls[0][0]
    expect(JSON.stringify(sent)).not.toContain('숨'.repeat(100))
    expect(sent).toEqual(applyMessages(visible, meta))
  })

  it('검사지의 선택 장문·선택 단일 선택이 공백뿐이면 ok 이고, 시트 칸은 비고 슬랙은 — 다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    // q32 는 조건 없는 선택 장문, q31 은 조건 없는 선택 단일 선택이다(원문에 필수 표시가 없다).
    const long = question(surveyForm, 'q32')
    const single = question(surveyForm, 'q31')
    expect([long, single].map((q) => [q.type, q.required, q.showIf])).toEqual([
      ['long', false, undefined],
      ['single', false, undefined],
    ])
    const base = validAnswers(surveyForm)
    const answers = { ...base, q32: ' '.repeat(2_000), q31: '\n' }
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })

    const row = appendRow.mock.calls[0][1]
    expect(row[columnOf(surveyForm, 'q32')]).toBe('')
    expect(row[columnOf(surveyForm, 'q31')]).toBe('')
    expect(row).toEqual(sheetRow(surveyForm, base, meta))

    const sent = JSON.stringify(sendSlack.mock.calls[0][0])
    expect(sent).not.toContain(' '.repeat(100))
    expect(sent).toContain(`*${long.label}*\\n—`)
    expect(sendSlack).toHaveBeenCalledWith(surveyMessages(base, meta))
  })

  it('복수 선택에 같은 값을 거듭 넣으면 invalid 이고 시트·슬랙을 부르지 않는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    // 미용을 거듭 넣는다(호텔이면 호텔 묶음이 보여 체크인·체크아웃 오류도 같이 난다).
    const answers = { ...validAnswers(applyForm), services: Array(1_000).fill(GROOMING_SERVICE) }
    const result = await submitApply({ submissionId: ID, answers }, deps)
    expect(result).toEqual({ status: 'invalid', errors: [{ questionId: 'services', message: '고를 수 없는 값이에요' }] })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })
})

describe('검사지 제출', () => {
  // 시트 행에서 그 문항 답의 위치: 접수 시각·신청 ID 다음부터 정의 순서
  const column = (id: string) => 2 + allQuestions(surveyForm).findIndex((q) => q.id === id)

  it('검사지는 검사지 탭에 쓴다', async () => {
    const { events, appendRow, sendSlack, deps } = fakes()
    const answers = validAnswers(surveyForm)
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })
    expect(events).toEqual(['시트 읽기', '시트 시작', '시트 끝', '슬랙'])
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(appendRow).toHaveBeenCalledWith('검사지', sheetRow(surveyForm, answers, meta))
    expect(appendRow.mock.calls[0][1]).toHaveLength(104)
    expect(sendSlack).toHaveBeenCalledWith(surveyMessages(answers, meta))
  })

  it('검사지가 여러 통이어도 sendSlack 은 한 번에 통째로 받는다', async () => {
    const { sendSlack, deps } = fakes()
    // 긴 답 문항을 3,000자로 채워 여러 통으로 나뉘게 한다. 통 사이 간격은 sendSlack 이 맡는다.
    const base = validAnswers(surveyForm)
    const long = allQuestions(surveyForm).filter((q) => q.type === 'long' && isVisible(q, base))
    const answers = { ...base, ...Object.fromEntries(long.map((q) => [q.id, '가'.repeat(3000)])) }
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })
    expect(sendSlack).toHaveBeenCalledTimes(1)
    const sent = sendSlack.mock.calls[0][0]
    expect(sent.length).toBeGreaterThan(1)
    expect(sent).toEqual(surveyMessages(answers, meta))
  })

  it('검사지 행의 신청 ID 는 링크의 신청 ID 이고, 슬랙 첫 통에 그 신청의 검사지라고 적힌다', async () => {
    const { appendRow, sendSlack, surveySubmitted, deps } = fakes()
    expect(await submitSurvey({ token: TOKEN, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'ok' })
    expect(surveySubmitted).toHaveBeenCalledWith(ID)
    expect(appendRow.mock.calls[0][1][1]).toBe(ID)
    expect(JSON.stringify(sendSlack.mock.calls[0][0][0].blocks)).toContain(`예약 신청 ${ID}의 검사지예요`)
  })

  it('본문의 submissionId·applyId 는 믿지 않는다 — 행의 ID 는 링크의 것이다', async () => {
    const { appendRow, deps } = fakes()
    const body = { token: TOKEN, submissionId: 'ZZzz112233', applyId: 'YYyy112233', answers: validAnswers(surveyForm) }
    expect(await submitSurvey(body, deps)).toEqual({ status: 'ok' })
    expect(appendRow.mock.calls[0][1][1]).toBe(ID)
  })

  it.each([
    ['없음', undefined],
    ['빈 문자열', ''],
    ['서명 없음', ID],
    ['다른 비밀값으로 만든 링크', surveyToken(ID, 'another-survey-link-secret-0123456789abcdef')],
    ['서명을 바꾼 링크', `${ID}-${'0'.repeat(32)}`],
    ['숫자', 1234567890],
    ['객체', {}],
  ])('링크가 틀리면(%s) invalid 이고 시트를 읽지도 쓰지도 않는다', async (_label, token) => {
    const { appendRow, sendSlack, surveySubmitted, deps } = fakes()
    expect(await submitSurvey({ token, answers: validAnswers(surveyForm) }, deps)).toEqual(INVALID)
    expect(surveySubmitted).not.toHaveBeenCalled()
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('이미 낸 신청 ID 면 시트에 쓰지도 슬랙을 보내지도 않고 ok — 응답을 못 받은 재시도는 완료 화면으로 간다', async () => {
    const { appendRow, sendSlack, surveySubmitted, deps } = fakes()
    surveySubmitted.mockResolvedValue(true)
    expect(await submitSurvey({ token: TOKEN, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'ok' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('냈는지 시트를 못 읽으면 failed 이고 쓰지 않으며 로그에 ID 만 남는다', async () => {
    const { appendRow, sendSlack, surveySubmitted, deps } = fakes()
    surveySubmitted.mockRejectedValue(new Error(SECRET))
    expect(await submitSurvey({ token: TOKEN, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'failed' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
  })

  it('답이 틀리면 시트를 읽기 전에 invalid 다', async () => {
    const { surveySubmitted, deps } = fakes()
    expect((await submitSurvey({ token: TOKEN, answers: {} }, deps)).status).toBe('invalid')
    expect(surveySubmitted).not.toHaveBeenCalled()
  })

  it('검사지에서 필수가 비면 invalid 와 오류 목록이다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    const result = await submitSurvey({ token: TOKEN, answers: {} }, deps)
    expect(result).toEqual({ status: 'invalid', errors: validateForm(surveyForm, {}, TODAY) })
    expect(result.status === 'invalid' && result.errors.length).toBeGreaterThan(0)
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
  })

  it('숨은 문항의 답은 시트·슬랙에서 빠진다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    // q59 가 '아니오', q80·q81 이 둘 다 '아니오' 라서 긴 답 문항 q60·q82 는 숨은 문항이다. 화면이 옛 답을 지우지 않은 경우를 흉내 낸다.
    const visible = { ...validAnswers(surveyForm), q59: '아니오', q80: '아니오', q81: '아니오' }
    const hidden = '숨'.repeat(40_000)
    const answers = { ...visible, q60: hidden, q82: hidden }
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })

    const row = appendRow.mock.calls[0][1]
    expect(row[column('q60')]).toBe('')
    expect(row[column('q82')]).toBe('')
    expect(row.every((cell) => !cell.includes('숨'.repeat(100)))).toBe(true)
    expect(row).toEqual(sheetRow(surveyForm, visible, meta))

    // 슬랙은 숨은 답이 없을 때와 똑같은 메시지다(40,000자가 통 수를 늘리지 않는다).
    const sent = sendSlack.mock.calls[0][0]
    expect(JSON.stringify(sent)).not.toContain('숨'.repeat(100))
    expect(sent).toEqual(surveyMessages(visible, meta))
  })

  it('숨은 선택 문항에 선택지 밖 값이 와도 거부하지 않고 버린다', async () => {
    const { appendRow, deps } = fakes()
    // q49 가 '아니오' 면 q50(복수 선택) 이, q61 이 '아니오' 면 q62(단일 선택) 가 숨는다.
    const visible = { ...validAnswers(surveyForm), q49: '아니오', q61: '아니오' }
    const answers = { ...visible, q50: ['선택지 밖 값'], q62: '선택지 밖 값' }
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })
    const row = appendRow.mock.calls[0][1]
    expect(row[column('q50')]).toBe('')
    expect(row[column('q62')]).toBe('')
    expect(row.some((cell) => cell.includes('선택지 밖 값'))).toBe(false)
  })

  it('보이는 조건부 문항의 답은 그대로 간다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    const answers = { ...validAnswers(surveyForm), q81: '네', q82: '작년에 슬개골 수술을 받았어요' }
    expect(await submitSurvey({ token: TOKEN, answers }, deps)).toEqual({ status: 'ok' })
    expect(appendRow.mock.calls[0][1][column('q82')]).toBe('작년에 슬개골 수술을 받았어요')
    expect(appendRow).toHaveBeenCalledWith('검사지', sheetRow(surveyForm, answers, meta))
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain('작년에 슬개골 수술을 받았어요')
  })

  it('보이는 문항의 답은 그대로 검증하고 숨은 문항은 검증하지 않는다', async () => {
    const { appendRow, deps } = fakes()
    // 보이는 q82 가 3,000자를 넘으면 거부한다. 숨은 q82 면 같은 값이어도 통과한다(버려지므로).
    const tooLong = '숨'.repeat(3001)
    const whenShown = await submitSurvey({ token: TOKEN, answers: { ...validAnswers(surveyForm), q81: '네', q82: tooLong } }, deps)
    expect(whenShown.status === 'invalid' && whenShown.errors).toEqual([{ questionId: 'q82', message: '3,000자까지 적을 수 있어요' }])
    expect(appendRow).not.toHaveBeenCalled()
    const whenHidden = await submitSurvey(
      { token: TOKEN, answers: { ...validAnswers(surveyForm), q80: '아니오', q81: '아니오', q82: tooLong } },
      deps,
    )
    expect(whenHidden).toEqual({ status: 'ok' })
  })

  it('q2 에서 동의하지 않음을 고르면 invalid 이다', async () => {
    const { appendRow, deps } = fakes()
    const answers = { ...validAnswers(surveyForm), q2: '동의하지 않음 (서비스 이용 불가)' }
    const result = await submitSurvey({ token: TOKEN, answers }, deps)
    expect(result.status === 'invalid' && result.errors.map((e) => e.questionId)).toEqual(['q2'])
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('시트 실패면 failed 이고 슬랙을 부르지 않으며 로그에 ID 만 남는다', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    appendRow.mockRejectedValue(new Error(SECRET))
    expect(await submitSurvey({ token: TOKEN, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'failed' })
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
  })

  it('슬랙 실패여도 ok 이고 로그에 ID 만 남는다', async () => {
    const { sendSlack, deps } = fakes()
    sendSlack.mockRejectedValue(new Error(SECRET))
    expect(await submitSurvey({ token: TOKEN, answers: validAnswers(surveyForm) }, deps)).toEqual({ status: 'ok' })
    expect(errorSpy.mock.calls).toEqual([['슬랙 전송 실패', ID]])
  })
})
