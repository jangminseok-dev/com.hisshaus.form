import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelConsent, createConsent, validateCreate, type CreateInput } from '../lib/consent-admin'
import { CONSENT_HEADER, cancelRow, preparedRow, signedRow, type Prepared } from '../lib/consent-store'

beforeEach(() => {
  vi.stubEnv('SURVEY_LINK_SECRET', 'test-survey-link-secret-0123456789abcdef')
})
afterEach(() => vi.unstubAllEnvs())

const base: CreateInput = {
  applyId: '',
  bundle: 'generalGrooming',
  programName: '',
  goal: '',
  classTime: '',
  groomingParts: ['등', '배'],
  shown: null,
}

describe('validateCreate', () => {
  it('묶음을 모르면 묶음 오류', () => {
    expect(validateCreate({ ...base, bundle: 'x' })).toEqual({ bundle: '문서 묶음을 골라 주세요' })
  })

  it('묶음별 필수 칸이 비면 그 칸 이름으로 오류를 준다', () => {
    expect(validateCreate({ ...base, bundle: 'behavior' })).toEqual({
      programName: '적어 주세요',
      goal: '적어 주세요',
    })
    expect(validateCreate({ ...base, bundle: 'trust' })).toEqual({ classTime: '적어 주세요' })
    expect(validateCreate({ ...base, groomingParts: [] })).toEqual({ groomingParts: '미용할 부위를 하나 이상 골라 주세요' })
    expect(validateCreate({ ...base, bundle: 'groomingTraining' })).toEqual({})
  })

  it('부위는 정해진 값만, 글자 수는 칸마다 상한이 있다', () => {
    expect(validateCreate({ ...base, groomingParts: ['등', '이상한곳'] })).toEqual({
      groomingParts: '미용할 부위를 하나 이상 골라 주세요',
    })
    expect(validateCreate({ ...base, bundle: 'behavior', programName: 'ㄱ'.repeat(31), goal: 'ㄱ'.repeat(61) })).toEqual({
      programName: '30자 이내로 적어 주세요',
      goal: '60자 이내로 적어 주세요',
    })
    expect(validateCreate({ ...base, bundle: 'trust', classTime: 'ㄱ'.repeat(31) })).toEqual({
      classTime: '30자 이내로 적어 주세요',
    })
    const long = 'ㄱ'.repeat(51)
    expect(validateCreate({ ...base, shown: { guardianName: long, phone: '', petName: '', breed: '' } })).toEqual({
      guardianName: '50자 이내로 적어 주세요',
    })
  })

  it('묶음에 없는 칸의 값은 검사하지 않는다', () => {
    expect(validateCreate({ ...base, programName: 'ㄱ'.repeat(500) })).toEqual({})
  })
})

