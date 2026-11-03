import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AdminHome, type ConsentItem } from '../components/AdminHome'
import type { Applicant } from '../lib/applicants'

const { refresh, startDeviceSign, resendConsentMailAction } = vi.hoisted(() => ({
  refresh: vi.fn(),
  startDeviceSign: vi.fn(),
  resendConsentMailAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('../app/admin/actions', () => ({
  cancelConsentAction: vi.fn(),
  createConsentAction: vi.fn(),
  startDeviceSign,
  resendConsentMailAction,
}))

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

  it('시트를 못 읽었다고 답하면 그 문구를 보인다', async () => {
    resendConsentMailAction.mockResolvedValue({ error: '지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.' })
    render(<AdminHome applicants={[]} consents={[signed('S1S1S1S1S1', null, true)]} />)
    fireEvent.click(screen.getByRole('button', { name: '메일 다시 보내기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.')
  })
})
