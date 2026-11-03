import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AdminPage, { maxDuration } from '../app/admin/page'
import { AdminHome, type ConsentItem } from '../components/AdminHome'
import type { Applicant } from '../lib/applicants'
import type { ConsentRecord } from '../lib/consent-store'

const { refresh, startDeviceSign, resendConsentMailAction, readSession, loadApplicants, loadConsents } = vi.hoisted(() => ({
  refresh: vi.fn(),
  startDeviceSign: vi.fn(),
  resendConsentMailAction: vi.fn(),
  readSession: vi.fn(),
  loadApplicants: vi.fn(),
  loadConsents: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../app/admin/actions', () => ({
  cancelConsentAction: vi.fn(),
  createConsentAction: vi.fn(),
  startDeviceSign,
  resendConsentMailAction,
  logout: vi.fn(),
  sendTestMail: vi.fn(),
}))
// 사장님 홈 페이지(서버 컴포넌트)를 함수로 불러 AdminHome 에 무엇을 넘기는지 본다. 세션·시트 읽기는 가짜다.
vi.mock('../lib/admin-guard', () => ({ readSession }))
vi.mock('../lib/applicants', () => ({ loadApplicants }))
vi.mock('../lib/consent-store', async (orig) => ({ ...(await orig<typeof import('../lib/consent-store')>()), loadConsents }))

afterEach(() => vi.clearAllMocks())

const READ_FAIL = '지금은 시트를 읽을 수 없어요.'
const TOKEN = `CCCCCCCCCC-${'a'.repeat(32)}`
const applicants: Applicant[] = [
  { applyId: 'AAAAAAAAAA', receivedAt: '2026-11-01 10:00:00', guardianName: '김하나', phone: '010-1111-2222', petName: '보리', breed: '푸들' },
]
const item = (over: Partial<ConsentItem>): ConsentItem => ({
  id: 'CCCCCCCCCC',
  bundleLabel: '일반 미용',
  guardianName: '김하나',
  status: '서명 대기',
  mail: null,
  resend: false,
  createdAt: '2026-11-02 10:00:00',
  url: `https://chagocnote.com/hisshaus/consent/${TOKEN}`,
  ...over,
})
const consents: ConsentItem[] = [item({})]
const signed = (id: string, mail: string | null, resend: boolean) => item({ id, status: '서명함', mail, resend, url: null })
const card = (id: string) => within(document.querySelector(`[data-consent="${id}"]`) as HTMLElement)

describe('AdminHome 시트 읽기 실패', () => {
  it('신청 목록을 못 읽으면 그 자리에 문구가 뜨고 최근 동의서는 그대로 그려진다', () => {
    render(<AdminHome applicants={null} consents={consents} />)
    expect(screen.getAllByText(READ_FAIL)).toHaveLength(1)
    expect(screen.getByText(/일반 미용 · 김하나/)).toBeTruthy()
    expect(screen.getByRole('link', { name: '신청서 없이 새로 만들기' })).toBeTruthy()
    expect(screen.queryByLabelText('이름이나 연락처로 찾기')).toBeNull()
  })

  it('최근 동의서를 못 읽으면 그 자리에 문구가 뜨고 신청 목록은 그대로 그려진다', () => {
    render(<AdminHome applicants={applicants} consents={null} />)
    expect(screen.getAllByText(READ_FAIL)).toHaveLength(1)
    expect(screen.getByRole('link', { name: /김하나/ })).toBeTruthy()
  })

  it('둘 다 못 읽어도 화면은 그려지고 문구가 두 번 뜬다', () => {
    render(<AdminHome applicants={null} consents={null} />)
    expect(screen.getAllByText(READ_FAIL)).toHaveLength(2)
  })
})

