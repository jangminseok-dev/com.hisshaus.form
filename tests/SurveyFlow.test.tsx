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

/** 링크의 신청 ID 와 링크. 화면은 링크를 확인하지 않는다(서버가 확인하고 넘긴다). */
const APPLY_ID = 'Ab3dE5gH7j'
const TOKEN = `${APPLY_ID}-${'0'.repeat(32)}`
const OTHER_ID = 'Zz9Yy8Xx7W'
/** 지난 검사지(초안)의 열쇠. */
const OLD_KEY = 'Kk3dE5gH7j'
/** 이어 쓰는 초안의 열쇠. */
const KEY = 'Qq3dE5gH7j'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'
const CONFIRM = '제출하면 답을 고칠 수 없어요. 제출할까요?'
const CLOSED = '이미 제출된 검사지예요'

const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })

/** 같은 기기에 남은 신청 세션. 검사지는 이것을 읽지도 쓰지도 않는다. */
const session: ApplySession = {
  submissionId: APPLY_ID,
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용', TRAINING_SERVICE],
  wish: '10월 28일 (수) 오전',
  training: true,
}

const lastGroup = surveyForm.groups.length - 1
const q2 = surveyForm.groups[0].questions.find((q) => q.id === 'q2')!

const open = () => render(<SurveyFlow applyId={APPLY_ID} token={TOKEN} />)

/** 마지막 묶음에서 제출만 남은, 이 링크의 검사지를 저장소에 둔다. */
function draftAtLastGroup(over: Answers = {}): Answers {
  const answers: Answers = { ...validAnswers(surveyForm), ...over }
  saveDraft('survey', { answers, groupIndex: lastGroup, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
  return answers
}

/** 마지막 묶음의 제출하기 → 확인 창의 제출하기. */
async function submitWithConfirm() {
  fireEvent.click(await screen.findByRole('button', { name: '제출하기' }))
  const dialog = screen.getByRole('alertdialog', { name: CONFIRM })
  fireEvent.click(within(dialog).getByRole('button', { name: '제출하기' }))
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
  history.replaceState(null, '', `/hisshaus/survey/${TOKEN}`)
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
  it('초안이 없으면 첫 묶음부터 열고, 새 초안의 신청 ID 는 링크의 신청 ID 다', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.co' } })

    const saved = loadDraft('survey')!
    expect(saved.submissionId).toBe(APPLY_ID)
    expect(saved.applyId).toBe(APPLY_ID)
    // 방문 기록 칸의 주인은 새 초안마다 만드는 열쇠로 가린다.
    expect(isSubmissionId(saved.key)).toBe(true)
    expect(saved.key).not.toBe(APPLY_ID)
    expect(saved).toMatchObject({ groupIndex: 0, answers: { q1: 'a@b.co' } })
  })

  it('같은 기기에 신청 세션이 있어도 미리 채우지 않고 세션을 건드리지 않는다', async () => {
    saveSession(session)
    open()
    await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@b.co' } })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: q2.label })).getByRole('radio', { name: '동의함' }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByRole('heading', { level: 2, name: surveyForm.groups[1].title })
    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('')
    expect(screen.getByLabelText('의뢰인 연락처')).toHaveValue('')
    expect(screen.getByLabelText('반려견의 이름')).toHaveValue('')
    expect(loadSession()).toEqual(session)
  })

  it('이 링크(신청 ID)의 초안은 쓰던 묶음과 답으로 이어 쓴다', async () => {
    saveDraft('survey', { answers: { q1: 'a@b.co', q2: '동의함', q3: '김하나' }, groupIndex: 1, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
    open()
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[1].title })).toBeInTheDocument()
    expect(screen.getByLabelText('의뢰인 성함')).toHaveValue('김하나')
  })

  it.each([
    ['다른 신청의 초안', OTHER_ID],
    ['신청 ID 가 없는 옛 흐름의 초안', undefined],
  ])('%s 은 버리고 새로 시작한다', async (_label, applyId) => {
    saveDraft('survey', { answers: { q1: 'old@b.co' }, groupIndex: 3, submissionId: OTHER_ID, key: OLD_KEY, applyId })
    open()
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue('')
    expect(loadDraft('survey')).toBeNull()
  })

  it('옛 초안에 글 칸이던 문항의 글이 남아 있어도 열 때 버려서 "고를 수 없는 값" 이 뜨지 않는다', async () => {
    // q66 은 글 칸이었다가 네/아니오 칩이 됐다. 그 전에 저장된 초안이다.
    saveDraft('survey', { answers: { q66: '없음', q3: '김하나' }, groupIndex: 6, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
    open()
    await screen.findByRole('heading', { level: 2 })
    expect(screen.queryByText('고를 수 없는 값이에요')).not.toBeInTheDocument()
    const q66 = document.querySelector<HTMLElement>('[data-question="q66"]')!
    fireEvent.click(within(q66).getByRole('radio', { name: '네' }))
    expect(loadDraft('survey')?.answers).toMatchObject({ q66: '네', q3: '김하나' })
  })

  it('첫 묶음의 이전은 막혀 있다(링크로 들어와 돌아갈 곳이 없다)', async () => {
    open()
    await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })

  it('이 기기에서 이 링크의 검사지를 이미 냈으면 문항 대신 닫힌 안내를 보인다', async () => {
    draftAtLastGroup()
    const first = open()
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))

    // 완료 화면에서 뒤로 오면 Next 가 캐시해 둔 이 화면이 다시 열린다.
    first.unmount()
    open()
    expect(await screen.findByRole('heading', { level: 1, name: CLOSED })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument()
    expect(loadDraft('survey')).toBeNull()
  })

  it('다른 링크의 검사지를 낸 기기에서도 이 링크는 열린다', async () => {
    saveDraft('survey', { answers: validAnswers(surveyForm), groupIndex: lastGroup, submissionId: OTHER_ID, key: KEY, applyId: OTHER_ID })
    const other = render(<SurveyFlow applyId={OTHER_ID} token={`${OTHER_ID}-${'1'.repeat(32)}`} />)
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))

    other.unmount()
    open()
    expect(await screen.findByRole('heading', { level: 2, name: surveyForm.groups[0].title })).toBeInTheDocument()
  })

  it('서버에서 그릴 때는 저장소를 읽지 않고 아무것도 그리지 않는다', () => {
    draftAtLastGroup()
    const read = vi.spyOn(Storage.prototype, 'getItem')
    expect(renderToString(<SurveyFlow applyId={APPLY_ID} token={TOKEN} />)).toBe('')
    expect(read).not.toHaveBeenCalled()
  })
})

