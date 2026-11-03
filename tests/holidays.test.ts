import { afterEach, describe, expect, it, vi } from 'vitest'

import { holidays, parseHolidays } from '../lib/holidays'

afterEach(() => vi.unstubAllEnvs())

/** 공공데이터포털 한국천문연구원 특일 정보(getRestDeInfo)의 XML 응답 모양. */
const xml = (items: string, code = '00') =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><header><resultCode>${code}</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>` +
  `<body><items>${items}</items><numOfRows>100</numOfRows><pageNo>1</pageNo><totalCount>3</totalCount></body></response>`
const item = (locdate: string, name: string, isHoliday = 'Y') =>
  `<item><dateKind>01</dateKind><dateName>${name}</dateName><isHoliday>${isHoliday}</isHoliday><locdate>${locdate}</locdate><seq>1</seq></item>`

describe('공휴일 응답 읽기', () => {
  it('isHoliday 가 Y 인 날만 YYYY-MM-DD 로 꺼낸다', () => {
    const body = xml(item('20261225', '기독탄신일') + item('20261009', '한글날') + item('20260501', '노동절', 'N'))
    expect(parseHolidays(body)).toEqual(['2026-12-25', '2026-10-09'])
  })

  it('결과 코드가 00 이 아니거나(키 오류 등) 모양이 다르면 빈 목록이다', () => {
    expect(parseHolidays(xml(item('20261225', '기독탄신일'), '30'))).toEqual([])
    expect(parseHolidays('<OpenAPI_ServiceResponse><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></OpenAPI_ServiceResponse>')).toEqual([])
    expect(parseHolidays('')).toEqual([])
  })

  it('공휴일이 없는 해는 빈 목록이다', () => {
    expect(parseHolidays(xml(''))).toEqual([])
  })
})

describe('공휴일 받기', () => {
  it('키가 없으면 부르지 않고 빈 목록이다 — 화요일만 막는다', async () => {
    vi.stubEnv('HOLIDAY_API_KEY', '')
    const fetchFn = vi.fn<typeof fetch>()
    expect(await holidays(2026, fetchFn)).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('올해와 내년을 키·연도·100건으로 부르고, 두 해를 합쳐 날짜순으로 돌려준다', async () => {
    vi.stubEnv('HOLIDAY_API_KEY', 'a+b/c=')
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      const year = new URL(String(url)).searchParams.get('solYear')
      const body = year === '2026' ? xml(item('20261225', '기독탄신일')) : xml(item('20270101', '1월1일') + item('20270207', '설날'))
      return new Response(body)
    })
    expect(await holidays(2026, fetchFn)).toEqual(['2026-12-25', '2027-01-01', '2027-02-07'])
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const urls = fetchFn.mock.calls.map(([url]) => new URL(String(url)))
    expect(urls.map((u) => `${u.origin}${u.pathname}`)).toEqual(
      Array(2).fill('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'),
    )
    expect(urls.map((u) => u.searchParams.get('solYear'))).toEqual(['2026', '2027'])
    // Decoding 키를 넣으면 주소에 한 번만 인코딩돼 원래 값으로 읽힌다.
    expect(urls.every((u) => u.searchParams.get('ServiceKey') === 'a+b/c=' && u.searchParams.get('numOfRows') === '100')).toBe(true)
    // 같은 응답을 12시간 동안 다시 쓴다(사용자 결정 2026-11-03).
    expect(fetchFn.mock.calls.every(([, init]) => (init as { next?: { revalidate?: number } })?.next?.revalidate === 43200)).toBe(true)
  })

  it('부르기가 실패하거나 응답이 200 이 아니면 빈 목록이다 — 신청은 막지 않는다', async () => {
    vi.stubEnv('HOLIDAY_API_KEY', 'key')
    expect(await holidays(2026, vi.fn<typeof fetch>().mockRejectedValue(new Error('network')))).toEqual([])
    expect(await holidays(2026, vi.fn<typeof fetch>().mockResolvedValue(new Response('busy', { status: 503 })))).toEqual([])
  })
})