describe('AdminHome 이 기기에서 바로 서명', () => {
  it('서명 대기 동의서에만 버튼이 있고, 누르면 그 링크의 토큰으로 잠금 서명을 시작한다', async () => {
    startDeviceSign.mockResolvedValue(undefined)
    render(
      <AdminHome
        applicants={[]}
        consents={[item({}), signed('SSSSSSSSSS', null, true), item({ id: 'XXXXXXXXXX', status: '취소함', url: null })]}
      />,
    )
    expect(screen.getAllByRole('button', { name: '이 기기에서 바로 서명' })).toHaveLength(1)
    fireEvent.click(card('CCCCCCCCCC').getByRole('button', { name: '이 기기에서 바로 서명' }))
    await vi.waitFor(() => expect(startDeviceSign).toHaveBeenCalledWith(TOKEN))
  })

  it('틀린 링크라고 답하면 오류 문구를 보인다', async () => {
    startDeviceSign.mockResolvedValue({ error: '링크가 올바르지 않아요.' })
    render(<AdminHome applicants={[]} consents={consents} />)
    fireEvent.click(screen.getByRole('button', { name: '이 기기에서 바로 서명' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('링크가 올바르지 않아요.')
  })
})

describe('AdminHome 메일 다시 보내기', () => {
  it('서명했고 메일이 실패했거나 메일 결과가 없는 동의서에만 버튼이 있다', () => {
    render(
      <AdminHome
        applicants={[]}
        consents={[
          signed('S1S1S1S1S1', '보관 실패 · 사본 보냄', true),
          signed('S2S2S2S2S2', null, true),
          signed('S3S3S3S3S3', '보관 보냄 · 사본 보냄', false),
          item({}),
        ]}
      />,
    )
    expect(card('S1S1S1S1S1').getByRole('button', { name: '메일 다시 보내기' })).toBeTruthy()
    expect(card('S2S2S2S2S2').getByRole('button', { name: '메일 다시 보내기' })).toBeTruthy()
    expect(card('S3S3S3S3S3').queryByRole('button', { name: '메일 다시 보내기' })).toBeNull()
    expect(card('CCCCCCCCCC').queryByRole('button', { name: '메일 다시 보내기' })).toBeNull()
  })

  it('누르면 그 동의서를 다시 보내고 결과를 한 줄로 보인 뒤 목록을 새로 읽는다', async () => {
    resendConsentMailAction.mockResolvedValue({ result: { archive: true, guardian: false } })
    render(<AdminHome applicants={[]} consents={[signed('S1S1S1S1S1', '보관 실패 · 사본 실패', true)]} />)
    fireEvent.click(screen.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await card('S1S1S1S1S1').findByRole('status')).toHaveTextContent('다시 보냈어요: 보관 보냄 · 사본 실패')
    expect(resendConsentMailAction).toHaveBeenCalledWith('S1S1S1S1S1')
    expect(refresh).toHaveBeenCalled()
  })

  it('이미 두 통 다 보냈다고 답하면 그 동의서에 그렇게 보이고 목록을 새로 읽는다', async () => {
    resendConsentMailAction.mockResolvedValue({ result: 'already-sent' })
    render(<AdminHome applicants={[]} consents={[signed('S1S1S1S1S1', '보관 실패 · 사본 보냄', true)]} />)
    fireEvent.click(screen.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await card('S1S1S1S1S1').findByRole('status')).toHaveTextContent('이미 두 통 다 보냈어요.')
    expect(refresh).toHaveBeenCalled()
  })

  it('시트를 못 읽었다고 답하면 그 문구를 보인다', async () => {
    resendConsentMailAction.mockResolvedValue({ error: '지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    render(<AdminHome applicants={[]} consents={[signed('S1S1S1S1S1', null, true)]} />)
    fireEvent.click(screen.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.')
  })

  it('원본 문서나 시트 기록이 서명 때와 다르다고(changed) 답하면 다시 만들 수 없다고 알린다', async () => {
    resendConsentMailAction.mockResolvedValue({ result: 'changed' })
    render(<AdminHome applicants={[]} consents={[signed('S1S1S1S1S1', '보관 실패 · 사본 보냄', true)]} />)
    fireEvent.click(screen.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('원본 문서나 시트 기록이 서명 때와 달라 다시 만들 수 없어요.')
    expect(card('S1S1S1S1S1').queryByRole('status')).toBeNull()
  })
})

describe('사장님 홈 — 메일을 다시 보내야 하는 서명', () => {
  const RESEND_HEADING = '메일을 다시 보내야 하는 서명'
  const id = (i: number) => `R${String(i).padStart(9, '0')}`
  /** 시트 순서(오래된 것부터)의 서명된 기록. mail 이 실패이거나 없으면 다시 보내야 한다. */
  const signedRecord = (i: number, mail: ConsentRecord['mail']): ConsentRecord => ({
    prepared: {
      id: id(i),
      applyId: '',
      bundle: 'generalGrooming',
      programName: '',
      goal: '',
      classTime: '',
      groomingParts: ['등'],
      shown: null,
      createdAt: `2026-10-${String(1 + (i % 28)).padStart(2, '0')} 10:00:00`,
    },
    cancelled: false,
    signed: {
      signedAt: '2026-10-01 11:00:00',
      guardian: { guardianName: `보호자${i}`, phone: '010-1234-5678', petName: '보리', breed: '푸들', email: 'a@example.com' },
      changes: [],
      device: 'UA',
      docHash: 'd'.repeat(64),
      fileHash: 'f'.repeat(64),
      row: i + 2,
    },
    mail,
  })
  const ok = { archive: true, guardian: true }

  /** 서버 컴포넌트를 불러 AdminHome 요소의 props 를 꺼낸다. */
  async function homeProps() {
    const page = await AdminPage()
    const children = (page.props as { children: { type: unknown; props: Parameters<typeof AdminHome>[0] }[] }).children
    return children.find((c) => c?.type === AdminHome)!.props
  }

  it('최근 30건 밖의 오래된 메일 실패도 새 칸에 최신순으로 보이고 거기서 다시 보낼 수 있다', async () => {
    readSession.mockResolvedValue({ exp: Date.now() + 60_000, locked: false, fails: 0 })
    loadApplicants.mockResolvedValue([])
    // 0번(가장 오래됨)은 보관 실패, 34번(가장 최근)은 메일 줄 없음, 나머지는 두 통 다 보냄.
    const records = Array.from({ length: 35 }, (_, i) =>
      signedRecord(i, i === 0 ? { archive: false, guardian: true } : i === 34 ? null : ok),
    )
    loadConsents.mockResolvedValue(new Map(records.map((r) => [r.prepared.id, r])))

    const props = await homeProps()
    expect(props.consents).toHaveLength(30)
    expect(props.consents!.map((c) => c.id)).not.toContain(id(0))
    expect(props.resends!.map((c) => c.id)).toEqual([id(34), id(0)])

    resendConsentMailAction.mockResolvedValue({ result: { archive: true, guardian: true } })
    render(<AdminHome {...props} />)
    const section = screen.getByRole('heading', { name: RESEND_HEADING }).closest('section') as HTMLElement
    const old = within(section.querySelector(`[data-resend="${id(0)}"]`) as HTMLElement)
    expect(old.getByText(/일반 미용 · 보호자0/)).toBeTruthy()
    expect(old.getByText(/메일: 보관 실패 · 사본 보냄/)).toBeTruthy()
    // 최근 목록에는 없다.
    expect(document.querySelector(`[data-consent="${id(0)}"]`)).toBeNull()
    fireEvent.click(old.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await old.findByRole('status')).toHaveTextContent('다시 보냈어요: 보관 보냄 · 사본 보냄')
    expect(resendConsentMailAction).toHaveBeenCalledWith(id(0))
  })

  it('다시 보낼 서명이 없으면 그 칸을 그리지 않는다', async () => {
    readSession.mockResolvedValue({ exp: Date.now() + 60_000, locked: false, fails: 0 })
    loadApplicants.mockResolvedValue([])
    loadConsents.mockResolvedValue(new Map([[id(1), signedRecord(1, ok)]]))
    const props = await homeProps()
    expect(props.resends).toEqual([])
    render(<AdminHome {...props} />)
    expect(screen.queryByRole('heading', { name: RESEND_HEADING })).toBeNull()
  })

  it('시트를 못 읽으면 새 칸은 없고 최근 동의서 자리에 문구가 뜬다', async () => {
    readSession.mockResolvedValue({ exp: Date.now() + 60_000, locked: false, fails: 0 })
    loadApplicants.mockResolvedValue([])
    loadConsents.mockRejectedValue(new Error('sheets'))
    const props = await homeProps()
    expect(props.consents).toBeNull()
    expect(props.resends).toEqual([])
  })

  it('사장님 홈의 함수 시간 제한은 30초다(메일 다시 보내기가 시트·PDF·메일을 한다)', () => {
    expect(maxDuration).toBe(30)
  })
})
