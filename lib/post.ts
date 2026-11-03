// 제출 경로(/api/apply, /api/survey, /api/consent)에 JSON 을 보내는 브라우저 쪽 도우미다.
// fetch 에는 basePath 가 붙지 않으므로 여기서 BASE_PATH 를 앞에 붙인다. 부르는 쪽은 /api/... 로만 적는다.
// 서버는 200 `{ok:true}` / 400 `{ok:false,errors}` / 503 `{ok:false}` 를 주고, 그 밖의 500 은 본문이 비어 있을 수 있다.
// 요청 본문(답변·연락처)과 오류 객체는 어디에도 찍지 않는다.

import { BASE_PATH } from './base-path'
import type { FieldError } from './validate'

type PostResult = 'ok' | 'invalid' | 'failed'

/** 서버 함수의 제한(30초)보다 조금 더 기다린다. 이보다 길면 서버는 이미 포기했다. */
const TIMEOUT_MS = 35_000

function send(url: string, body: unknown): Promise<Response> {
  return fetch(BASE_PATH + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** 200 이면 ok, 400 이면 invalid, 그 밖과 거부(네트워크 오류·시간 초과)는 failed. 본문은 읽지 않고 상태 코드만 본다. */
export async function postJson(url: string, body: unknown): Promise<PostResult> {
  try {
    const res = await send(url, body)
    if (res.status === 200) return 'ok'
    return res.status === 400 ? 'invalid' : 'failed'
  } catch {
    return 'failed'
  }
}

export interface PostForResult {
  result: 'ok' | 'invalid' | 'closed' | 'failed'
  /** ok: 서버 본문(동의서: pdf·mailed). invalid: 본문이 읽히면 오류 목록. */
  data?: { pdf?: string; mailed?: boolean; errors?: FieldError[] }
}

/**
 * 본문까지 읽는 제출(동의서 서명). 200 이면 본문 JSON 과 ok, 400 이면 invalid(본문이 읽히면 오류 목록도), 409 면 closed(닫힌 링크),
 * 그 밖과 거부(네트워크 오류·시간 초과, 200 인데 본문이 깨짐)는 failed.
 */
export async function postForResult(url: string, body: unknown): Promise<PostForResult> {
  try {
    const res = await send(url, body)
    if (res.status === 200) return { result: 'ok', data: await res.json() }
    if (res.status === 400) {
      const data = await res.json().catch(() => undefined)
      return data === undefined ? { result: 'invalid' } : { result: 'invalid', data }
    }
    return { result: res.status === 409 ? 'closed' : 'failed' }
  } catch {
    return { result: 'failed' }
  }
}
