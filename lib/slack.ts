import { slackMention, slackWebhookUrl } from './config'
import { BLOCKS_LIMIT, type Block, type SlackMessage } from './slack-blocks'

export interface SlackDeps {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

const TIMEOUT_MS = 5_000
/** 슬랙 웹훅은 초당 1건이다. */
const GAP_MS = 1_000

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * SLACK_MENTION 값을 슬랙 멘션 글로. `channel` → <!channel>, `here` → <!here>, 멤버 ID → <@ID>. 쉼표로 여러 개.
 * 모르는 값은 버린다(멘션 꼴이 아니면 그냥 글자로 찍혀 보기 흉하다). 쓸 것이 없으면 undefined.
 */
export function mentionText(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s === 'channel' || s === 'here' ? `<!${s}>` : /^[UW][A-Z0-9]{8,}$/.test(s) ? `<@${s}>` : ''))
    .filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/**
 * 첫 통에 멘션을 붙인다. 머리글 다음 블록으로 넣어 실제로 알림이 울리게 하고, 알림 미리보기(text)에도 앞에 붙인다.
 * 블록이 이미 한도라면(검사지가 긴 경우) 미리보기에만 붙인다. 뒤 통에는 붙이지 않는다(한 번만 울리면 된다).
 */
export function withMention(messages: SlackMessage[], mention: string | undefined): SlackMessage[] {
  if (!mention || messages.length === 0) return messages
  const [first, ...rest] = messages
  const mentionBlock: Block = { type: 'section', text: { type: 'mrkdwn', text: mention } }
  const blocks = first.blocks.length < BLOCKS_LIMIT ? [first.blocks[0], mentionBlock, ...first.blocks.slice(1)] : first.blocks
  return [{ ...first, text: `${mention} ${first.text}`, blocks }, ...rest]
}

/**
 * 메시지를 순서대로 웹훅에 보낸다. 한 통이 실패하면 뒤 통은 보내지 않고 `Error('slack')` 만 던진다.
 * 원래 오류와 응답 본문은 버린다: 오류의 메시지나 cause 에 웹훅 주소가 들어 있을 수 있다.
 */
export async function sendSlack(messages: SlackMessage[], deps: SlackDeps = {}): Promise<void> {
  const post = deps.fetch ?? fetch
  const sleep = deps.sleep ?? wait
  for (const [i, message] of withMention(messages, mentionText(slackMention())).entries()) {
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
