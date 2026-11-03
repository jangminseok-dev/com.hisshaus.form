import type { SubmitResult } from './submit'

export const json = (body: object, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * 제출 경로 둘의 공통 몸통: 본문을 JSON 으로 읽어 제출 함수에 넘기고 결과를 상태 코드로 바꾼다.
 * 본문 모양 검사·허니팟·로그는 제출 함수 안에 있다. 여기서는 본문도 오류도 찍지 않는다.
 */
export async function handle(req: Request, submit: (body: unknown) => Promise<SubmitResult>): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, errors: [] }, 400)
  }
  const result = await submit(body)
  if (result.status === 'ok') return json({ ok: true }, 200)
  if (result.status === 'invalid') return json({ ok: false, errors: result.errors }, 400)
  return json({ ok: false }, 503)
}