describe('검사지 제출', () => {
  it('제출하기는 확인 창을 거친다 — 다시 볼게요면 보내지 않는다', async () => {
    draftAtLastGroup()
    open()
    fireEvent.click(await screen.findByRole('button', { name: '제출하기' }))
    const dialog = screen.getByRole('alertdialog', { name: CONFIRM })
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 볼게요' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('/hisshaus/api/survey 에 링크·답·빈 허니팟만 보낸다(신청 ID 는 서버가 링크에서 꺼낸다)', async () => {
    const answers = draftAtLastGroup()
    open()
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, body } = sent()
    expect(url).toBe('/hisshaus/api/survey')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body).toEqual({ token: TOKEN, answers, website: '' })
  })

  it('제출 성공이면 초안을 지우고 완료로 간다 — 세션은 그대로다', async () => {
    saveSession(session)
    draftAtLastGroup()
    open()
    await submitWithConfirm()

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    expect(loadDraft('survey')).toBeNull()
    expect(loadSession()).toEqual(session)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('제출이 접수된 뒤에는 화면이 바뀌기 전에 입력이 와도 초안을 다시 저장하지 않는다', async () => {
    draftAtLastGroup()
    open()
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    expect(loadDraft('survey')).toBeNull()

    const q98 = surveyForm.groups[lastGroup].questions.find((q) => q.id === 'q98')!
    fireEvent.click(within(screen.getByRole('radiogroup', { name: q98.label })).getByRole('radio', { name: '아니오' }))
    expect(loadDraft('survey')).toBeNull()
  })

  it('503 이면 failed 로 입력과 초안이 남고, 닫힌 표시도 남기지 않는다', async () => {
    const answers = draftAtLastGroup()
    fetchMock.mockResolvedValue(reply(503, { ok: false }))
    const first = open()
    await submitWithConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadDraft('survey')).toEqual({ answers, groupIndex: lastGroup, submissionId: APPLY_ID, key: KEY, applyId: APPLY_ID })
    expect(screen.getByRole('button', { name: '제출하기' })).toBeEnabled()

    first.unmount()
    open()
    expect(await screen.findByRole('button', { name: '제출하기' })).toBeInTheDocument()
  })

  it.each([
    ['네트워크 오류', new TypeError('Failed to fetch')],
    ['시간 초과', new DOMException('The operation timed out.', 'TimeoutError')],
  ])('제출이 시간 초과·네트워크 오류면 failed 다 — %s', async (_name, error) => {
    draftAtLastGroup()
    fetchMock.mockRejectedValue(error)
    open()
    await submitWithConfirm()

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadDraft('survey')).not.toBeNull()
  })

  it('허니팟은 양식 밖의 이름 없는 숨은 입력이고 보낼 때 읽는다', async () => {
    draftAtLastGroup()
    open()
    await screen.findByRole('button', { name: '제출하기' })
    const field = honeypot()
    expect(field).not.toHaveAttribute('name')
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('tabindex', '-1')
    expect(document.querySelector('[data-group]')!.contains(field)).toBe(false)

    fireEvent.change(field, { target: { value: 'https://spam.example' } })
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(sent().body.website).toBe('https://spam.example')
  })
})

describe('검사지를 낸 뒤 뒤로 가기', () => {
  it('완료 화면에서 뒤로 오면 닫힌 안내를 보이고, 다시 뒤로 가면 낸 검사지의 칸을 건너뛰어 링크 앞 페이지로 간다', async () => {
    // 링크 앞 페이지, 그 뒤 검사지가 묶음마다 쌓은 칸 셋(위치 0~2). 마지막 칸은 완료 화면이 고쳐 썼다.
    history.replaceState({ page: 'before' }, '')
    for (let pos = 0; pos < 3; pos++) history.pushState({ hhForm: 'survey', hhKey: KEY, hhStep: pos, hhPos: pos }, '')
    history.pushState({ page: 'survey-done' }, '')
    draftAtLastGroup()
    const first = open()
    await submitWithConfirm()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/survey/done'))
    first.unmount()

    // 뒤로: 낸 검사지의 마지막 칸. 닫힌 안내가 보인다(그 자리에서 바로 건너뛰지 않는다).
    await goBack()
    open()
    expect(await screen.findByRole('heading', { level: 1, name: CLOSED })).toBeInTheDocument()
    expect(history.state).toMatchObject({ hhForm: 'survey', hhPos: 2 })

    // 다시 뒤로: 낸 검사지의 칸 둘을 건너뛰고 링크 앞 페이지에서 멈춘다.
    const back = vi.spyOn(history, 'back')
    history.back()
    await waitFor(() => expect(history.state).toEqual({ page: 'before' }))
    expect(back).toHaveBeenCalledTimes(1 + 2)
  })
})
