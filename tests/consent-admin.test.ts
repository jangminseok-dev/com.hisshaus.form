import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelConsent, createConsent, resendConsentMail, validateCreate, type CreateInput } from '../lib/consent-admin'
import { agreedSentences } from '../lib/consent-docs'
import { buildConsentPdf, type ConsentPdfInput } from '../lib/consent-pdf'
import {
  CONSENT_HEADER,
  cancelRow,
  mailRow,
  parseConsents,
  preparedRow,
  signedRow,
  type ConsentRecord,
  type Prepared,
  type Signed,
} from '../lib/consent-store'
import { consentMails } from '../lib/consent-submit'
import type { Mail } from '../lib/mail'
import { encodeSignature } from '../lib/signature'

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

describe('resendConsentMail — 메일 다시 보내기', () => {
  const ID = 'Rs3nd9Qw2E'
  const SIGNATURE = encodeSignature([
    [[40, 150], [90, 40], [150, 150]],
    [[200, 110], [300, 60], [420, 130], [560, 70]],
  ])
  const prepared: Prepared = {
    id: ID,
    applyId: 'Ab3dE5gH9k',
    bundle: 'behavior',
    programName: '짖음 줄이기',
    goal: '초인종 소리에 짖지 않기',
    classTime: '',
    groomingParts: [],
    shown: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티' },
    createdAt: '2026-11-03 10:00:00',
  }
  const signed: Omit<Signed, 'row'> = {
    signedAt: '2026-11-03 14:05:09',
    guardian: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈', email: 'hana@example.com' },
    changes: ['견종 말티 → 말티즈'],
    device: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    docHash: 'd'.repeat(64),
    fileHash: 'f'.repeat(64),
  }
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
  const now = () => '2026-11-04 09:00:00'

  /** 머리글 + 준비 + 서명(+ 메일) 줄. 목록 읽기는 사인 칸(T)을 빼고 A:S 만 돌려준다. 서명 줄은 시트의 3번째 줄이다. */
  function sheet(s: Omit<Signed, 'row'> = signed, mail: { archive: boolean; guardian: boolean } | null = { archive: false, guardian: true }) {
    const rows = [CONSENT_HEADER, preparedRow(prepared), signedRow(prepared, s, SIGNATURE)]
    if (mail) rows.push(mailRow(ID, '2026-11-03 14:05:12', mail))
    return {
      loadConsents: vi.fn(async () => parseConsents(rows.map((r) => r.slice(0, 19)))),
      loadSignature: vi.fn(async (row: number) => rows[row - 1][19]),
    }
  }

  beforeEach(() => {
    vi.stubEnv('MAIL_ADDRESS', 'archive@example.invalid')
  })

  it('메일 다시 보내기는 서명된 기록의 사인으로 PDF 를 다시 만들어 두 통을 보내고 메일 줄을 붙인다', async () => {
    const { loadConsents, loadSignature } = sheet()
    const buildPdf = vi.fn(async (_input: ConsentPdfInput) => ({ bytes: PDF, docHash: 'x', fileHash: 'y' }))
    const sendMail = vi.fn(async (_mail: Mail) => {})
    const appendRow = vi.fn(async () => {})

    const out = await resendConsentMail(ID, { loadConsents, loadSignature, buildPdf, sendMail, appendRow, now })

    expect(out).toEqual({ archive: true, guardian: true })
    expect(loadSignature).toHaveBeenCalledWith(3)
    // 서명 때와 같은 입력: 묶음·사장님 칸·신청 ID 는 기록에서, 보호자 값·서명 시각·기기·고친 값은 서명 줄에서, 사인은 T칸에서.
    expect(buildPdf).toHaveBeenCalledWith({
      bundle: 'behavior',
      consentId: ID,
      applyId: 'Ab3dE5gH9k',
      guardian: signed.guardian,
      owner: { programName: '짖음 줄이기', goal: '초인종 소리에 짖지 않기', classTime: '', groomingParts: [] },
      signature: SIGNATURE,
      signedAt: '2026-11-03 14:05:09',
      device: signed.device,
      agreed: agreedSentences('behavior'),
      changes: ['견종 말티 → 말티즈'],
    })
    // 제목·첨부 이름은 제출 때와 같다(consentMails).
    const [archive, copy] = consentMails({
      bundleLabel: '행동수정 트레이닝',
      guardianName: '김하나',
      petName: '보리',
      email: 'hana@example.com',
      signedAt: '2026-11-03 14:05:09',
      pdf: PDF,
    })
    expect(sendMail.mock.calls.map(([m]) => m)).toEqual([archive, copy])
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(appendRow).toHaveBeenCalledWith('동의서', mailRow(ID, '2026-11-04 09:00:00', { archive: true, guardian: true }))
  })

  it('서명 전 동의서는 not-signed 다', async () => {
    const buildPdf = vi.fn()
    const sendMail = vi.fn()
    const appendRow = vi.fn()
    const loadSignature = vi.fn()
    const records = (rec: Partial<ConsentRecord>) => async () =>
      new Map<string, ConsentRecord>([[ID, { prepared, cancelled: false, signed: null, mail: null, ...rec }]])
    for (const loadConsents of [records({}), records({ cancelled: true }), async () => new Map<string, ConsentRecord>()]) {
      expect(await resendConsentMail(ID, { loadConsents, loadSignature, buildPdf, sendMail, appendRow, now })).toBe('not-signed')
    }
    expect(loadSignature).not.toHaveBeenCalled()
    expect(buildPdf).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(appendRow).not.toHaveBeenCalled()
  })

  it('한 통이 실패해도 다른 통은 보내고, 실패마다 메일 전송 실패와 동의서 ID 만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const appendRow = vi.fn(async () => {})
    const sendMail = vi.fn(async (mail: Mail) => {
      if (mail.to === 'archive@example.invalid') throw new Error('smtp 비밀 주소')
    })
    const out = await resendConsentMail(ID, {
      ...sheet(),
      buildPdf: async () => ({ bytes: PDF, docHash: 'x', fileHash: 'y' }),
      sendMail,
      appendRow,
      now,
    })
    expect(out).toEqual({ archive: false, guardian: true })
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(log.mock.calls).toEqual([['메일 전송 실패', ID]])
    expect(appendRow).toHaveBeenCalledWith('동의서', mailRow(ID, '2026-11-04 09:00:00', { archive: false, guardian: true }))
    log.mockRestore()
  })

  it('메일 줄을 못 붙여도 결과를 돌려주고 로그를 남기지 않는다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await resendConsentMail(ID, {
      ...sheet(),
      buildPdf: async () => ({ bytes: PDF, docHash: 'x', fileHash: 'y' }),
      sendMail: async () => {},
      appendRow: async () => {
        throw new Error('sheets')
      },
      now,
    })
    expect(out).toEqual({ archive: true, guardian: true })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('기록·사인을 못 읽으면 sheets 오류를 그대로 던지고 아무것도 보내지 않는다', async () => {
    const sendMail = vi.fn()
    const fail = async () => {
      throw new Error('sheets')
    }
    await expect(resendConsentMail(ID, { ...sheet(), loadConsents: fail, sendMail, now })).rejects.toThrow('sheets')
    await expect(resendConsentMail(ID, { ...sheet(), loadSignature: fail, sendMail, now })).rejects.toThrow('sheets')
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('PDF 를 못 만들면 PDF 만들기 실패와 동의서 ID 만 남기고 던지며, 메일도 메일 줄도 없다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sendMail = vi.fn()
    const appendRow = vi.fn()
    const buildPdf = async () => {
      throw new Error('ENOENT /var/task/content/consent-agreement.pdf')
    }
    const err = await resendConsentMail(ID, { ...sheet(), buildPdf, sendMail, appendRow, now }).catch((e: Error) => e)
    expect(err).toEqual(new Error('pdf'))
    expect(log.mock.calls).toEqual([['PDF 만들기 실패', ID]])
    expect(sendMail).not.toHaveBeenCalled()
    expect(appendRow).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('다시 만든 PDF 는 서명 때 시트에 남긴 서명 내용 고유값·PDF 고유값과 같다', async () => {
    // 서명 때와 똑같이 PDF 를 만들고 그 고유값을 서명 줄에 적는다(lib/consent-submit.ts 와 같은 입력).
    const original = await buildConsentPdf({
      bundle: prepared.bundle,
      consentId: ID,
      applyId: prepared.applyId,
      guardian: signed.guardian,
      owner: { programName: prepared.programName, goal: prepared.goal, classTime: prepared.classTime, groomingParts: prepared.groomingParts },
      signature: SIGNATURE,
      signedAt: signed.signedAt,
      device: signed.device,
      agreed: agreedSentences(prepared.bundle),
      changes: signed.changes,
    })
    const fakeSheet = sheet({ ...signed, docHash: original.docHash, fileHash: original.fileHash })
    const record = (await fakeSheet.loadConsents()).get(ID)!
    let rebuilt: Awaited<ReturnType<typeof buildConsentPdf>> | undefined
    const sendMail = vi.fn(async (_mail: Mail) => {})
    await resendConsentMail(ID, {
      ...fakeSheet,
      buildPdf: async (input) => (rebuilt = await buildConsentPdf(input)),
      sendMail,
      appendRow: async () => {},
      now,
    })
    expect(rebuilt!.docHash).toBe(record.signed!.docHash)
    expect(rebuilt!.fileHash).toBe(record.signed!.fileHash)
    expect(Buffer.from(sendMail.mock.calls[0][0].attachment!.content).equals(Buffer.from(original.bytes))).toBe(true)
  })
})
