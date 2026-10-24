import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mentionText, sendSlack, withMention } from '../lib/slack'
import type { Block, SlackMessage } from '../lib/slack-blocks'

const HOOK = 'https://hooks.slack.test/services/T000/B000/SECRETTOKEN'
const msg = (text: string): SlackMessage => ({ text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] })

beforeEach(() => vi.stubEnv('SLACK_WEBHOOK_URL', HOOK))
afterEach(() => vi.unstubAllEnvs())

/** 가짜 fetch 와 가짜 sleep. events 에 POST 와 쉬는 순서가 쌓인다. 응답은 순서대로 꺼내 쓰고 없으면 200. */
function setup(responses: (Response | Error)[] = []) {
  const events: string[] = []
  const calls: { url: string; init: RequestInit }[] = []
  const queue = [...responses]
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    events.push(`POST ${calls.length}`)
    const next = queue.shift() ?? new Response('ok')
    if (next instanceof Error) throw next
    return next
  }) as typeof globalThis.fetch
  const sleep = vi.fn(async (ms: number) => {
    events.push(`쉼 ${ms}`)
  })
  return { events, calls, deps: { fetch, sleep } }
}

async function thrown(p: Promise<unknown>): Promise<Error> {
  try {
    await p
  } catch (e) {
    return e as Error
  }
  throw new Error('던지지 않았다')
}