describe('createConsent', () => {
  const now = () => '2026-11-03 10:00:00'

  it('만들면 준비 줄 하나를 붙이고 그 ID 의 링크를 돌려준다', async () => {
    const appendRow = vi.fn(async () => {})
    const out = await createConsent(
      { ...base, applyId: 'AAAAAAAAAA', shown: { guardianName: '김하나', phone: '010', petName: '보리', breed: '푸들' } },
      { appendRow, now },
    )
    if ('errors' in out) throw new Error('오류가 나면 안 된다')
    expect(out.id).toMatch(/^[A-Za-z0-9]{10}$/)
    expect(out.url).toContain(`/consent/${out.id}-`)
    expect(appendRow).toHaveBeenCalledTimes(1)
    const [tab, row] = appendRow.mock.calls[0] as unknown as [string, string[]]
    expect(tab).toBe('동의서')
    expect(row).toHaveLength(CONSENT_HEADER.length)
    expect(row.slice(0, 5)).toEqual(['2026-11-03 10:00:00', '준비', out.id, 'AAAAAAAAAA', 'generalGrooming'])
    expect(row[8]).toBe('등, 배')
    expect(row[9]).toBe('김하나')
  })

  it('묶음에 없는 칸 값은 준비 줄에 남지 않는다', async () => {
    const appendRow = vi.fn(async () => {})
    await createConsent({ ...base, programName: '남으면 안 됨', goal: '안 됨', classTime: '안 됨' }, { appendRow, now })
    const row = (appendRow.mock.calls[0] as unknown as [string, string[]])[1]
    expect([row[5], row[6], row[7]]).toEqual(['', '', ''])
  })

  it('보호자 칸이 모두 비면 shown 은 null 이라 준비 줄의 보호자 칸이 빈다', async () => {
    const appendRow = vi.fn(async () => {})
    await createConsent({ ...base, shown: { guardianName: ' ', phone: '', petName: '', breed: '' } }, { appendRow, now })
    const row = (appendRow.mock.calls[0] as unknown as [string, string[]])[1]
    expect(row.slice(9, 13)).toEqual(['', '', '', ''])
  })

  it('검증에 걸리면 줄을 붙이지 않고 오류를 돌려준다', async () => {
    const appendRow = vi.fn(async () => {})
    const out = await createConsent({ ...base, groomingParts: [] }, { appendRow, now })
    expect(out).toEqual({ errors: { groomingParts: '미용할 부위를 하나 이상 골라 주세요' } })
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('링크를 만들 수 없으면(비밀값 없음) 줄을 붙이기 전에 던진다', async () => {
    vi.stubEnv('SURVEY_LINK_SECRET', '')
    const appendRow = vi.fn(async () => {})
    await expect(createConsent(base, { appendRow, now })).rejects.toThrow()
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('시트 실패는 던진다', async () => {
    const appendRow = vi.fn(async () => {
      throw new Error('sheets')
    })
    await expect(createConsent(base, { appendRow, now })).rejects.toThrow('sheets')
  })
})

describe('cancelConsent', () => {
  const now = () => '2026-11-03 12:00:00'
  const prepared: Prepared = {
    id: 'c1c1c1c1c1',
    applyId: '',
    bundle: 'generalGrooming',
    programName: '',
    goal: '',
    classTime: '',
    groomingParts: ['등'],
    shown: null,
    createdAt: '2026-11-03 10:00:00',
  }
  const rowsOf = (...rows: string[][]) => async () => rows

  it('서명 전이면 취소 줄을 붙이고 ok', async () => {
    const appendRow = vi.fn(async () => {})
    const out = await cancelConsent('c1c1c1c1c1', { appendRow, now, readRange: rowsOf(preparedRow(prepared)) })
    expect(out).toBe('ok')
    expect(appendRow).toHaveBeenCalledWith('동의서', cancelRow('c1c1c1c1c1', '2026-11-03 12:00:00'))
  })

  it('서명된 동의서는 취소되지 않는다', async () => {
    const appendRow = vi.fn(async () => {})
    const signed = signedRow(
      prepared,
      {
        signedAt: '2026-11-03 11:00:00',
        guardian: { guardianName: '김', phone: '1', petName: '보리', breed: '푸들', email: 'a@b.c' },
        changes: [],
        device: 'x',
        docHash: 'd',
        fileHash: 'f',
      },
      '',
    )
    const out = await cancelConsent('c1c1c1c1c1', { appendRow, now, readRange: rowsOf(preparedRow(prepared), signed) })
    expect(out).toBe('signed')
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('없는 ID 는 not-found, 이미 취소한 것은 ok 이지만 줄을 또 붙이지 않는다', async () => {
    const appendRow = vi.fn(async () => {})
    expect(await cancelConsent('zzzzzzzzzz', { appendRow, now, readRange: rowsOf(preparedRow(prepared)) })).toBe('not-found')
    expect(
      await cancelConsent('c1c1c1c1c1', {
        appendRow,
        now,
        readRange: rowsOf(preparedRow(prepared), cancelRow('c1c1c1c1c1', 'x')),
      }),
    ).toBe('ok')
    expect(appendRow).not.toHaveBeenCalled()
  })
})
