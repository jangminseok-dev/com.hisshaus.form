import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as applyRoute from '../app/api/apply/route'
import * as consentRoute from '../app/api/consent/route'
import * as surveyRoute from '../app/api/survey/route'
import { submitConsent, type ConsentResult } from '../lib/consent-submit'
import { submitApply, submitSurvey, type SubmitResult } from '../lib/submit'

// 제출 로직은 submit.test.ts 가 덮는다. 여기서는 경로가 본문을 읽어 넘기고 결과를 상태 코드로 바꾸는지만 본다.
vi.mock('../lib/submit', () => ({
  submitApply: vi.fn(),
  submitSurvey: vi.fn(),
}))
vi.mock('../lib/consent-submit', () => ({
  submitConsent: vi.fn(),
}))

const ROUTES = [
  { name: '/api/apply', route: applyRoute, submit: submitApply },
  { name: '/api/survey', route: surveyRoute, submit: submitSurvey },
]

const FIELD_ERRORS = [
  { questionId: 'guardian_name', message: '꼭 적어 주세요' },
  { questionId: 'privacy_consent', message: '동의해야 신청할 수 있어요' },
]

/** 제출 함수가 줄 수 있는 결과 셋. */
const RESULTS: SubmitResult[] = [{ status: 'ok' }, { status: 'invalid', errors: FIELD_ERRORS }, { status: 'failed' }]

const NOT_JSON = [
  ['글자', 'not json'],
  ['잘린 JSON', '{"submissionId":'],
  ['빈 본문', ''],
]

