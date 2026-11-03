import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { agreedSentences } from '../lib/consent-docs'
import { consentToken } from '../lib/consent-link'
import type { ConsentPdfInput } from '../lib/consent-pdf'
import { mailRow, signedRow, type ConsentRecord, type Prepared } from '../lib/consent-store'
import { consentMails, submitConsent, type ConsentDeps } from '../lib/consent-submit'
import type { Mail } from '../lib/mail'
import { encodeSignature } from '../lib/signature'
import type { SheetTab } from '../lib/sheets'
import { consentMessages, type SlackMessage } from '../lib/slack-blocks'
import { surveyToken } from '../lib/survey-link'

const ID = 'Cn5t9Qw2Er'
const APPLY_ID = 'Ab3dE5gH9k'
const SECRET = 'test-survey-link-secret-0123456789abcdef'
const TOKEN = consentToken(ID, SECRET)
const SIGNED_AT = '2026-11-03 14:05:09'
const MAILED_AT = '2026-11-03 14:05:12'
const TODAY = '2026-11-03'
const UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ARCHIVE = 'archive@example.invalid'
const SIGNATURE = encodeSignature([
  [[40, 150], [90, 40], [150, 150]],
  [[200, 110], [300, 60], [420, 130], [560, 70]],
])
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const PDF_BASE64 = Buffer.from(PDF_BYTES).toString('base64')
const DOC_HASH = 'd'.repeat(64)
const FILE_HASH = 'f'.repeat(64)

const prepared: Prepared = {
  id: ID,
  applyId: APPLY_ID,
  bundle: 'behavior',
  programName: '짖음 줄이기',
  goal: '초인종 소리에 짖지 않기',
  classTime: '',
  groomingParts: [],
  shown: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈' },
  createdAt: '2026-11-03 10:00:00',
}

const record = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({ prepared, cancelled: false, signed: null, mail: null, ...over })

const info = { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈', email: 'hana@example.com' }
const body = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  info,
  agreed: ['agreement', 'behavior', 'guidelines'],
  esign: true,
  signature: SIGNATURE,
  ...over,
})

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  vi.stubEnv('MAIL_ADDRESS', ARCHIVE)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** 가짜 시트·PDF·메일·슬랙. events 에 부른 순서가 쌓인다. 시트 쓰기는 한 틱 늦게 끝나서 기다리지 않고 넘어가면 순서가 드러난다. */
function fakes(rec: ConsentRecord | null = record()) {
  const events: string[] = []
  const loadConsents = vi.fn(async () => {
    events.push('기록 읽기')
    return new Map<string, ConsentRecord>(rec ? [[ID, rec]] : [])
  })
  const appendRow = vi.fn(async (_tab: SheetTab, row: string[]) => {
    events.push(`시트 ${row[1]} 시작`)
    await Promise.resolve()
    events.push(`시트 ${row[1]} 끝`)
  })
  const buildPdf = vi.fn(async (_input: ConsentPdfInput) => {
    events.push('PDF')
    return { bytes: PDF_BYTES, docHash: DOC_HASH, fileHash: FILE_HASH }
  })
  const sendMail = vi.fn(async (mail: Mail) => {
    events.push(`메일 ${mail.to}`)
  })
  const sendSlack = vi.fn(async (_messages: SlackMessage[]) => {
    events.push('슬랙')
  })
  const now = vi.fn().mockReturnValueOnce(SIGNED_AT).mockReturnValue(MAILED_AT)
  const deps: ConsentDeps = { loadConsents, appendRow, buildPdf, sendMail, sendSlack, now, today: () => TODAY, secret: SECRET }
  return { events, loadConsents, appendRow, buildPdf, sendMail, sendSlack, now, deps }
}

const mailsFor = (guardianName = '김하나', petName = '보리', email = 'hana@example.com') =>
  consentMails({ bundleLabel: '행동수정 트레이닝', guardianName, petName, email, signedAt: SIGNED_AT, pdf: PDF_BYTES })

