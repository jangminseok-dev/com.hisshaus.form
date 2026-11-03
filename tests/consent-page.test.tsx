import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TokenPage, { dynamic, metadata } from '../app/consent/[token]/page'
import { ConsentFlow } from '../components/ConsentFlow'
import { ConsentNotice } from '../components/ConsentNotice'
import type { AdminSession } from '../lib/admin-session'
import { consentToken } from '../lib/consent-link'
import type { ConsentRecord, Prepared } from '../lib/consent-store'

// 동의서 링크 페이지(서버 컴포넌트)를 함수로 불러 무엇을 그리는지 본다. 시트 읽기와 사장님 세션은 가짜다.
const loadConsents = vi.hoisted(() => vi.fn<() => Promise<Map<string, ConsentRecord>>>())
vi.mock('../lib/consent-store', () => ({ loadConsents }))
const readSession = vi.hoisted(() => vi.fn<() => Promise<AdminSession | null>>())
vi.mock('../lib/admin-guard', () => ({ readSession }))

const SECRET = 'test-survey-link-secret-0123456789abcdef'
const ID = 'CnSt12345a'
const TOKEN = consentToken(ID, SECRET)

const PREPARED: Prepared = {
  id: ID,
  applyId: 'Ab3dE5gH7j',
  bundle: 'behavior',
  programName: '짖음 줄이기',
  goal: '초인종 소리에 짖지 않기',
  classTime: '',
  groomingParts: [],
  shown: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈' },
  createdAt: '2026-11-03 10:00:00',
}
const record = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({ prepared: PREPARED, cancelled: false, signed: null, mail: null, ...over })
const SIGNED: ConsentRecord['signed'] = {
  signedAt: '2026-11-03 11:00:00',
  guardian: { ...PREPARED.shown!, email: 'hana@example.com' },
  changes: [],
  device: 'UA',
  docHash: 'a'.repeat(64),
  fileHash: 'b'.repeat(64),
  row: 3,
}
const session = (locked: boolean): AdminSession => ({ exp: Date.now() + 60_000, locked, fails: 0 })

const open = (token: string) => TokenPage({ params: Promise.resolve({ token }) })

beforeEach(() => {
  vi.stubEnv('SURVEY_LINK_SECRET', SECRET)
  loadConsents.mockReset()
  loadConsents.mockResolvedValue(new Map([[ID, record()]]))
  readSession.mockReset()
  readSession.mockResolvedValue(null)
})
afterEach(() => vi.unstubAllEnvs())

describe('동의서 링크 페이지', () => {
  it('틀린 링크·취소·모름은 closed, 서명됨은 signed, 기록 읽기 실패는 error, 아니면 ConsentFlow 다', async () => {
    // 틀린 링크는 시트를 읽지 않는다.
    for (const token of [`${ID}-${'0'.repeat(32)}`, ID, 'hello']) {
      const page = await open(token)
      expect(page.type).toBe(ConsentNotice)
      expect(page.props).toEqual({ kind: 'closed', device: false })
    }
    expect(loadConsents).not.toHaveBeenCalled()

    loadConsents.mockResolvedValue(new Map([[ID, record({ cancelled: true })]]))
    expect((await open(TOKEN)).props).toEqual({ kind: 'closed', device: false })

    loadConsents.mockResolvedValue(new Map())
    expect((await open(TOKEN)).props).toEqual({ kind: 'closed', device: false })

    loadConsents.mockResolvedValue(new Map([[ID, record({ signed: SIGNED })]]))
    expect((await open(TOKEN)).props).toEqual({ kind: 'signed', device: false })

    loadConsents.mockRejectedValue(new Error('sheets'))
    expect((await open(TOKEN)).props).toEqual({ kind: 'error', device: false })

    loadConsents.mockResolvedValue(new Map([[ID, record()], ['Other12345', record({ prepared: { ...PREPARED, id: 'Other12345' } })]]))
    const page = await open(TOKEN)
    expect(page.type).toBe(ConsentFlow)
    // 화면에는 이 동의서의 준비 기록만 넘긴다.
    expect(page.props).toEqual({ token: TOKEN, prepared: PREPARED, device: false })
  })

  it('잠긴 사장님 세션(아이패드)이면 device 이고, 잠기지 않았거나 세션을 못 읽으면 아니다', async () => {
    readSession.mockResolvedValue(session(true))
    expect((await open(TOKEN)).props.device).toBe(true)
    readSession.mockResolvedValue(session(false))
    expect((await open(TOKEN)).props.device).toBe(false)
    readSession.mockRejectedValue(new Error('cookie'))
    expect((await open(TOKEN)).props.device).toBe(false)
  })

  it('잠긴 아이패드에서는 안내(틀린 링크·서명함·읽기 실패)에도 device 를 넘긴다', async () => {
    readSession.mockResolvedValue(session(true))
    expect((await open('hello')).props).toEqual({ kind: 'closed', device: true })
    loadConsents.mockResolvedValue(new Map([[ID, record({ signed: SIGNED })]]))
    expect((await open(TOKEN)).props).toEqual({ kind: 'signed', device: true })
    loadConsents.mockRejectedValue(new Error('sheets'))
    expect((await open(TOKEN)).props).toEqual({ kind: 'error', device: true })
  })

  it('요청마다 새로 그리고, 미리보기는 히스하우스 동의서와 매장 사진이다', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(metadata.title).toBe('히스하우스 동의서')
    expect(metadata.openGraph).toMatchObject({ title: '히스하우스 동의서', images: ['/hisshaus/og-shop.jpg'] })
  })
})

describe('ConsentNotice', () => {
  it.each([
    ['closed', '열 수 없는 동의서예요', '링크가 바뀌었을 수 있어요. 카카오톡 채널로 알려 주세요.'],
    ['signed', '이미 서명한 동의서예요', '사본은 메일로 보내 드렸어요.'],
    ['error', '지금은 동의서를 열 수 없어요', '잠시 뒤 다시 열어 주세요.'],
  ] as const)('%s 안내', (kind, title, text) => {
    render(<ConsentNotice kind={kind} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title)
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /카카오톡 채널로 문의하기/ })).toBeInTheDocument()
    // 보호자 기기에는 사장님 화면으로 가는 길이 없다.
    expect(screen.queryByRole('link', { name: '사장님 화면으로' })).toBeNull()
  })

  it.each(['closed', 'signed', 'error'] as const)('잠긴 아이패드의 %s 안내에는 사장님 화면(PIN)으로 가는 길이 있다', (kind) => {
    render(<ConsentNotice kind={kind} device />)
    expect(screen.getByRole('link', { name: '사장님 화면으로' })).toHaveAttribute('href', '/admin')
  })
})