const post = (route: { POST: (req: Request) => Promise<Response> }, body: string) =>
  route.POST(
    new Request('http://x/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
  )

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(ROUTES)('POST $name', ({ route, submit }) => {
  const submitMock = vi.mocked(submit)

  it.each(NOT_JSON)('JSON 이 아니면 400 (%s)', async (_label, raw) => {
    const res = await post(route, raw)
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ ok: false, errors: [] })
  })

  it.each(NOT_JSON)('JSON 이 아니면 제출 함수를 부르지 않는다 (%s)', async (_label, raw) => {
    await post(route, raw)
    for (const r of ROUTES) expect(r.submit).not.toHaveBeenCalled()
  })

  it('ok 면 200', async () => {
    submitMock.mockResolvedValue({ status: 'ok' })
    const res = await post(route, '{}')
    expect(res.status).toBe(200)
    expect(await res.json()).toStrictEqual({ ok: true })
  })

  it('invalid 면 400 과 오류 목록', async () => {
    submitMock.mockResolvedValue({ status: 'invalid', errors: FIELD_ERRORS })
    const res = await post(route, '{}')
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ ok: false, errors: FIELD_ERRORS })
  })

  it('invalid 인데 오류 목록이 비어 있어도 400 과 빈 목록', async () => {
    submitMock.mockResolvedValue({ status: 'invalid', errors: [] })
    const res = await post(route, '{}')
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ ok: false, errors: [] })
  })

  it('failed 면 503', async () => {
    submitMock.mockResolvedValue({ status: 'failed' })
    const res = await post(route, '{}')
    expect(res.status).toBe(503)
    expect(await res.json()).toStrictEqual({ ok: false })
  })

  it('maxDuration 이 30 이다', () => {
    expect(route.maxDuration).toBe(30)
  })

  it('runtime 이 nodejs 다', () => {
    expect(route.runtime).toBe('nodejs')
  })

  it('응답에 Cache-Control: no-store 가 붙는다', async () => {
    const responses = [await post(route, 'not json')]
    for (const result of RESULTS) {
      submitMock.mockResolvedValueOnce(result)
      responses.push(await post(route, '{}'))
    }
    expect(responses.map((res) => res.status)).toStrictEqual([400, 200, 400, 503])
    for (const res of responses) expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('경로마다 맞는 제출 함수를 부르고 본문을 그대로 넘긴다', async () => {
    submitMock.mockResolvedValue({ status: 'ok' })
    const body = { submissionId: 'abcDEF1234', answers: { guardian_name: '홍길동', pet_kind: ['강아지'] } }
    await post(route, JSON.stringify(body))
    expect(submitMock).toHaveBeenCalledTimes(1)
    expect(submitMock).toHaveBeenCalledWith(body)
    // 다른 경로의 제출 함수는 건드리지 않는다.
    for (const r of ROUTES) if (r.submit !== submit) expect(r.submit).not.toHaveBeenCalled()
  })

  it.each([
    ['null', null],
    ['배열', []],
    ['숫자', 42],
    ['문자열', '가'],
  ])('객체가 아닌 JSON(%s)도 걸러 내지 않고 제출 함수에 넘긴다', async (_label, body) => {
    submitMock.mockResolvedValue({ status: 'invalid', errors: [] })
    const res = await post(route, JSON.stringify(body))
    // 본문 모양 검사는 제출 함수의 일이다. 경로는 읽은 값을 그대로 넘기고 결과만 바꾼다.
    expect(submitMock).toHaveBeenCalledWith(body)
    expect(res.status).toBe(400)
  })

  it('요청 본문과 결과를 로그에 찍지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const body = JSON.stringify({ submissionId: 'abcDEF1234', answers: { guardian_name: '비밀 답변' } })
    for (const result of RESULTS) {
      submitMock.mockResolvedValueOnce(result)
      await post(route, body)
    }
    await post(route, 'not json')
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('POST /api/consent', () => {
  const submitMock = vi.mocked(submitConsent)
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
  const send = (body: string, headers: Record<string, string> = { 'User-Agent': UA }) =>
    consentRoute.POST(new Request('http://x/api/consent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }))

  it.each(NOT_JSON)('JSON 이 아니면 400 이고 제출 함수를 부르지 않는다 (%s)', async (_label, raw) => {
    const res = await send(raw)
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ ok: false, errors: [] })
    expect(submitMock).not.toHaveBeenCalled()
  })

  it.each<[ConsentResult, number, object]>([
    [{ status: 'ok', pdf: 'JVBERi0=', mailed: true }, 200, { ok: true, pdf: 'JVBERi0=', mailed: true }],
    [{ status: 'ok', mailed: false }, 200, { ok: true, mailed: false }],
    [{ status: 'invalid', errors: [{ questionId: 'signature', message: '사인해 주세요' }] }, 400, { ok: false, errors: [{ questionId: 'signature', message: '사인해 주세요' }] }],
    [{ status: 'closed' }, 409, { ok: false }],
    [{ status: 'failed' }, 503, { ok: false }],
  ])('결과 %j 는 %i 와 정해진 본문, Cache-Control: no-store 다', async (result, status, json) => {
    submitMock.mockResolvedValue(result)
    const res = await send('{}')
    expect(res.status).toBe(status)
    expect(await res.json()).toStrictEqual(json)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('본문과 User-Agent 를 그대로 넘기고, User-Agent 가 없으면 빈 글을 넘긴다', async () => {
    submitMock.mockResolvedValue({ status: 'ok', mailed: false })
    const body = { token: 'x', info: { guardianName: '김하나' } }
    await send(JSON.stringify(body))
    expect(submitMock).toHaveBeenLastCalledWith(body, UA)
    await send('{}', {})
    expect(submitMock).toHaveBeenLastCalledWith({}, '')
  })

  it('maxDuration 이 30 이고 runtime 이 nodejs 다', () => {
    expect(consentRoute.maxDuration).toBe(30)
    expect(consentRoute.runtime).toBe('nodejs')
  })

  it('JSON 이 아닌 본문의 400 에도 Cache-Control: no-store 가 붙고, 본문·결과를 로그에 찍지 않는다', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    const bad = await send('not json')
    expect(bad.headers.get('Cache-Control')).toBe('no-store')
    submitMock.mockResolvedValue({ status: 'failed' })
    await send(JSON.stringify({ info: { guardianName: '비밀 답변' } }))
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
