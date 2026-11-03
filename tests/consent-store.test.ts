import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONSENT_HEADER,
  cancelRow,
  loadConsents,
  loadSignature,
  mailRow,
  parseConsents,
  preparedRow,
  signedRow,
  type Prepared,
} from '../lib/consent-store'

beforeEach(() => vi.stubEnv('GOOGLE_SHEET_ID', 'sheet123'))
afterEach(() => vi.unstubAllEnvs())

const prepared: Prepared = {
  id: 'c1',
  applyId: 'A1',
  bundle: 'generalGrooming',
  programName: '',
  goal: '',
  classTime: '',
  groomingParts: ['얼굴', '발'],
  shown: { guardianName: '홍길동', phone: '010-1234-5678', petName: '보리', breed: '푸들' },
  createdAt: '2026-11-03 10:00:00',
}
const signedPart = {
  signedAt: '2026-11-03 11:00:00',
  guardian: { guardianName: '홍길동', phone: '010-1234-5678', petName: '보리', breed: '푸들', email: 'a@b.c' },
  changes: ['연락처: 010-0000-0000 → 010-1234-5678', '견종: 말티즈 → 푸들'],
  device: 'iPhone',
  docHash: 'd'.repeat(64),
  fileHash: 'f'.repeat(64),
}

describe('동의서 시트 줄', () => {
  it('네 종류의 줄은 모두 머리글 길이이고 사인은 맨 끝 열이다', () => {
    expect(CONSENT_HEADER).toHaveLength(20)
    expect(CONSENT_HEADER[17]).toBe('서명 내용 고유값')
    expect(CONSENT_HEADER[19]).toBe('사인')
    const rows = [preparedRow(prepared), cancelRow('c1', 'x'), signedRow(prepared, signedPart, 'SIG'), mailRow('c1', 'x', { archive: true, guardian: false })]
    for (const r of rows) expect(r).toHaveLength(CONSENT_HEADER.length)
    expect(rows[2][19]).toBe('SIG')
    expect(rows[2][0]).toBe('2026-11-03 11:00:00')
    expect(rows[3][16]).toBe('보관 보냄 · 사본 실패')
    expect(rows.map((r) => r[1])).toEqual(['준비', '취소', '서명', '메일'])
  })

  it('서명 줄은 준비 기록의 신청 ID·묶음·프로그램·미용 부위를 다시 적는다', () => {
    const r = signedRow(prepared, signedPart, 'SIG')
    expect(r.slice(2, 9)).toEqual(['c1', 'A1', 'generalGrooming', '', '', '', '얼굴, 발'])
    expect(r[14]).toBe('연락처: 010-0000-0000 → 010-1234-5678\n견종: 말티즈 → 푸들')
  })
})

describe('동의서 읽기', () => {
  const header = [...CONSENT_HEADER]

  it('준비 → 서명 → 메일 줄을 읽으면 서명·메일이 붙은 한 기록이고, 준비 → 취소면 cancelled 다', () => {
    const p2 = { ...prepared, id: 'c2' }
    const rows = [
      header,
      preparedRow(prepared),
      preparedRow(p2),
      signedRow(prepared, signedPart, 'SIG'),
      mailRow('c1', 't1', { archive: false, guardian: true }),
      mailRow('c1', 't2', { archive: true, guardian: true }),
      cancelRow('c2', 't3'),
    ]
    const m = parseConsents(rows)
    expect([...m.keys()]).toEqual(['c1', 'c2'])
    const c1 = m.get('c1')!
    expect(c1.prepared).toEqual(prepared)
    expect(c1.cancelled).toBe(false)
    expect(c1.signed).toEqual({ ...signedPart, row: 4 })
    expect(c1.mail).toEqual({ archive: true, guardian: true })
    expect(m.get('c2')!.cancelled).toBe(true)
    expect(m.get('c2')!.signed).toBeNull()
    expect(m.get('c2')!.mail).toBeNull()
  })

  it('머리글 줄과 모르는 종류의 줄, 준비 줄이 없는 ID 의 줄은 건너뛴다', () => {
    const odd = Array(20).fill('')
    odd[1] = '이상한'
    odd[2] = 'c1'
    const m = parseConsents([header, odd, cancelRow('zz', 't'), signedRow(prepared, signedPart, 'S'), preparedRow(prepared)])
    expect([...m.keys()]).toEqual(['c1'])
    expect(m.get('c1')!.signed).toBeNull()
  })

  it('보호자 네 칸이 모두 비면 shown 은 null 이고, 짧은 줄은 빈 칸으로 채운다', () => {
    const row = preparedRow({ ...prepared, shown: null, groomingParts: [] })
    expect(parseConsents([row.slice(0, 9)]).get('c1')!.prepared.shown).toBeNull()
    expect(parseConsents([row]).get('c1')!.prepared.groomingParts).toEqual([])
  })

  it('서명 기록의 row 는 시트 줄 번호다', () => {
    const rows = [header, preparedRow(prepared), signedRow(prepared, signedPart, 'S')]
    expect(parseConsents(rows).get('c1')!.signed!.row).toBe(3)
  })

  it('loadConsents 는 A:S 를, loadSignature 는 T<줄> 을 읽는다', async () => {
    const urls: string[] = []
    const fetch = (async (u: string) => {
      urls.push(decodeURIComponent(String(u)))
      return new Response(JSON.stringify({ values: urls.length === 1 ? [header, preparedRow(prepared)] : [['SIGDATA']] }))
    }) as unknown as typeof globalThis.fetch
    const deps = { fetch, token: async () => 't' }
    const m = await loadConsents(deps)
    expect(m.size).toBe(1)
    expect(await loadSignature(7, deps)).toBe('SIGDATA')
    expect(urls[0]).toMatch(/'동의서'!A:S$/)
    expect(urls[1]).toMatch(/'동의서'!T7$/)
  })
})
