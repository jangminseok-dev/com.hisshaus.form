import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurveyFlow } from '../components/SurveyFlow'
import { TRAINING_SERVICE } from '../forms/apply'
import { surveyForm } from '../forms/survey'
import type { Answers } from '../forms/types'
import { loadDraft, loadSession, saveDraft, saveSession, type ApplySession } from '../lib/draft'
import { isSubmissionId } from '../lib/id'
import { validAnswers } from './fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const APPLY_ID = 'Ab3dE5gH7j'
const OTHER_ID = 'Zz9Yy8Xx7W'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })

const session: ApplySession = {
  submissionId: APPLY_ID,
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용', TRAINING_SERVICE],
  wish1: '10월 28일 (수) 오전',
  training: true,
  surveyDone: false,
}

const lastGroup = surveyForm.groups.length - 1
const q2 = surveyForm.groups[0].questions.find((q) => q.id === 'q2')!

/** 마지막 묶음에서 제출만 남은 검사지를 저장소에 둔다. */
function draftAtLastGroup(submissionId: string, over: Answers = {}): Answers {
  const answers: Answers = { ...validAnswers(surveyForm), ...over }
  saveDraft('survey', { answers, groupIndex: lastGroup, submissionId })
  return answers
}

const submitButton = () => screen.findByRole('button', { name: '제출하기' })

/** 첫 묶음(이메일·동의)을 채우고 두 번째 묶음으로 간다. */
async function goToSecondGroup() {
  await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.co' } })
  fireEvent.click(within(screen.getByRole('radiogroup', { name: q2.label })).getByRole('radio', { name: '동의함' }))
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
  await screen.findByRole('heading', { level: 2, name: surveyForm.groups[1].title })
}

function sent() {
  const [url, init] = fetchMock.mock.calls[0]
  return { url, init: init!, body: JSON.parse(init!.body as string) }
}

