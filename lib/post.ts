// 제출 경로 둘(/api/apply, /api/survey)에 JSON 을 보내는 브라우저 쪽 도우미다.
// fetch 에는 basePath 가 붙지 않으므로 여기서 BASE_PATH 를 앞에 붙인다. 부르는 쪽은 /api/... 로만 적는다.
// 서버는 200 `{ok:true}` / 400 `{ok:false,errors}` / 503 `{ok:false}` 를 주고, 그 밖의 500 은 본문이 비어 있을 수 있어서
// 본문은 읽지 않고 상태 코드만 본다. 요청 본문(답변·연락처)과 오류 객체는 어디에도 찍지 않는다.

import { BASE_PATH } from './base-path'

type PostResult = 'ok' | 'invalid' | 'failed'

/** 서버 함수의 제한(30초)보다 조금 더 기다린다. 이보다 길면 서버는 이미 포기했다. */
const TIMEOUT_MS = 35_000

/** 200 이면 ok, 400 이면 invalid, 그 밖과 거부(네트워크 오류·시간 초과)는 failed. */
export async function postJson(url: string, body: unknown): Promise<PostResult> {
  try {
    const res = await fetch(BASE_PATH + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 200) return 'ok'
    return res.status === 400 ? 'invalid' : 'failed'
  } catch {
    return 'failed'
  }
}
