import { createHash } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { BUNDLES, LAYOUT, type BundleId, type PageId } from '../lib/consent-docs'
import {
  buildConsentPdf,
  embedKoreanFont,
  fieldValues,
  fitText,
  recordRows,
  type ConsentPdfInput,
} from '../lib/consent-pdf'
import { encodeSignature } from '../lib/signature'

const SIGNATURE = encodeSignature([
  [[40, 150], [90, 40], [150, 150]],
  [[200, 110], [300, 60], [420, 130], [560, 70]],
])

function input(bundle: BundleId, over: Partial<ConsentPdfInput> = {}): ConsentPdfInput {
  return {
    bundle,
    consentId: 'CnSt12345678',
    applyId: 'Ab3dE5gH9k',
    guardian: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈', email: 'hana@example.com' },
    owner: { programName: '짖음 줄이기', goal: '초인종 소리에 짖지 않기', classTime: '토요일 오전 10시', groomingParts: ['등', '발톱깎기', '귀청소'] },
    signature: SIGNATURE,
    signedAt: '2026-11-03 14:05:09',
    device: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    agreed: ['교육을 하지 않은 상태의 반려견의 미용 동의서 — 읽고 동의해요', '전자 방식으로 서명하는 데 동의해요'],
    changes: [],
    ...over,
  }
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const boxOf = (page: PageId, key: string) => LAYOUT[page].find((b) => b.key === key)!

describe('동의서 PDF', () => {
  it('묶음마다 고른 장 수 + 기록 페이지 한 장이다', async () => {
    for (const bundle of BUNDLES) {
      const { bytes } = await buildConsentPdf(input(bundle.id))
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount(), bundle.id).toBe(bundle.pages.length + 1)
    }
    const behavior = await PDFDocument.load((await buildConsentPdf(input('behavior'))).bytes)
    expect(behavior.getPageCount()).toBe(4)
    const general = await PDFDocument.load((await buildConsentPdf(input('generalGrooming'))).bytes)
    expect(general.getPageCount()).toBe(2)
  })

  it('fileHash 는 bytes 의 sha256 이고 docHash 와 다르다', async () => {
    const { bytes, docHash, fileHash } = await buildConsentPdf(input('generalGrooming'))
    expect(fileHash).toBe(sha256(bytes))
    expect(docHash).toMatch(/^[0-9a-f]{64}$/)
    expect(docHash).not.toBe(fileHash)
  })

  it('같은 값으로 다시 만들면 고유값 둘이 그대로다(메일 다시 보내기)', async () => {
    const a = await buildConsentPdf(input('behavior'))
    const b = await buildConsentPdf(input('behavior'))
    expect(b.docHash).toBe(a.docHash)
    expect(b.fileHash).toBe(a.fileHash)
  })

  it('일반 미용 묶음은 300KB 안팎(350KB 이하), 행동수정 묶음은 1MB 이하다', async () => {
    const general = await buildConsentPdf(input('generalGrooming'))
    expect(general.bytes.length).toBeLessThanOrEqual(350 * 1024)
    const behavior = await buildConsentPdf(input('behavior'))
    expect(behavior.bytes.length).toBeLessThanOrEqual(1024 * 1024)
  })

  it('수업 목표 200자·견종 40자여도 던지지 않는다', async () => {
    const owner = { programName: '가'.repeat(100), goal: '목표'.repeat(100), classTime: '시간'.repeat(100), groomingParts: [] }
    const guardian = { ...input('behavior').guardian, breed: '견종'.repeat(20) }
    await expect(buildConsentPdf(input('behavior', { owner, guardian }))).resolves.toBeTruthy()
    await expect(buildConsentPdf(input('trust', { owner, guardian }))).resolves.toBeTruthy()
  })

  it('사인이 깨졌거나 묶음을 모르면 던진다', async () => {
    await expect(buildConsentPdf(input('generalGrooming', { signature: '1,2 abc' }))).rejects.toThrow()
    await expect(buildConsentPdf(input('generalGrooming', { signature: '' }))).rejects.toThrow()
    await expect(buildConsentPdf(input('nope' as BundleId))).rejects.toThrow()
  })

  it('서명 시각 꼴이 틀리면 던진다', async () => {
    await expect(buildConsentPdf(input('generalGrooming', { signedAt: '2026-11-03T14:05:09' }))).rejects.toThrow()
  })

  it('PDF 만든 날짜는 서명 시각이다', async () => {
    // load 는 기본으로 날짜를 지금으로 바꾸므로 끈다
    const doc = await PDFDocument.load((await buildConsentPdf(input('generalGrooming'))).bytes, { updateMetadata: false })
    // 2026-11-03 14:05:09 한국 시각 = 05:05:09 UTC
    expect(doc.getCreationDate()?.toISOString()).toBe('2026-11-03T05:05:09.000Z')
    expect(doc.getModificationDate()?.toISOString()).toBe('2026-11-03T05:05:09.000Z')
  })
})

