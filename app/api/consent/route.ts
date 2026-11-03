import { submitConsent } from '../../../lib/consent-submit'
import { json } from '../../../lib/http'

export const runtime = 'nodejs'
// PDF 만들기·시트 저장·메일 두 통·슬랙 전송이 끝난 뒤에 응답하므로 함수 시간 제한을 30초로 올린다.
export const maxDuration = 30

/**
 * 보호자의 동의서 서명. 본문을 JSON 으로 읽어 넘기고 결과를 상태 코드로 바꾼다(closed 는 409).
 * 본문 모양 검사·허니팟·로그는 submitConsent 안에 있다. 여기서는 본문도 오류도 찍지 않는다.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, errors: [] }, 400)
  }
  const result = await submitConsent(body, req.headers.get('user-agent') ?? '')
  switch (result.status) {
    case 'ok':
      return json({ ok: true, pdf: result.pdf, mailed: result.mailed }, 200)
    case 'invalid':
      return json({ ok: false, errors: result.errors }, 400)
    case 'closed':
      return json({ ok: false }, 409)
    case 'failed':
      return json({ ok: false }, 503)
  }
}
