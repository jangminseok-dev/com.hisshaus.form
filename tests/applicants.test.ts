import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyForm } from '../forms/apply'
import { loadApplicants, parseApplicants } from '../lib/applicants'
import { sheetHeader } from '../lib/sheet-row'

beforeEach(() => vi.stubEnv('GOOGLE_SHEET_ID', 'sheet123'))
afterEach(() => vi.unstubAllEnvs())

const header = sheetHeader(applyForm)
const col = (label: string) => header.indexOf(label)

function row(at: string, id: string, v: { name: string; phone: string; pet: string; breed: string }): string[] {
  const r = Array<string>(header.length).fill('')
  r[0] = at
  r[1] = id
  r[col('보호자 성함')] = v.name
  r[col('보호자 연락처')] = v.phone
  r[col('반려견 이름')] = v.pet
  r[col('반려견 견종')] = v.breed
  return r
}

const a = row('2026-11-01 10:00:00', 'AAAAAAAAAA', { name: '김하나', phone: '010-1111-2222', pet: '보리', breed: '푸들' })
const b = row('2026-11-02 10:00:00', 'BBBBBBBBBB', { name: '이둘', phone: '010-3333-4444', pet: '콩이', breed: '말티즈' })

describe('parseApplicants', () => {
  it('예약신청 줄에서 신청 ID·성함·연락처·반려견·견종을 헤더 위치로 꺼내 최신순으로 준다', () => {
    expect(parseApplicants([a, b])).toEqual([
      { applyId: 'BBBBBBBBBB', receivedAt: '2026-11-02 10:00:00', guardianName: '이둘', phone: '010-3333-4444', petName: '콩이', breed: '말티즈' },
      { applyId: 'AAAAAAAAAA', receivedAt: '2026-11-01 10:00:00', guardianName: '김하나', phone: '010-1111-2222', petName: '보리', breed: '푸들' },
    ])
  })

  it('머리글 줄과 빈 줄은 건너뛰고, 뒤쪽이 잘려 짧은 줄은 빈 칸으로 채운다', () => {
    const short = ['2026-11-03 10:00:00', 'CCCCCCCCCC']
    const out = parseApplicants([header, [], a, short])
    expect(out.map((x) => x.applyId)).toEqual(['CCCCCCCCCC', 'AAAAAAAAAA'])
    expect(out[0]).toMatchObject({ guardianName: '', phone: '' })
  })
})

describe('loadApplicants', () => {
  it('필요한 마지막 열까지만 읽는다', async () => {
    const urls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(decodeURIComponent(url))
      return new Response(JSON.stringify({ values: [a] }), { status: 200 })
    })
    const out = await loadApplicants({ fetch: fetchMock as unknown as typeof fetch, token: async () => 't' })
    expect(out).toHaveLength(1)
    const last = Math.max(col('보호자 성함'), col('보호자 연락처'), col('반려견 이름'), col('반려견 견종'))
    expect(urls[0]).toMatch(/'예약신청'!A:[A-Z]+$/)
    const letters = urls[0].split(':').pop()!
    const n = [...letters].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0)
    expect(n).toBe(last + 1)
  })
})
