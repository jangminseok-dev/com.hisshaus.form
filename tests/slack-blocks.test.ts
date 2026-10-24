import { describe, expect, it } from 'vitest'
import { applyForm, DAYCARE_SERVICE, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { allQuestions, visibleGroups } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import {
  BLOCKS_LIMIT,
  MESSAGE_BYTES_LIMIT,
  SECTION_LIMIT,
  applyMessages,
  cancelTrainingMessage,
  escapeMrkdwn,
  surveyMessages,
  type Block,
  type SlackMessage,
} from '../lib/slack-blocks'

const meta = { submissionId: 'abcDEF1234', receivedAt: '2026-10-23 10:00:00' }
// 2026-10-28 은 수요일(10:00~15:30), 2026-11-03 은 화요일, 2026-11-05 는 목요일이다.
const base = { guardian_name: '홍길동', pet_name: '초코', services: [GROOMING_SERVICE], groom_date: '2026-10-28', groom_time: '10:00' }
const hotel = { hotel_checkin_date: '2026-11-03', hotel_checkin_time: '15:00', hotel_checkout_date: '2026-11-05', hotel_checkout_time: '11:00' }

const sections = (ms: SlackMessage[]) =>
  ms.flatMap((m) => m.blocks).flatMap((b: Block) => (b.type === 'section' ? [b.text.text] : []))
const allText = (ms: SlackMessage[]) => sections(ms).join('\n')
const longSurvey = () =>
  Object.fromEntries(allQuestions(surveyForm).map((q) => [q.id, q.id === 'q3' ? '홍길동' : q.id === 'q7' ? '초코' : 'ㄱ'.repeat(2000)]))

describe('슬랙 메시지', () => {
  it('신청서는 메시지 한 통이고 머리글에 반려견·보호자 이름이 있다', () => {
    const ms = applyMessages(base, meta)
    expect(ms).toHaveLength(1)
    expect(ms[0].blocks[0]).toEqual({ type: 'header', text: { type: 'plain_text', text: '🐾 새 예약 신청 — 초코 (홍길동)' } })
    expect(ms[0].text).toBe('새 예약 신청: 초코 (홍길동) · Grooming 미용 · 10월 28일 (수) 오전 10:00')
  })

  it('보이는 묶음의 모든 문항 라벨이 본문에 있다', () => {
    const t = allText(applyMessages(base, meta))
    for (const g of visibleGroups(applyForm, base)) for (const q of g.questions) expect(t).toContain(`*${q.label}*`)
    expect(t).toContain('—')
  })

  it('고르지 않은 서비스 묶음은 본문에 없고 고른 묶음은 있다', () => {
    const title = (id: string) => `*${applyForm.groups.find((g) => g.id === id)!.title}*`
    const label = (id: string) => `*${allQuestions(applyForm).find((q) => q.id === id)!.label}*`

    const one = allText(applyMessages(base, meta))
    expect(one).toContain(title('grooming'))
    expect(one).toContain(title('deposit'))
    for (const id of ['daycare', 'hotel', 'training']) expect(one).not.toContain(title(id))
    expect(one).not.toContain(label('hotel_checkin_date'))
    // 시간은 본문에 한국어 꼴로 실린다.
    expect(one).toContain(`${label('groom_time')}\n오전 10:00`)

    const two = { ...base, services: [GROOMING_SERVICE, HOTEL_SERVICE], ...hotel }
    const t = allText(applyMessages(two, meta))
    expect(t).toContain(title('grooming'))
    expect(t).toContain(title('hotel'))
    expect(t).toContain(`${label('hotel_checkin_date')}\n11월 3일 (화)`)
    expect(t).toContain(`${label('hotel_checkin_time')}\n오후 3:00`)
    expect(t).toContain(`${label('hotel_checkout_time')}\n오전 11:00`)
    for (const id of ['daycare', 'training']) expect(t).not.toContain(title(id))
    expect(t).not.toContain(label('daycare_date'))
    // 묶음 순서는 정의 순서다.
    expect(t.indexOf(title('grooming'))).toBeLessThan(t.indexOf(title('hotel')))
    expect(t.indexOf(title('hotel'))).toBeLessThan(t.indexOf(title('deposit')))
  })

  it('알림 미리보기에 고른 서비스의 희망 일시(wishText)가 들어간다', () => {
    const two = { ...base, services: [GROOMING_SERVICE, HOTEL_SERVICE], ...hotel }
    expect(applyMessages(two, meta)[0].text).toBe(
      '새 예약 신청: 초코 (홍길동) · Grooming 미용, Hotel 호텔 · 미용 10월 28일 (수) 오전 10:00, 호텔 11월 3일 (화) 오후 3:00 체크인',
    )
    const training = { ...base, services: [DAYCARE_SERVICE, TRAINING_SERVICE], daycare_date: '2026-10-29', training_date: '2026-10-30' }
    expect(applyMessages(training, meta)[0].text).toBe(
      `새 예약 신청: 초코 (홍길동) · ${DAYCARE_SERVICE}, ${TRAINING_SERVICE} · 데이케어 10월 29일 (목), 교육미용 10월 30일 (금)`,
    )
  })

  it('특수문자를 이스케이프한다', () => {
    expect(escapeMrkdwn('<b>&')).toBe('&lt;b&gt;&amp;')
    const ms = applyMessages({ ...base, pet_name: '<b>&' }, meta)
    expect(allText(ms)).toContain('&lt;b&gt;&amp;')
    expect(allText(ms)).not.toContain('<b>')
    expect(ms[0].text).toContain('&lt;b&gt;&amp;')
  })

  it('3,000자 긴 답은 잘리지 않고 다음 섹션으로 넘어간다', () => {
    const long = '가'.repeat(2995)
    const ms = applyMessages({ ...base, guardian_name: long }, meta)
    const secs = sections(ms).filter((s) => s.includes('가'))
    expect(secs.length).toBeGreaterThanOrEqual(2)
    const joined = secs.map((s) => s.replace('*보호자 성함*\n', '')).join('')
    expect(joined).toContain(long)
    for (const s of sections(ms)) expect(s.length).toBeLessThanOrEqual(SECTION_LIMIT)
  })

  it('한 줄이 혼자 3,000자를 넘어도 글자 하나 잃지 않고 이스케이프도 안 끊긴다', () => {
    const long = '&'.repeat(7000)
    const ms = applyMessages({ ...base, guardian_name: long }, meta)
    const joined = sections(ms).join('')
    expect(joined.split('&amp;').length - 1).toBe(7000)
    expect(joined.replace(/&amp;/g, '').includes('&')).toBe(false)
  })

  it('검사지는 블록 50개를 넘기면 다음 통으로 가고 머리글에 (k/N) 이 붙는다', () => {
    const ms = surveyMessages(longSurvey(), meta)
    expect(ms.length).toBeGreaterThan(1)
    ms.forEach((m, i) => {
      const h = m.blocks[0]
      expect(h.type === 'header' && h.text.text).toBe(`📋 행동 분석 검사지 — 초코 (홍길동) (${i + 1}/${ms.length})`)
    })
  })

  it('어느 섹션도 3,000자를 넘지 않고 어느 메시지도 블록 50개·30,000바이트를 넘지 않는다', () => {
    const ms = surveyMessages(longSurvey(), meta)
    const total = allQuestions(surveyForm).length * 2000
    expect(total).toBeGreaterThan(MESSAGE_BYTES_LIMIT) // 입력이 실제로 한도를 넘는다
    for (const s of sections(ms)) expect(s.length).toBeLessThanOrEqual(SECTION_LIMIT)
    for (const m of ms) {
      expect(m.blocks.length).toBeLessThanOrEqual(BLOCKS_LIMIT)
      expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThanOrEqual(MESSAGE_BYTES_LIMIT)
    }
    // 한글 3바이트라 블록보다 바이트가 먼저 닿는 경우도 포함
    const wide = surveyMessages(Object.fromEntries(allQuestions(surveyForm).map((q) => [q.id, '가'.repeat(2900)])), meta)
    for (const m of wide) expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThanOrEqual(MESSAGE_BYTES_LIMIT)
  })

  it('마지막 통에 신청 ID 와 시각이 있다', () => {
    const ms = surveyMessages(longSurvey(), meta)
    const last = ms[ms.length - 1].blocks.at(-1)
    expect(last).toEqual({ type: 'context', elements: [{ type: 'mrkdwn', text: '신청 ID abcDEF1234 · 2026-10-23 10:00:00' }] })
    expect(JSON.stringify(ms[0].blocks)).not.toContain('신청 ID abcDEF1234')
  })

  it('applyId 가 있으면 첫 통에 적는다', () => {
    const ms = surveyMessages({ q3: '홍길동', q7: '초코' }, { ...meta, applyId: 'ZZzz112233' })
    expect(JSON.stringify(ms[0].blocks)).toContain('예약 신청 ZZzz112233의 검사지예요')
    expect(JSON.stringify(surveyMessages({ q3: 'a', q7: 'b' }, meta))).not.toContain('검사지예요')
  })

  it('취소 메시지 문구', () => {
    const m = cancelTrainingMessage({ petName: '초코', guardianName: '홍길동', submissionId: 'abcDEF1234' })
    expect(m.text).toBe('↩️ 초코 (홍길동) 보호자가 교육미용 선택을 취소했어요 (신청 abcDEF1234)')
    expect(m.blocks).toEqual([{ type: 'section', text: { type: 'mrkdwn', text: m.text } }])
  })
})