describe('동의서 서명 제출', () => {
  it('맞게 내면 시트 서명 줄 → 메일 두 통 → 메일 줄 → 슬랙 순서이고 pdf 를 돌려준다', async () => {
    const { events, appendRow, buildPdf, sendMail, sendSlack, deps } = fakes()
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: true })
    expect(events).toEqual([
      '기록 읽기',
      'PDF',
      '시트 서명 시작',
      '시트 서명 끝',
      `메일 ${ARCHIVE}`,
      '메일 hana@example.com',
      '시트 메일 시작',
      '시트 메일 끝',
      '슬랙',
    ])

    // PDF 는 서명 시각 한 번(now 첫 값)으로, 동의 문구는 묶음에서 만든다.
    expect(buildPdf).toHaveBeenCalledWith({
      bundle: 'behavior',
      consentId: ID,
      applyId: APPLY_ID,
      guardian: info,
      owner: { programName: '짖음 줄이기', goal: '초인종 소리에 짖지 않기', classTime: '', groomingParts: [] },
      signature: SIGNATURE,
      signedAt: SIGNED_AT,
      device: UA,
      agreed: agreedSentences('behavior'),
      changes: [],
    })
    // 서명 줄의 A열은 PDF 에 찍은 서명 시각 그대로, 메일 줄은 메일을 보낸 뒤의 시각이다.
    const signed = { signedAt: SIGNED_AT, guardian: info, changes: [], device: UA, docHash: DOC_HASH, fileHash: FILE_HASH }
    expect(appendRow.mock.calls).toEqual([
      ['동의서', signedRow(prepared, signed, SIGNATURE)],
      ['동의서', mailRow(ID, MAILED_AT, { archive: true, guardian: true })],
    ])
    expect(appendRow.mock.calls[0][1][0]).toBe(SIGNED_AT)
    expect(sendMail.mock.calls.map(([m]) => m)).toEqual(mailsFor())
    expect(sendSlack).toHaveBeenCalledWith(
      consentMessages({
        bundleLabel: '행동수정 트레이닝',
        guardianName: '김하나',
        petName: '보리',
        changes: [],
        mail: { archive: true, guardian: true },
        consentId: ID,
        applyId: APPLY_ID,
      }),
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('진짜 PDF 로 만들면 돌려준 pdf 가 그 PDF 이고 시트에 그 고유값이 적힌다', async () => {
    const { appendRow, deps } = fakes()
    const result = await submitConsent(body(), UA, { ...deps, buildPdf: undefined })
    if (result.status !== 'ok' || !result.pdf) throw new Error('ok 와 pdf 를 기대했다')
    const bytes = Buffer.from(result.pdf, 'base64')
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    const row = appendRow.mock.calls[0][1]
    expect(row[17]).toMatch(/^[0-9a-f]{64}$/)
    expect(row[18]).toBe(createHash('sha256').update(bytes).digest('hex'))
  })

  it('서명 기기는 User-Agent 를 300자에서 자른다', async () => {
    const { buildPdf, appendRow, deps } = fakes()
    await submitConsent(body(), 'x'.repeat(500), deps)
    expect(buildPdf.mock.calls[0][0].device).toBe('x'.repeat(300))
    expect(appendRow.mock.calls[0][1][15]).toBe('x'.repeat(300))
  })

  it('같은 링크로 다시 내면 아무것도 쓰지도 보내지도 않고 ok(pdf 없음)다', async () => {
    const signed = {
      signedAt: SIGNED_AT,
      guardian: info,
      changes: [],
      device: UA,
      docHash: DOC_HASH,
      fileHash: FILE_HASH,
      row: 7,
    }
    const { appendRow, buildPdf, sendMail, sendSlack, deps } = fakes(record({ signed }))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', mailed: false })
    expect(buildPdf).not.toHaveBeenCalled()
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('취소했거나 모르는 동의서, 틀린 링크면 closed 다', async () => {
    for (const rec of [record({ cancelled: true }), null]) {
      const { appendRow, sendMail, sendSlack, deps } = fakes(rec)
      expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'closed' })
      expect(appendRow).not.toHaveBeenCalled()
      expect(sendMail).not.toHaveBeenCalled()
      expect(sendSlack).not.toHaveBeenCalled()
    }
    const wrong = [
      undefined,
      '',
      ID,
      consentToken(ID, 'another-secret-0123456789abcdef-xyz'),
      // 같은 ID 의 검사지 링크로는 동의서가 열리지 않는다.
      surveyToken(ID, SECRET),
      `${TOKEN}0`,
    ]
    for (const token of wrong) {
      const { loadConsents, appendRow, deps } = fakes()
      expect(await submitConsent(body({ token }), UA, deps)).toStrictEqual({ status: 'closed' })
      // 링크가 틀리면 시트를 읽지도 않는다.
      expect(loadConsents).not.toHaveBeenCalled()
      expect(appendRow).not.toHaveBeenCalled()
    }
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('허니팟에 값이 있으면 읽지도 쓰지도 보내지도 않고 ok 다', async () => {
    for (const website of ['http://spam.test', ' ', true]) {
      const { loadConsents, appendRow, sendMail, sendSlack, deps } = fakes()
      expect(await submitConsent(body({ website }), UA, deps)).toStrictEqual({ status: 'ok', mailed: false })
      expect(loadConsents).not.toHaveBeenCalled()
      expect(appendRow).not.toHaveBeenCalled()
      expect(sendMail).not.toHaveBeenCalled()
      expect(sendSlack).not.toHaveBeenCalled()
    }
  })

  it('본문이 객체가 아니면 invalid(빈 목록)다', async () => {
    for (const b of [null, [], 'x', 1]) {
      const { loadConsents, deps } = fakes()
      expect(await submitConsent(b, UA, deps)).toStrictEqual({ status: 'invalid', errors: [] })
      expect(loadConsents).not.toHaveBeenCalled()
    }
  })

  it('묶음의 장을 하나라도 빠뜨리거나 더하거나, 전자서명 동의·사인이 없으면 그 칸 오류다', async () => {
    const agreedError = { status: 'invalid', errors: [{ questionId: 'agreed', message: '모든 문서에 동의해 주세요' }] }
    for (const agreed of [
      ['agreement', 'behavior'],
      ['agreement', 'behavior', 'guidelines', 'trust'],
      ['agreement', 'behavior', 'behavior'],
      ['agreement', 'agreement', 'behavior', 'guidelines'],
      [],
      undefined,
      'agreement,behavior,guidelines',
    ]) {
      const { appendRow, deps } = fakes()
      expect(await submitConsent(body({ agreed }), UA, deps)).toStrictEqual(agreedError)
      expect(appendRow).not.toHaveBeenCalled()
    }
    // 순서는 달라도 같은 장이면 된다.
    const { deps } = fakes()
    expect(await submitConsent(body({ agreed: ['guidelines', 'agreement', 'behavior'] }), UA, deps)).toMatchObject({ status: 'ok' })

    for (const esign of [false, undefined, 'true', 1]) {
      const { appendRow, deps } = fakes()
      expect(await submitConsent(body({ esign }), UA, deps)).toStrictEqual({
        status: 'invalid',
        errors: [{ questionId: 'esign', message: '전자 방식 서명에 동의해 주세요' }],
      })
      expect(appendRow).not.toHaveBeenCalled()
    }
    for (const signature of ['', undefined, '10,20', 'abc', '700,10 710,20', 42]) {
      const { appendRow, deps } = fakes()
      expect(await submitConsent(body({ signature }), UA, deps)).toStrictEqual({
        status: 'invalid',
        errors: [{ questionId: 'signature', message: '사인해 주세요' }],
      })
      expect(appendRow).not.toHaveBeenCalled()
    }
    // 셋 다 없으면 셋 다 알린다.
    const { buildPdf, deps: d } = fakes()
    const all = await submitConsent(body({ agreed: [], esign: false, signature: '' }), UA, d)
    expect(all).toStrictEqual({
      status: 'invalid',
      errors: [
        { questionId: 'agreed', message: '모든 문서에 동의해 주세요' },
        { questionId: 'esign', message: '전자 방식 서명에 동의해 주세요' },
        { questionId: 'signature', message: '사인해 주세요' },
      ],
    })
    expect(buildPdf).not.toHaveBeenCalled()
  })

  it('010 휴대폰이 아니면 휴대폰 번호(010)로 적어 달라 한다', async () => {
    const mobileError = { status: 'invalid', errors: [{ questionId: 'phone', message: '휴대폰 번호(010)로 적어 주세요' }] }
    for (const phone of ['02-1234-5678', '0212345678', '011-123-4567', '+82 10-1234-5678', '010-123-4567', '010 1234 5678']) {
      const { appendRow, deps } = fakes()
      expect(await submitConsent(body({ info: { ...info, phone } }), UA, deps)).toStrictEqual(mobileError)
      expect(appendRow).not.toHaveBeenCalled()
    }
    // 연락처 모양부터 틀리면 그 안내 하나만 한다.
    const { deps } = fakes()
    expect(await submitConsent(body({ info: { ...info, phone: '없어요' } }), UA, deps)).toStrictEqual({
      status: 'invalid',
      errors: [{ questionId: 'phone', message: '연락처를 다시 확인해 주세요' }],
    })
    // 하이픈 없이 적어도 010-0000-0000 꼴로 PDF·시트에 들어간다.
    const ok = fakes()
    expect(await submitConsent(body({ info: { ...info, phone: ' 01098765432 ' } }), UA, ok.deps)).toMatchObject({ status: 'ok' })
    expect(ok.buildPdf.mock.calls[0][0].guardian.phone).toBe('010-9876-5432')
    expect(ok.appendRow.mock.calls[0][1][10]).toBe('010-9876-5432')
  })

  it('보호자 정보는 앞뒤 공백을 지우고, 빈칸·50자 넘는 글·틀린 이메일은 그 칸 오류다', async () => {
    const { deps } = fakes()
    const result = await submitConsent(
      body({ info: { guardianName: '   ', phone: '', petName: '가'.repeat(51), breed: 7, email: 'hana.example.com' } }),
      UA,
      deps,
    )
    expect(result).toStrictEqual({
      status: 'invalid',
      errors: [
        { questionId: 'guardianName', message: '꼭 적어 주세요' },
        { questionId: 'phone', message: '꼭 적어 주세요' },
        { questionId: 'breed', message: '꼭 적어 주세요' },
        { questionId: 'email', message: '이메일을 다시 확인해 주세요' },
        { questionId: 'petName', message: '50자까지 적을 수 있어요' },
      ],
    })
    const missing = fakes()
    expect(await submitConsent(body({ info: undefined }), UA, missing.deps)).toMatchObject({ status: 'invalid' })

    const spaced = fakes()
    const padded = { guardianName: ' 김하나 ', phone: '010-1234-5678', petName: '보리\t', breed: ' 말티즈', email: ' hana@example.com ' }
    expect(await submitConsent(body({ info: padded }), UA, spaced.deps)).toMatchObject({ status: 'ok' })
    expect(spaced.buildPdf.mock.calls[0][0].guardian).toEqual(info)
    expect(spaced.buildPdf.mock.calls[0][0].changes).toEqual([])
    expect(spaced.sendMail.mock.calls[1][0].to).toBe('hana@example.com')
  })

  it('미리 보여 준 값과 달라진 칸만 "견종 말티 → 말티즈" 꼴로 시트·슬랙에 실리고, 신청서 없이 만든 동의서는 고친 값이 없다', async () => {
    const shown = { guardianName: '김하나', phone: '01012345678', petName: '보리', breed: '말티' }
    const { buildPdf, appendRow, sendSlack, deps } = fakes(record({ prepared: { ...prepared, shown } }))
    // 이메일은 미리 보여 주지 않으므로 견주지 않는다. 연락처는 하이픈 꼴로 견준다(01012345678 = 010-1234-5678).
    await submitConsent(body(), UA, deps)
    expect(buildPdf.mock.calls[0][0].changes).toEqual(['견종 말티 → 말티즈'])
    expect(appendRow.mock.calls[0][1][14]).toBe('견종 말티 → 말티즈')
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain('견종 말티 → 말티즈')

    const many = fakes()
    await submitConsent(body({ info: { ...info, guardianName: '김두나', phone: '010-5555-6666', petName: '초코' } }), UA, many.deps)
    const changes = ['보호자 성함 김하나 → 김두나', '연락처 010-1234-5678 → 010-5555-6666', '반려견 이름 보리 → 초코']
    expect(many.buildPdf.mock.calls[0][0].changes).toEqual(changes)
    expect(many.appendRow.mock.calls[0][1][14]).toBe(changes.join('\n'))
    expect(many.sendSlack.mock.calls[0][0]).toEqual(
      consentMessages({
        bundleLabel: '행동수정 트레이닝',
        guardianName: '김두나',
        petName: '초코',
        changes,
        mail: { archive: true, guardian: true },
        consentId: ID,
        applyId: APPLY_ID,
      }),
    )

    const blank = fakes(record({ prepared: { ...prepared, applyId: '', shown: null } }))
    await submitConsent(body(), UA, blank.deps)
    expect(blank.buildPdf.mock.calls[0][0].changes).toEqual([])
    expect(blank.appendRow.mock.calls[0][1][14]).toBe('')
    expect(JSON.stringify(blank.sendSlack.mock.calls[0][0])).not.toContain('보호자가 고친 값')
    expect(JSON.stringify(blank.sendSlack.mock.calls[0][0])).toContain('신청서 없이 만듦')
  })

  it('시트 쓰기가 실패하면 failed 이고 메일·슬랙을 부르지 않으며 로그 인자는 정확히 ["시트 저장 실패", id] 다', async () => {
    const { appendRow, sendMail, sendSlack, deps } = fakes()
    appendRow.mockRejectedValueOnce(new Error('sheets https://secret.example/key'))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'failed' })
    expect(appendRow).toHaveBeenCalledTimes(1)
    expect(sendMail).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
  })

  it('메일이 실패해도 ok 이고 mailed 는 false, 로그는 ["메일 전송 실패", id], 슬랙에 실패가 표시된다', async () => {
    const { appendRow, sendMail, sendSlack, deps } = fakes()
    sendMail.mockImplementation(async (mail: Mail) => {
      if (mail.to === 'hana@example.com') throw new Error('mail')
    })
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: false })
    expect(errorSpy.mock.calls).toEqual([['메일 전송 실패', ID]])
    expect(appendRow.mock.calls[1][1]).toEqual(mailRow(ID, MAILED_AT, { archive: true, guardian: false }))
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain('보관용 보냄 · 보호자 사본 실패')
  })

  it('보관용 메일이 실패해도 보호자 사본은 보내고 mailed 는 true 다', async () => {
    const { sendMail, sendSlack, deps } = fakes()
    sendMail.mockRejectedValueOnce(new Error('mail'))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: true })
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[1][0].to).toBe('hana@example.com')
    expect(errorSpy.mock.calls).toEqual([['메일 전송 실패', ID]])
    expect(JSON.stringify(sendSlack.mock.calls[0][0])).toContain('보관용 실패 · 보호자 사본 보냄')
  })

  it('보관 주소 설정이 없으면 두 통 다 실패로 치고 서명은 ok 다', async () => {
    vi.stubEnv('MAIL_ADDRESS', '')
    const { appendRow, sendMail, deps } = fakes()
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: false })
    expect(sendMail).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([
      ['메일 전송 실패', ID],
      ['메일 전송 실패', ID],
    ])
    expect(appendRow.mock.calls[1][1]).toEqual(mailRow(ID, MAILED_AT, { archive: false, guardian: false }))
  })

  it('메일 줄 쓰기가 실패해도 슬랙을 보내고 ok 다(로그 없음)', async () => {
    const { appendRow, sendSlack, deps } = fakes()
    appendRow.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('sheets'))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: true })
    expect(sendSlack).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('슬랙이 실패해도 ok 이고 로그는 ["슬랙 전송 실패", id] 다', async () => {
    const { sendSlack, deps } = fakes()
    sendSlack.mockRejectedValueOnce(new Error('slack'))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'ok', pdf: PDF_BASE64, mailed: true })
    expect(errorSpy.mock.calls).toEqual([['슬랙 전송 실패', ID]])
  })

  it('PDF 를 못 만들면 failed 이고 시트·메일·슬랙을 부르지 않으며 로그는 ["PDF 만들기 실패", id] 다', async () => {
    const { buildPdf, appendRow, sendMail, sendSlack, deps } = fakes()
    buildPdf.mockRejectedValueOnce(new Error("ENOENT: no such file or directory, open '/var/task/content/consent-agreement.pdf'"))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'failed' })
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls).toEqual([['PDF 만들기 실패', ID]])
  })

  it('기록을 못 읽으면 failed 다', async () => {
    const { loadConsents, appendRow, buildPdf, sendMail, sendSlack, deps } = fakes()
    loadConsents.mockRejectedValueOnce(new Error('sheets'))
    expect(await submitConsent(body(), UA, deps)).toStrictEqual({ status: 'failed' })
    expect(buildPdf).not.toHaveBeenCalled()
    expect(appendRow).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
    expect(sendSlack).not.toHaveBeenCalled()
    // 읽기 실패도 시트 실패로 남긴다(검사지와 같다).
    expect(errorSpy.mock.calls).toEqual([['시트 저장 실패', ID]])
  })
})

describe('동의서 메일', () => {
  it('보관용·사본 메일의 받는 이·제목·첨부 이름이 정해진 꼴이다', () => {
    const [archive, copy] = mailsFor()
    const attachment = { filename: '히스하우스_동의서_행동수정 트레이닝_보리_20261103.pdf', content: PDF_BYTES }
    expect(archive).toEqual({
      to: ARCHIVE,
      subject: '[동의서] 김하나 · 보리 · 행동수정 트레이닝 · 2026-11-03',
      text: '서명된 동의서를 첨부해요.',
      attachment,
    })
    expect(copy).toEqual({
      to: 'hana@example.com',
      subject: '히스하우스 동의서 사본이에요 (행동수정 트레이닝)',
      text: '서명해 주셔서 고마워요. 서명한 동의서를 첨부해 드려요. 궁금한 점은 카카오톡 채널로 알려 주세요.',
      attachment,
    })
  })
})
