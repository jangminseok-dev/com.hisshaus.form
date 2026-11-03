import { applyForm } from '../forms/apply'
import { allQuestions, visibleGroups } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef } from '../forms/types'
import { answerText } from './format'
import type { Meta } from './sheet-row'
import { wishText } from './wish'

export type Block =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'context'; elements: { type: 'mrkdwn'; text: string }[] }
  | { type: 'divider' }

/** text 는 알림 미리보기용 한 줄 */
export interface SlackMessage {
  text: string
  blocks: Block[]
}

export const SECTION_LIMIT = 3000
export const BLOCKS_LIMIT = 50
export const MESSAGE_BYTES_LIMIT = 30_000
const HEADER_LIMIT = 150
/** 모든 통에 붙일 수 있는 가장 긴 꼬리. 짓는 동안 이 길이로 재서 나중에 줄어들기만 하게 한다. */
const WORST_SUFFIX = ' (99/99)'

/** Slack mrkdwn 에서 & < > 만 이스케이프한다. */
export function escapeMrkdwn(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const section = (text: string): Block => ({ type: 'section', text: { type: 'mrkdwn', text } })

function headerBlock(base: string, suffix: string): Block {
  const room = HEADER_LIMIT - suffix.length
  const text = Array.from(base).slice(0, room).join('') + suffix
  return { type: 'header', text: { type: 'plain_text', text } }
}

function messageBytes(m: SlackMessage): number {
  return Buffer.byteLength(JSON.stringify(m))
}

/** 한 문항 줄을 3,000자 이하의 조각들로. 한 줄이 넘치면 답을 글자 단위로 잘라 잇는다. */
function lineText(label: string, answer: string): string {
  return `*${escapeMrkdwn(label)}*\n${answer === '' ? '—' : escapeMrkdwn(answer)}`
}

/** 섹션 텍스트들로 묶는다. 줄 사이는 빈 줄, 3,000자에 닿으면 새 섹션. */
function packLines(lines: { label: string; answer: string }[]): string[] {
  const out: string[] = []
  let cur = ''
  for (const { label, answer } of lines) {
    const line = lineText(label, answer)
    const joined = cur === '' ? line : `${cur}\n\n${line}`
    if (joined.length <= SECTION_LIMIT) {
      cur = joined
      continue
    }
    if (cur !== '') out.push(cur)
    if (line.length <= SECTION_LIMIT) {
      cur = line
      continue
    }
    // 한 줄이 혼자 넘친다: 첫 조각만 라벨, 나머지는 답만 이어 담는다.
    cur = ''
    let piece = `*${escapeMrkdwn(label)}*\n`
    for (const ch of Array.from(answer)) {
      const esc = escapeMrkdwn(ch)
      if (piece.length + esc.length > SECTION_LIMIT) {
        out.push(piece)
        piece = ''
      }
      piece += esc
    }
    cur = piece
  }
  if (cur !== '') out.push(cur)
  return out
}

function buildMessages(
  form: FormDef,
  a: Answers,
  meta: Meta,
  headerText: string,
  notice: string,
  firstSection?: string,
  /** 마지막 통의 신청 ID 줄 바로 앞에 붙는 단락(mrkdwn 그대로 싣는다). */
  lastSection?: string,
): SlackMessage[] {
  const contextBlock: Block = {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: escapeMrkdwn(`신청 ID ${meta.submissionId} · ${meta.receivedAt}`) }],
  }
  const messages: SlackMessage[] = []
  const start = (): SlackMessage => {
    const m: SlackMessage = { text: notice, blocks: [headerBlock(headerText, WORST_SUFFIX)] }
    messages.push(m)
    return m
  }
  let cur = start()
  const add = (b: Block) => {
    const fits =
      cur.blocks.length + 1 <= BLOCKS_LIMIT &&
      messageBytes({ text: cur.text, blocks: [...cur.blocks, b] }) <= MESSAGE_BYTES_LIMIT
    if (!fits && cur.blocks.length > 1) cur = start()
    cur.blocks.push(b)
  }

  if (firstSection) add(section(escapeMrkdwn(firstSection)))
  // 숨은 묶음(고르지 않은 서비스)은 싣지 않는다.
  for (const g of visibleGroups(form, a)) {
    add({ type: 'divider' })
    add(section(`*${escapeMrkdwn(g.title)}*`))
    const lines = g.questions.map((q) => ({ label: q.label, answer: answerText(q, a) }))
    for (const text of packLines(lines)) add(section(text))
  }
  if (lastSection) add(section(lastSection))
  add(contextBlock)

  const n = messages.length
  messages.forEach((m, i) => {
    m.blocks[0] = headerBlock(headerText, n > 1 ? ` (${i + 1}/${n})` : '')
  })
  return messages
}