describe('슬랙 전송', () => {
  it('메시지 수만큼 POST 하고 사이에 1초 쉰다', async () => {
    const { events, calls, deps } = setup()
    const messages = [msg('하나'), msg('둘'), msg('셋')]
    await sendSlack(messages, deps)
    // 첫 통 앞과 마지막 통 뒤에는 쉬지 않는다: 쉬는 횟수 = 통 수 - 1
    expect(events).toEqual(['POST 1', '쉼 1000', 'POST 2', '쉼 1000', 'POST 3'])
    expect(calls.map((c) => c.url)).toEqual([HOOK, HOOK, HOOK])
    expect(calls.map((c) => c.init.method)).toEqual(['POST', 'POST', 'POST'])
    expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual(messages)
    for (const c of calls) expect(new Headers(c.init.headers).get('content-type')).toBe('application/json')
  })

  it('통이 하나면 쉬지 않는다', async () => {
    const { events, deps } = setup()
    await sendSlack([msg('하나')], deps)
    expect(events).toEqual(['POST 1'])
    expect(deps.sleep).not.toHaveBeenCalled()
  })

  it('통마다 타임아웃 신호를 건다', async () => {
    const { calls, deps } = setup()
    await sendSlack([msg('하나'), msg('둘')], deps)
    expect(calls).toHaveLength(2)
    for (const c of calls) expect(c.init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([429, 500])('2xx 가 아니면 던지되 메시지에 주소가 없다 (응답 %i, 응답 본문도 담지 않는다)', async (status) => {
    const { deps } = setup([new Response('invalid_payload SECRETBODY', { status })])
    const err = await thrown(sendSlack([msg('하나')], deps))
    expect(err.message).toBe('slack')
    expect(err.cause).toBeUndefined()
    expect(String(err)).not.toContain('hooks.slack.test')
    expect(String(err)).not.toContain('SECRET')
  })

  it('fetch 가 거부되면 원래 오류를 버리고 slack 오류로 바꾼다', async () => {
    // 네트워크 오류의 메시지나 cause 에 웹훅 주소가 들어갈 수 있다.
    const { deps } = setup([new Error(`connect ECONNREFUSED ${HOOK}`)])
    const err = await thrown(sendSlack([msg('하나')], deps))
    expect(err.message).toBe('slack')
    expect(err.cause).toBeUndefined()
    expect(String(err)).not.toContain('SECRETTOKEN')
  })

  it('웹훅 주소 설정이 없으면 요청을 보내지 않고 slack 오류로 던진다', async () => {
    vi.stubEnv('SLACK_WEBHOOK_URL', '')
    const { calls, deps } = setup()
    const err = await thrown(sendSlack([msg('하나')], deps))
    expect(err.message).toBe('slack')
    expect(calls).toHaveLength(0)
  })

  it('한 통이 실패하면 뒤 통은 보내지 않는다', async () => {
    const { events, deps } = setup([new Response('no', { status: 500 })])
    await thrown(sendSlack([msg('하나'), msg('둘'), msg('셋')], deps))
    expect(events).toEqual(['POST 1'])
  })
})

describe('멘션', () => {
  it('SLACK_MENTION 값을 멘션 글로 바꾼다 — channel·here·멤버 ID, 쉼표로 여러 개, 모르는 값은 버린다', () => {
    expect(mentionText(undefined)).toBeUndefined()
    expect(mentionText('')).toBeUndefined()
    expect(mentionText('channel')).toBe('<!channel>')
    expect(mentionText('here')).toBe('<!here>')
    expect(mentionText('U0CBYB15WKE')).toBe('<@U0CBYB15WKE>')
    expect(mentionText(' U0CBYB15WKE , W012345678 ,channel')).toBe('<@U0CBYB15WKE> <@W012345678> <!channel>')
    // 멘션 꼴이 아닌 값(이름·@·주소)은 글자로 찍히면 보기 흉하니 버린다.
    expect(mentionText('@사장님')).toBeUndefined()
    expect(mentionText('u0cbyb15wke')).toBeUndefined()
    expect(mentionText('<@U0CBYB15WKE>')).toBeUndefined()
  })

  it('첫 통에만 머리글 다음 블록과 미리보기 앞에 멘션을 붙인다', () => {
    const header: Block = { type: 'header', text: { type: 'plain_text', text: '🐾 새 예약 신청' } }
    const body: Block = { type: 'section', text: { type: 'mrkdwn', text: '*보호자*' } }
    const out = withMention(
      [
        { text: '새 예약 신청: 초코', blocks: [header, body] },
        { text: '새 예약 신청: 초코 (2/2)', blocks: [header, body] },
      ],
      '<@U0CBYB15WKE>',
    )
    expect(out[0].text).toBe('<@U0CBYB15WKE> 새 예약 신청: 초코')
    expect(out[0].blocks).toEqual([header, { type: 'section', text: { type: 'mrkdwn', text: '<@U0CBYB15WKE>' } }, body])
    expect(out[1]).toEqual({ text: '새 예약 신청: 초코 (2/2)', blocks: [header, body] })
  })

  it('멘션이 없으면 그대로고, 첫 통의 블록이 이미 50개면 미리보기에만 붙인다', () => {
    const m: SlackMessage = { text: 't', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'x' } }] }
    expect(withMention([m], undefined)).toEqual([m])
    const full: SlackMessage = { text: 't', blocks: Array.from({ length: 50 }, () => ({ type: 'divider' })) }
    const out = withMention([full], '<!here>')
    expect(out[0].text).toBe('<!here> t')
    expect(out[0].blocks).toHaveLength(50)
  })

  it('보낼 때 SLACK_MENTION 을 읽어 첫 통에 붙인다. 없으면 안 붙인다', async () => {
    vi.stubEnv('SLACK_MENTION', 'U0CBYB15WKE')
    const { calls, deps } = setup()
    await sendSlack([msg('a'), msg('b')], deps)
    const sent = calls.map((c) => JSON.parse(String(c.init.body)) as SlackMessage)
    expect(sent[0].text).toBe('<@U0CBYB15WKE> a')
    expect(sent[0].blocks[1]).toEqual({ type: 'section', text: { type: 'mrkdwn', text: '<@U0CBYB15WKE>' } })
    expect(sent[1].text).toBe('b')
    vi.stubEnv('SLACK_MENTION', '')
    const again = setup()
    await sendSlack([msg('a')], again.deps)
    expect(JSON.parse(String(again.calls[0].init.body)).text).toBe('a')
  })
})