describe('칸에 들어가는 값', () => {
  it('연락처는 가운데·끝 네 자리, 작성일은 연도 뒤 두 자리와 앞 0 없는 월·일, 담당자는 히스하우스다', () => {
    const v = fieldValues(input('behavior', { signedAt: '2026-03-07 09:00:00' }))
    expect(v.phoneMid).toBe('1234')
    expect(v.phoneLast).toBe('5678')
    expect(v.yearSuffix).toBe('26')
    expect(v.month).toBe('3')
    expect(v.day).toBe('7')
    expect(v.manager).toBe('히스하우스')
    expect(v.guardianName).toBe('김하나')
    expect(v.signerName).toBe('김하나')
    expect(v.petName).toBe('보리')
    expect(v.breed).toBe('말티즈')
    expect(v.programName).toBe('짖음 줄이기')
    expect(v.goal).toBe('초인종 소리에 짖지 않기')
    expect(v.classTime).toBe('토요일 오전 10시')
  })

  it('하이픈 없는 연락처도 가운데·끝으로 나눈다', () => {
    const v = fieldValues(input('behavior', { guardian: { ...input('behavior').guardian, phone: '01098765432' } }))
    expect([v.phoneMid, v.phoneLast]).toEqual(['9876', '5432'])
  })
})

describe('긴 글 맞추기', () => {
  async function font() {
    return embedKoreanFont(await PDFDocument.create(), 'TESTAA')
  }

  it('사장님 칸 상한 길이(프로그램 명 30자·수업 목표 60자·수업 시간 30자)는 자르지 않고 7pt 이상이다', async () => {
    const f = await font()
    const cases: [PageId, string, number][] = [
      ['behavior', 'programName', 30],
      ['behavior', 'goal', 60],
      ['trust', 'classTime', 30],
    ]
    for (const [page, key, n] of cases) {
      const text = '한글로가득채운칸'.repeat(10).slice(0, n)
      expect(text).toHaveLength(n)
      const fit = fitText(text, boxOf(page, key), f)
      expect(fit.truncated, key).toBe(false)
      expect(fit.size, key).toBeGreaterThanOrEqual(7)
      expect(fit.lines.join(''), key).toBe(text)
    }
  })

  it('칸에 들어가면 기본 크기 그대로 한 줄이다', async () => {
    const fit = fitText('김하나', boxOf('behavior', 'guardianName'), await font())
    expect(fit).toEqual({ lines: ['김하나'], size: 9, truncated: false })
  })

  it('7pt 로도 넘치면 마지막 줄 끝을 … 로 줄인다', async () => {
    const f = await font()
    const box = boxOf('behavior', 'goal')
    const fit = fitText('목표'.repeat(100), box, f)
    expect(fit.truncated).toBe(true)
    expect(fit.size).toBe(7)
    expect(fit.lines).toHaveLength(1)
    expect(fit.lines[0].endsWith('…')).toBe(true)
    expect(f.widthOfTextAtSize(fit.lines[0], 7)).toBeLessThanOrEqual(box.w)
  })

  it('여러 줄 칸은 띄어쓰기에서 줄을 바꾼다', async () => {
    const f = await font()
    const box = { w: 60, h: 40, size: 9 }
    const fit = fitText('월요일 오전 열시 수요일 오후 두시', box, f)
    expect(fit.truncated).toBe(false)
    expect(fit.lines.length).toBeGreaterThan(1)
    for (const line of fit.lines) expect(f.widthOfTextAtSize(line, fit.size)).toBeLessThanOrEqual(box.w)
    expect(fit.lines.join(' ')).toBe('월요일 오전 열시 수요일 오후 두시')
  })
})

describe('서명 기록 페이지', () => {
  const HASH = 'a'.repeat(64)
  const valueOf = (rows: { label: string; values: string[] }[], label: string) => rows.find((r) => r.label === label)?.values

  it('묶음·장·보호자·반려견·시각·기기·ID·동의 문구를 적는다', () => {
    const rows = recordRows(input('behavior'), HASH)
    expect(valueOf(rows, '묶음')).toEqual(['행동수정 트레이닝'])
    expect(valueOf(rows, '들어간 장')).toEqual([
      '1. 반려견 교육 서약서',
      '2. 히스하우스 행동수정 프로그램 계약서',
      '3. 교육미용 안내사항',
    ])
    expect(valueOf(rows, '보호자 성함')).toEqual(['김하나'])
    expect(valueOf(rows, '연락처')).toEqual(['010-1234-5678'])
    expect(valueOf(rows, '이메일')).toEqual(['hana@example.com'])
    expect(valueOf(rows, '반려견 이름')).toEqual(['보리'])
    expect(valueOf(rows, '서명 시각')).toEqual(['2026-11-03 14:05:09 (한국 시각)'])
    expect(valueOf(rows, '서명 기기')).toEqual([input('behavior').device])
    expect(valueOf(rows, '동의서 ID')).toEqual(['CnSt12345678'])
    expect(valueOf(rows, '신청 ID')).toEqual(['Ab3dE5gH9k'])
    expect(valueOf(rows, '동의한 내용')).toEqual(input('behavior').agreed)
  })

  it('고친 값이 없으면 없음, 신청서가 없으면 신청 ID 도 없음이다', () => {
    const rows = recordRows(input('generalGrooming', { applyId: '', changes: [], agreed: [] }), HASH)
    expect(valueOf(rows, '보호자가 고친 값')).toEqual(['없음'])
    expect(valueOf(rows, '신청 ID')).toEqual(['없음'])
    expect(valueOf(rows, '동의한 내용')).toEqual(['없음'])
    const changed = recordRows(input('generalGrooming', { changes: ['견종 말티 → 말티즈'] }), HASH)
    expect(valueOf(changed, '보호자가 고친 값')).toEqual(['견종 말티 → 말티즈'])
  })

  it('마지막 줄은 앞 장들의 고유값이다', () => {
    const rows = recordRows(input('generalGrooming'), HASH)
    expect(rows.at(-1)).toEqual({ label: '', values: [`문서 고유값(SHA-256, 이 페이지 앞 장들): ${HASH}`] })
  })
})
