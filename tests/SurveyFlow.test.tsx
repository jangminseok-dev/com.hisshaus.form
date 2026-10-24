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
/** 지난 검사지(초안)의 열쇠. 새로 연 검사지는 이것과 다른 열쇠를 만든다. */
const OLD_KEY = 'Kk3dE5gH7j'
/** 이어 쓰는 초안의 열쇠. */
const KEY = 'Qq3dE5gH7j'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })

const session: ApplySession = {
  submissionId: APPLY_ID,
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용', TRAINING_SERVICE],
  wish: '10월 28일 (수) 오전',
  training: true,
  surveyDone: false,
}

const lastGroup = surveyForm.groups.length - 1
const q2 = surveyForm.groups[0].questions.find((q) => q.id === 'q2')!

/** 마지막 묶음에서 제출만 남은 검사지를 저장소에 둔다. */
function draftAtLastGroup(submissionId: string, over: Answers = {}): Answers {
  const answers: Answers = { ...validAnswers(surveyForm), ...over }
  saveDraft('survey', { answers, groupIndex: lastGroup, submissionId, key: KEY })
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

/** 브라우저 뒤로 가기 한 번이 끝나(popstate) 지금 칸이 바뀔 때까지 기다린다. */
const goBack = () =>
  new Promise<void>((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true })
    history.back()
  })

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
    // 어느 신청에 묶인 초안인지 적어 둔다. 다른 신청의 세션에서 열리면 이 값으로 가려 버린다.
    expect(saved.applyId).toBe(APPLY_ID)
    // 신청 ID 는 신청서와 같지만 초안은 새 것이라 방문 기록 칸의 주인을 가리는 열쇠가 따로 있다.
    expect(isSubmissionId(saved.key)).toBe(true)
    expect(saved.key).not.toBe(APPLY_ID)
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
    // 어느 신청에도 묶이지 않은 초안이다.
    expect(saved).not.toHaveProperty('applyId')
    expect(loadSession()).toBeNull()
  })

  it('다른 신청에 묶인 검사지 초안은 버리고 새로 시작한다', async () => {
    saveSession(session)
    // 지난 신청 때 쓰던 검사지다. 네 번째 묶음까지 갔고 다른 사람의 이름이 들어 있다.
    saveDraft('survey', {
      answers: { q3: '지난 보호자', q7: '지난 아이' },
      groupIndex: 3,
      submissionId: OTHER_ID,
      key: OLD_KEY,
      applyId: OTHER_ID,
    })
    render(<SurveyFlow />)

    // 첫 묶음에서 새로 시작한다.
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
    expect(loadDraft('survey')).toBeNull()
    await goToSecondGroup()
    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('김하나')
    expect(screen.getByLabelText('반려견의 이름')).toHaveValue('보리')
    expect(loadDraft('survey')!.submissionId).toBe(APPLY_ID)
  })

  it('이 신청에 묶인 검사지 초안은 이어 쓰고 묶인 신청 ID 를 지킨다', async () => {
    saveSession(session)
    saveDraft('survey', { answers: { q3: '고친 이름' }, groupIndex: 3, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
    render(<SurveyFlow />)

    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[3].title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(loadDraft('survey')).toMatchObject({ groupIndex: 2, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
  })

  it('세션 없이 시작한 검사지 초안은 나중에 신청을 내도 버리지 않고 그대로 이어 쓴다', async () => {
    // 사장님 링크(/survey)로 쓰기 시작한 검사지다. 그 뒤 같은 브라우저에서 신청서를 내서 세션이 생겼다.
    saveDraft('survey', { answers: { q3: '먼저 쓴 이름' }, groupIndex: 3, submissionId: OTHER_ID, key: KEY })
    saveSession(session)
    render(<SurveyFlow />)

    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[3].title })).toBeInTheDocument()
    // 미리 채우기는 새 초안에만 한다. 쓰던 답과 신청 ID 는 그대로다.
    const kept = loadDraft('survey')!
    expect(kept).toEqual({ answers: { q3: '먼저 쓴 이름' }, groupIndex: 3, submissionId: OTHER_ID, key: KEY })
  })

  it('세션 없이 연 검사지는 저장된 초안을 그대로 이어 쓴다', async () => {
    saveDraft('survey', { answers: {}, groupIndex: 2, submissionId: OTHER_ID, key: KEY })
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
  it('/hisshaus/api/survey 에 신청 ID·답·applyId·빈 허니팟을 보낸다', async () => {
    saveSession(session)
    const answers = draftAtLastGroup(APPLY_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, body } = sent()
    expect(url).toBe('/hisshaus/api/survey')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body).toEqual({ submissionId: APPLY_ID, answers, applyId: APPLY_ID, website: '' })
  })

  it('세션 없이 시작한 초안을 신청 뒤에 내면 신청 ID 는 초안의 것, applyId 는 세션의 것이다', async () => {
    const answers = draftAtLastGroup(OTHER_ID)
    saveSession(session)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))

    expect(sent().body).toEqual({ submissionId: OTHER_ID, answers, applyId: APPLY_ID, website: '' })
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

  it('제출이 접수된 뒤에는 화면이 바뀌기 전에 입력이 와도 초안을 다시 저장하지 않는다', async () => {
    saveSession(session)
    draftAtLastGroup(APPLY_ID)
    render(<SurveyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    expect(loadDraft('survey')).toBeNull()

    // 다음 화면이 그려지기 전의 입력이다. 초안이 되살아나면 다음에 검사지를 열 때 낸 검사지가 이어진다.
    const q98 = surveyForm.groups[lastGroup].questions.find((q) => q.id === 'q98')!
    fireEvent.click(within(screen.getByRole('radiogroup', { name: q98.label })).getByRole('radio', { name: '아니오' }))
    expect(loadDraft('survey')).toBeNull()
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
    expect(loadDraft('survey')).toEqual({ answers, groupIndex: lastGroup, submissionId: APPLY_ID, key: KEY })
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

describe('검사지를 낸 뒤 뒤로 가기', () => {
  // 검사지는 신청서의 신청 ID 를 그대로 쓴다. 낸 뒤 뒤로 와 다시 열린 검사지는 지난 검사지와 같은 신청 ID 로 새로 시작하는데,
  // 방문 기록의 지난 칸을 이 검사지의 칸으로 착각하면 위치를 이어받아 빈 검사지에서 뒤로 가기가 뒤 묶음으로 뛴다.
  it('검사지를 낸 뒤 뒤로 와 다시 열린 검사지는 지난 칸을 밟지 않고 한 번에 양식을 떠난다', async () => {
    // 양식 앞 페이지(신청 완료 화면)와, 그 뒤에 새로 쌓인 검사지의 첫 칸.
    history.replaceState({ page: 'apply-done' }, '')
    history.pushState(null, '')
    saveSession(session)
    saveDraft('survey', { answers: validAnswers(surveyForm), groupIndex: 0, submissionId: APPLY_ID, key: OLD_KEY })
    const first = render(<SurveyFlow />)

    // 끝 묶음까지 넘기며(칸 열한 개를 쌓고) 낸다.
    for (let i = 0; i < lastGroup; i++) fireEvent.click(await screen.findByRole('button', { name: '다음' }))
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))

    // Next 가 하는 일: 낸 칸을 완료 화면으로 바꾸고 검사지 화면은 내린다.
    history.replaceState({ page: 'survey-done' }, '')
    first.unmount()

    // 뒤로: 낸 칸 바로 앞의 지난 칸(위치 10)으로 돌아와 검사지가 다시 열린다. 같은 신청 ID 의 새 초안이다.
    await goBack()
    render(<SurveyFlow />)
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
    expect(history.state).toMatchObject({ hhForm: 'survey', hhStep: 0, hhPos: 0 })
    expect(history.state.hhKey).not.toBe(OLD_KEY)

    // 다시 뒤로: 지난 검사지의 칸 열 개를 하나씩 건너뛰고 양식 앞 페이지에서 멈춘다. 묶음은 한 번도 안 바뀌고 초안도 안 쓴다.
    const back = vi.spyOn(history, 'back')
    history.back()
    await waitFor(() => expect(history.state).toEqual({ page: 'apply-done' }))
    expect(back).toHaveBeenCalledTimes(1 + 10)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(surveyForm.groups[0].title)
    expect(loadDraft('survey')).toBeNull()
  })
})
