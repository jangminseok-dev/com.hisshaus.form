import { slackWebhookUrl } from './config'
import type { SlackMessage } from './slack-blocks'

export interface SlackDeps {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const TIMEOUT_MS = 5_000
/** 슬랙 웹훅은 초당 1건이다. */
const GAP_MS = 1_000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 메시지를 순서대로 웹훅에 보낸다. 한 통이 실패하면 뒤 통은 보내지 않고 `Error('slack')` 만 던진다.
 * 원래 오류와 응답 본문은 버린다: 오류의 메시지나 cause 에 웹훅 주소가 들어 있을 수 있다.
 */
export async function sendSlack(messages: SlackMessage[], deps: SlackDeps = {}): Promise<void> {
  const post = deps.fetch ?? fetch
  const sleep = deps.sleep ?? wait
  for (const [i, message] of messages.entries()) {
    if (i > 0) await sleep(GAP_MS)
    let ok = false
    try {
      const res = await post(slackWebhookUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      ok = res.ok
    } catch {
      // 설정·네트워크·타임아웃 오류는 버린다.
    }
    if (!ok) throw new Error('slack')
  }
}
