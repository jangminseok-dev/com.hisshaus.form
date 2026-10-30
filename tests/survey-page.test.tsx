import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LockedPage from '../app/survey/page'
import TokenPage, { dynamic } from '../app/survey/[token]/page'
import { SurveyFlow } from '../components/SurveyFlow'
import { SurveyNotice } from '../components/SurveyNotice'
import { surveyToken } from '../lib/survey-link'

// 검사지 링크 페이지(서버 컴포넌트)를 함수로 불러 무엇을 그리는지 본다. 시트 읽기와 redirect 는 가짜다.
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
)
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
const surveySubmitted = vi.hoisted(() => vi.fn<(applyId: string) => Promise<boolean>>())
vi.mock('../lib/sheets', () => ({ surveySubmitted }))

const SECRET = 'test-survey-link-secret-0123456789abcdef'
const ID = 'Ab3dE5gH7j'
const TOKEN = surveyToken(ID, SECRET)

const open = (token: string) => TokenPage({ params: Promise.resolve({ token }) })

beforeEach(() => {
  vi.stubEnv('SURVEY_LINK_SECRET', SECRET)
  redirect.mockClear()
  surveySubmitted.mockReset()
  surveySubmitted.mockResolvedValue(false)
})
afterEach(() => vi.unstubAllEnvs())

describe('검사지 링크 페이지', () => {
  it('맞는 링크이고 아직 안 냈으면 그 신청 ID 와 링크로 검사지를 연다', async () => {
    const page = await open(TOKEN)
    expect(page.type).toBe(SurveyFlow)
    expect(page.props).toEqual({ applyId: ID, token: TOKEN })
    expect(surveySubmitted).toHaveBeenCalledWith(ID)
  })

  it('이미 냈으면 닫힌 안내를 보인다', async () => {
    surveySubmitted.mockResolvedValue(true)
    const page = await open(TOKEN)
    expect(page.type).toBe(SurveyNotice)
    expect(page.props).toEqual({ kind: 'closed' })
  })

  it('냈는지 시트를 못 읽으면 검사지를 연다(제출 때 다시 본다)', async () => {
    surveySubmitted.mockRejectedValue(new Error('sheets'))
    const page = await open(TOKEN)
    expect(page.type).toBe(SurveyFlow)
  })

  it.each([
    ['서명이 틀린 링크', `${ID}-${'0'.repeat(32)}`],
    ['서명이 없는 링크', ID],
    ['아무 글자', 'hello'],
  ])('%s 는 시트를 읽지 않고 /survey 로 보낸다', async (_label, token) => {
    await expect(open(token)).rejects.toThrow('NEXT_REDIRECT /survey')
    expect(redirect).toHaveBeenCalledWith('/survey')
    expect(surveySubmitted).not.toHaveBeenCalled()
  })

  it('요청마다 새로 그린다(냈는지는 그때그때 다르다)', () => {
    expect(dynamic).toBe('force-dynamic')
  })
})

describe('링크 없는 검사지 주소', () => {
  it('받은 링크로 열어 달라는 안내만 보인다', () => {
    const page = LockedPage()
    expect(page.type).toBe(SurveyNotice)
    expect(page.props).toEqual({ kind: 'locked' })
  })
})
