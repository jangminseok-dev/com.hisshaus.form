import { holidayApiKey } from './config'
import { todayKst } from './format'

// 공공데이터포털 '한국천문연구원_특일 정보' 의 공휴일 정보 조회. 대체공휴일·선거일 같은 임시공휴일도 지정되면 들어온다.
const ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

/** 응답 XML 에서 공휴일(isHoliday=Y) 날짜를 'YYYY-MM-DD' 로. 결과 코드가 00 이 아니면(키 오류 등) 빈 목록이다. */
export function parseHolidays(xml: string): string[] {
  if (!/<resultCode>00<\/resultCode>/.test(xml)) return []
  const out: string[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const day = /<locdate>(\d{8})<\/locdate>/.exec(item)?.[1]
    if (day && /<isHoliday>Y<\/isHoliday>/.test(item)) out.push(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`)
  }
  return out
}

/**
 * 올해·내년 공휴일('YYYY-MM-DD', 날짜순). 서버만 부르고(브라우저는 이 웹만 부른다) 같은 응답을 12시간 동안 다시 쓴다(사용자 결정 2026-11-03).
 * 키가 없거나 부르기가 실패하면 빈 목록이다 — 화요일만 막고 신청은 그대로 받는다.
 * 로그는 남기지 않는다(주소에 키가 들어 있고, 로그 규칙은 시트·슬랙 실패만 적는다).
 */
export async function holidays(year = Number(todayKst().slice(0, 4)), fetchFn: typeof fetch = fetch): Promise<string[]> {
  const key = holidayApiKey()
  if (!key) return []
  try {
    const lists = await Promise.all(
      [year, year + 1].map(async (y) => {
        const res = await fetchFn(`${ENDPOINT}?${new URLSearchParams({ ServiceKey: key, solYear: String(y), numOfRows: '100' })}`, {
          next: { revalidate: 43200 },
        })
        return res.ok ? parseHolidays(await res.text()) : []
      }),
    )
    return [...new Set(lists.flat())].sort()
  } catch {
    return []
  }
}
