import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AdminHome, type ConsentItem } from '../components/AdminHome'
import type { Applicant } from '../lib/applicants'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../app/admin/actions', () => ({ cancelConsentAction: vi.fn(), createConsentAction: vi.fn() }))

const READ_FAIL = '지금은 시트를 읽을 수 없어요.'
const applicants: Applicant[] = [
  { applyId: 'AAAAAAAAAA', receivedAt: '2026-11-01 10:00:00', guardianName: '김하나', phone: '010-1111-2222', petName: '보리', breed: '푸들' },
]
const consents: ConsentItem[] = [
  { id: 'CCCCCCCCCC', bundleLabel: '일반 미용', guardianName: '김하나', status: '서명 대기', mail: null, createdAt: '2026-11-02 10:00:00', url: 'https://x/c' },
]

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