const honeypot = () => document.querySelector<HTMLInputElement>('input[aria-hidden="true"]')!

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '')
  router.push.mockReset()
  router.replace.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(reply(200, { ok: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('검사지를 열 때', () => {
  it('검사지는 세션이 있으면 성함·연락처·반려견 이름을 미리 채운다', async () => {
    saveSession(session)
    render(<SurveyFlow />)
    await goToSecondGroup()

    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('김하나')
    expect(screen.getByLabelText('의뢰인 연락처')).toHaveValue('010-1234-5678')
    expect(screen.getByLabelText('반려견의 이름')).toHaveValue('보리')
    // 나머지는 비어 있다.
    expect(screen.getByLabelText('의뢰인의 직업')).toHaveValue('')
  })

  it('세션이 없으면 미리 채우지 않는다', async () => {
    render(<SurveyFlow />)
    await goToSecondGroup()
    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('')
    expect(screen.getByLabelText('의뢰인 연락처')).toHaveValue('')
    expect(screen.getByLabelText('반려견의 이름')).toHaveValue('')
  })

  it('새 검사지 초안의 신청 ID 는 세션의 신청 ID 다', async () => {
    saveSession(session)
    render(<SurveyFlow />)
    await screen.findByRole('heading', { level: 2 })
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.co' } })

    const saved = loadDraft('survey')!
    expect(saved.submissionId).toBe(APPLY_ID)
    expect(saved.groupIndex).toBe(0)
    // 미리 채운 답도 초안에 같이 실린다.
    expect(saved.answers).toMatchObject({ q1: 'a@b.co', q3: '김하나', q4: '010-1234-5678', q7: '보리' })
  })

  it('세션이 없으면 새 신청 ID 를 만든다', async () => {
    render(<SurveyFlow />)
    await screen.findByRole('heading', { level: 2 })
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.co' } })

    const saved = loadDraft('survey')!
    expect(isSubmissionId(saved.submissionId)).toBe(true)
    expect(saved.submissionId).not.toBe(APPLY_ID)
    expect(saved.answers).toEqual({ q1: 'a@b.co' })
    expect(loadSession()).toBeNull()
  })

  it('검사지 초안의 신청 ID 가 세션과 다르면 버리고 새로 시작한다', async () => {
    saveSession(session)
    // 지난 신청 때 쓰던 검사지다. 네 번째 묶음까지 갔고 다른 사람의 이름이 들어 있다.
    saveDraft('survey', { answers: { q3: '지난 보호자', q7: '지난 아이' }, groupIndex: 3, submissionId: OTHER_ID })
    render(<SurveyFlow />)

    // 첫 묶음에서 새로 시작한다.
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
    expect(screen.getByText('1 / 12')).toBeInTheDocument()
    expect(loadDraft('survey')).toBeNull()
    await goToSecondGroup()
    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('김하나')
    expect(screen.getByLabelText('반려견의 이름')).toHaveValue('보리')
    expect(loadDraft('survey')!.submissionId).toBe(APPLY_ID)
  })

  it('검사지 초안의 신청 ID 가 세션과 같으면 이어 쓴다', async () => {
    saveSession(session)
    saveDraft('survey', { answers: { q3: '고친 이름' }, groupIndex: 3, submissionId: APPLY_ID })
    render(<SurveyFlow />)

    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[3].title })).toBeInTheDocument()
    expect(screen.getByText('4 / 12')).toBeInTheDocument()
  })

  it('세션 없이 연 검사지는 저장된 초안을 그대로 이어 쓴다', async () => {
    saveDraft('survey', { answers: {}, groupIndex: 2, submissionId: OTHER_ID })
    render(<SurveyFlow />)
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[2].title })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('반려견의 나이로 몇 살 때, 어디에서 입양하였습니까'), { target: { value: '2살' } })
    expect(loadDraft('survey')!.submissionId).toBe(OTHER_ID)
  })

  it('첫 묶음의 이전은 세션이 있으면 신청 완료 화면으로 보낸다', async () => {
    saveSession(session)
    render(<SurveyFlow />)
    fireEvent.click(await screen.findByRole('button', { name: '이전' }))
    expect(router.push).toHaveBeenCalledWith('/apply/done')
  })

  it('첫 묶음의 이전은 세션이 없으면 첫 화면으로 보낸다', async () => {
    render(<SurveyFlow />)
    fireEvent.click(await screen.findByRole('button', { name: '이전' }))
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('서버에서 그릴 때는 저장소를 읽지 않고 아무것도 그리지 않는다', () => {
    saveSession(session)
    const read = vi.spyOn(Storage.prototype, 'getItem')
    expect(renderToString(<SurveyFlow />)).toBe('')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('검사지 제출', () => {
  it('/api/survey 에 신청 ID·답·applyId·빈 허니팟을 보낸다', async () => {
    saveSession(session)
    const answers = draftAtLastGroup(APPLY_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, body } = sent()
    expect(url).toBe('/api/survey')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body).toEqual({ submissionId: APPLY_ID, answers, applyId: APPLY_ID, website: '' })
  })

  it('세션이 없으면 applyId 없이 보낸다', async () => {
    const answers = draftAtLastGroup(OTHER_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(sent().body).toEqual({ submissionId: OTHER_ID, answers, website: '' })
  })

  it('제출 성공이면 초안을 지우고 검사지를 썼다고 세션에 적고 완료로 간다', async () => {
    saveSession(session)
    draftAtLastGroup(APPLY_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    expect(loadDraft('survey')).toBeNull()
    expect(loadSession()).toEqual({ ...session, surveyDone: true })
    expect(router.push).not.toHaveBeenCalled()
  })

  it('세션 없이 제출해도 세션을 새로 만들지 않는다', async () => {
    draftAtLastGroup(OTHER_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    expect(loadDraft('survey')).toBeNull()
    expect(loadSession()).toBeNull()
  })

  it('503 이면 failed 로 입력과 초안이 남는다', async () => {
    saveSession(session)
    const answers = draftAtLastGroup(APPLY_ID)
    fetchMock.mockResolvedValue(reply(503, { ok: false }))
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadSession()).toEqual(session)
    expect(loadDraft('survey')).toEqual({ answers, groupIndex: lastGroup, submissionId: APPLY_ID })
    expect(screen.getByRole('button', { name: '제출하기' })).toBeEnabled()
  })

  it.each([
    ['네트워크 오류', new TypeError('Failed to fetch')],
    ['시간 초과', new DOMException('The operation timed out.', 'TimeoutError')],
  ])('제출이 시간 초과·네트워크 오류면 failed 다 — %s', async (_name, error) => {
    draftAtLastGroup(OTHER_ID)
    fetchMock.mockRejectedValue(error)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadDraft('survey')).not.toBeNull()
  })

  it('허니팟은 양식 밖의 이름 없는 숨은 입력이고 보낼 때 읽는다', async () => {
    draftAtLastGroup(OTHER_ID)
    render(<SurveyFlow />)
    const submit = await submitButton()
    const field = honeypot()
    expect(field).not.toHaveAttribute('name')
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('tabindex', '-1')
    expect(document.querySelector('[data-group]')!.contains(field)).toBe(false)

    fireEvent.change(field, { target: { value: 'https://spam.example' } })
    fireEvent.click(submit)
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(sent().body.website).toBe('https://spam.example')
  })
})