const val = (a: Answers, id: string): string => {
  const v = a[id]
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}

/** surveyLink 는 교육미용 신청일 때만 온다. 사장님이 입금을 확인한 뒤 보호자에게 보낼 검사지 링크다. */
export function applyMessages(a: Answers, meta: Meta, surveyLink?: string): SlackMessage[] {
  const pet = val(a, 'pet_name')
  const guardian = val(a, 'guardian_name')
  const services = answerText(allQuestions(applyForm).find((q) => q.id === 'services')!, a)
  const notice = escapeMrkdwn(`새 예약 신청: ${pet} (${guardian}) · ${services} · ${wishText(a)}`)
  const link = surveyLink && `📋 *검사지 링크* — 입금 확인 뒤 보내 주세요\n${escapeMrkdwn(surveyLink)}`
  return buildMessages(applyForm, a, meta, `🐾 새 예약 신청 — ${pet} (${guardian})`, notice, undefined, link)
}

/** 검사지는 링크의 신청 ID 로 쌓이므로 meta.submissionId 가 곧 예약 신청 ID 다. */
export function surveyMessages(a: Answers, meta: Meta): SlackMessage[] {
  const pet = val(a, 'q7')
  const guardian = val(a, 'q3')
  const notice = escapeMrkdwn(`행동 분석 검사지: ${pet} (${guardian})`)
  const link = `예약 신청 ${meta.submissionId}의 검사지예요`
  return buildMessages(surveyForm, a, meta, `📋 행동 분석 검사지 — ${pet} (${guardian})`, notice, link)
}

const sentText = (ok: boolean) => (ok ? '보냄' : '실패')

/**
 * 동의서 서명 알림 한 통. 머리글(성함·반려견·묶음), 보호자가 고친 값(있을 때만, 한 줄에 하나), 메일 결과, 동의서·신청 ID.
 * 칸이 짧아서(보호자 칸 50자, 고친 값 넷까지) 한 통·섹션 하나에 들어간다. 알림 미리보기는 머리글과 같다.
 */
export function consentMessages(r: {
  bundleLabel: string
  guardianName: string
  petName: string
  changes: string[]
  mail: { archive: boolean; guardian: boolean }
  consentId: string
  applyId: string
}): SlackMessage[] {
  const title = `동의서 서명: ${r.guardianName} · ${r.petName} · ${r.bundleLabel}`
  const blocks: Block[] = [headerBlock(title, '')]
  if (r.changes.length > 0) blocks.push(section(lineText('보호자가 고친 값', r.changes.join('\n'))))
  blocks.push(section(lineText('메일', `보관용 ${sentText(r.mail.archive)} · 보호자 사본 ${sentText(r.mail.guardian)}`)))
  const apply = r.applyId ? `신청 ID ${r.applyId}` : '신청서 없이 만듦'
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: escapeMrkdwn(`동의서 ID ${r.consentId} · ${apply}`) }] })
  return [{ text: escapeMrkdwn(title), blocks }]
}
