import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplyFlow } from '../components/ApplyFlow'
import { Done } from '../components/Done'
import { applyForm, TRAINING_SERVICE } from '../forms/apply'
import type { Answers } from '../forms/types'
import { loadDraft, loadSession, saveDraft, saveSession, type ApplySession } from '../lib/draft'
import { isSubmissionId } from '../lib/id'
import { validAnswers } from './fixtures'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const ID = 'Ab3dE5gH7j'
/** 지난 신청서(초안)의 열쇠. 새로 연 신청서는 이것과 다른 열쇠를 만든다. */
const OLD_KEY = 'Kk3dE5gH7j'
/** 이어 쓰는 초안의 열쇠. */
const KEY = 'Qq3dE5gH7j'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })

const groupIndexOf = (id: string) => applyForm.groups.findIndex((g) => g.id === id)
/** 마지막 묶음(예약금 안내)의 번호. validAnswers 는 미용만 고르므로 보이는 묶음은 보호자·반려견·이용 안내·미용·예약금 안내 다섯이다. */
const LAST = groupIndexOf('deposit')
const REQUEST_LABEL = '마지막으로 요청 사항이 있으면 편하게 말씀해주세요!'

/** 그 묶음까지 채운 신청서를 저장소에 둔다. 두 번째로 읽을 답이 어떤 값인지 알 수 있게 값을 정해 둔다. */
function draftAt(groupId: string, over: Answers = {}): Answers {
  const answers: Answers = {
    ...validAnswers(applyForm),
    guardian_name: '김하나',
    guardian_phone: '010-1234-5678',
    pet_name: '보리',
    ...over,
  }
  saveDraft('apply', { answers, groupIndex: groupIndexOf(groupId), submissionId: ID, key: KEY })
  return answers
}

/** 마지막 묶음에서 보내기만 남은 신청서를 저장소에 둔다. */
const draftAtLastGroup = (over: Answers = {}) => draftAt('deposit', over)

const submitButton = () => screen.findByRole('button', { name: '신청하기' })

/** 첫 fetch 호출의 주소·옵션·본문. */
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('신청서를 열 때', () => {
  it('저장된 초안이 없으면 새 신청 ID 로 첫 묶음부터 연다', async () => {
    render(<ApplyFlow />)
    expect(await screen.findByRole('heading', { level: 2, name: '보호자 정보' })).toBeInTheDocument()
    // 서비스를 고르기 전에는 서비스별 묶음이 하나도 끼지 않는다.

    // 입력하면 초안이 저장되고, 그 신청 ID 는 브라우저가 만든 10자다.
    fireEvent.change(screen.getByLabelText('보호자 성함'), { target: { value: '김하나' } })
    const saved = loadDraft('apply')!
    expect(saved.answers).toEqual({ guardian_name: '김하나' })
    expect(saved.groupIndex).toBe(0)
    expect(isSubmissionId(saved.submissionId)).toBe(true)
    // 방문 기록 칸의 주인을 가리는 열쇠는 신청 ID 와 별개로 만든다.
    expect(isSubmissionId(saved.key)).toBe(true)
    expect(saved.key).not.toBe(saved.submissionId)
  })

  it('저장된 초안이 있으면 그 묶음과 답으로 이어 쓴다', async () => {
    saveDraft('apply', { answers: { guardian_name: '김하나' }, groupIndex: 1, submissionId: ID, key: KEY })
    render(<ApplyFlow />)
    expect(await screen.findByRole('heading', { level: 2, name: '반려견 정보' })).toBeInTheDocument()

    // 이어 쓰는 동안 신청 ID 는 그대로다.
    fireEvent.change(screen.getByLabelText('반려견 이름'), { target: { value: '보리' } })
    expect(loadDraft('apply')).toEqual({
      answers: { guardian_name: '김하나', pet_name: '보리' },
      groupIndex: 1,
      submissionId: ID,
      key: KEY,
    })
  })

  it('첫 묶음의 이전은 첫 화면으로 보낸다', async () => {
    render(<ApplyFlow />)
    fireEvent.click(await screen.findByRole('button', { name: '이전' }))
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('오늘 날짜는 빌드 때가 아니라 열 때 구한다', async () => {
    // 모듈을 읽은 뒤에 시계를 옮긴다. 읽을 때 굳은 날짜라면 희망 날짜 12월 24일이 아직 미래로 보인다.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-25T10:00:00+09:00'))
    draftAt('grooming', { groom_date: '2026-12-24' })
    render(<ApplyFlow />)

    const next = await screen.findByRole('button', { name: '다음' })
    expect(next).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(next)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('희망 예약 날짜'))
    expect(document.querySelector('[data-date="2026-12-24"]')).toBeDisabled()
    expect(document.querySelector('[data-date="2026-12-25"]')).not.toBeDisabled()
  })

  it('서버에서 그릴 때는 저장소를 읽지 않고 아무것도 그리지 않는다', () => {
    draftAtLastGroup()
    const read = vi.spyOn(Storage.prototype, 'getItem')
    expect(renderToString(<ApplyFlow />)).toBe('')
    expect(read).not.toHaveBeenCalled()
  })

  it('완료 화면에서 돌아와 신청서가 다시 열려도 세션은 남는다', async () => {
    const before: ApplySession = {
      submissionId: ID,
      guardianName: '김하나',
      guardianPhone: '010-1234-5678',
      petName: '보리',
      services: ['Grooming 미용'],
      wish: '1월 1일 (목) 오전',
      training: false,
    }
    saveSession(before)
    render(<ApplyFlow />)
    await screen.findByRole('heading', { level: 2, name: '보호자 정보' })
    // 앞으로 가기로 완료 화면에 다시 닿아도 세션을 읽을 수 있어야 한다.
    expect(loadSession()).toEqual(before)
  })
})

describe('제출', () => {
  it('제출 성공이면 세션을 저장하고 완료로 간다', async () => {
    draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
    expect(loadSession()).toEqual({
      submissionId: ID,
      guardianName: '김하나',
      guardianPhone: '010-1234-5678',
      petName: '보리',
      services: ['Grooming 미용'],
      // 2099-01-01 은 목요일이다. 시간대는 선택이라 비어 있다.
      wish: '1월 1일 (목)',
      training: false,
    })
    // 접수된 신청서 초안은 지운다.
    expect(loadDraft('apply')).toBeNull()
    // 보낸 화면으로 뒤로 가기 한 번에 돌아오지 않게 방문 기록을 바꿔 쓴다.
    expect(router.push).not.toHaveBeenCalled()
  })

  it('제출이 접수된 뒤에는 화면이 바뀌기 전에 입력이 와도 초안을 다시 저장하지 않는다', async () => {
    draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
    expect(loadDraft('apply')).toBeNull()

    // 실제 Next 도 다음 화면이 그려지기 전까지는 이 화면이 입력·뒤로 가기를 받는다(여기서는 가짜 router 라 그대로 떠 있다).
    // 그때 초안을 다시 저장하면 다음에 신청서를 열 때 낸 신청이 되살아나 같은 신청 ID 로 또 보내게 된다.
    fireEvent.change(screen.getByLabelText(REQUEST_LABEL), { target: { value: '늦게 적은 요청' } })
    expect(loadDraft('apply')).toBeNull()
  })

  it('교육미용을 골라도 검사지로 이어지지 않고 완료로 간다(검사지는 입금 확인 뒤 링크로 받는다)', async () => {
    draftAtLastGroup({ services: ['Grooming 미용', TRAINING_SERVICE] })
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
    expect(loadSession()).toMatchObject({
      services: ['Grooming 미용', TRAINING_SERVICE],
      training: true,
    })
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('/hisshaus/api/apply 에 신청 ID·답·빈 허니팟을 JSON 으로 보낸다', async () => {
    const answers = draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init, body } = sent()
    expect(url).toBe('/hisshaus/api/apply')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(body).toEqual({ submissionId: ID, answers, website: '' })
  })

  it('답은 StepForm 이 거른 그대로 보낸다 — 양식에 없는 키는 실리지 않는다', async () => {
    draftAtLastGroup({ 지난_버전의_문항: '남은 값' })
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(sent().body.answers).not.toHaveProperty('지난_버전의_문항')
  })

  it('보내는 시간에 35초 제한을 건다', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())

    expect(timeout).toHaveBeenCalledWith(35_000)
    expect(sent().init.signal).toBeInstanceOf(AbortSignal)
  })

  it('503 이면 failed 로 입력이 남는다', async () => {
    const answers = draftAtLastGroup({ request: '문 앞에서 기다릴게요' })
    fetchMock.mockResolvedValue(reply(503, { ok: false }))
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadSession()).toBeNull()
    // 초안도 입력도 그대로고 다시 보낼 수 있다.
    expect(loadDraft('apply')).toEqual({ answers, groupIndex: LAST, submissionId: ID, key: KEY })
    expect(screen.getByLabelText(REQUEST_LABEL)).toHaveValue('문 앞에서 기다릴게요')
    expect(screen.getByRole('button', { name: '신청하기' })).toBeEnabled()
  })

  it('본문이 빈 500 도 failed 다', async () => {
    draftAtLastGroup()
    fetchMock.mockResolvedValue(reply(500))
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it.each([
    ['네트워크 오류', new TypeError('Failed to fetch')],
    ['시간 초과', new DOMException('The operation timed out.', 'TimeoutError')],
  ])('제출이 시간 초과·네트워크 오류면 failed 다 — %s', async (_name, error) => {
    const answers = draftAtLastGroup()
    fetchMock.mockRejectedValue(error)
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadSession()).toBeNull()
    expect(loadDraft('apply')?.answers).toEqual(answers)
  })

  it('실패한 뒤 다시 보내도 같은 신청 ID 로 간다', async () => {
    draftAtLastGroup()
    fetchMock.mockResolvedValueOnce(reply(503, { ok: false }))
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: '신청하기' }))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string).submissionId)
    expect(ids).toEqual([ID, ID])
  })

  it('400 이면 invalid 로 보고 입력을 다시 확인하라고 안내한다', async () => {
    draftAtLastGroup()
    fetchMock.mockResolvedValue(reply(400, { ok: false, errors: [] }))
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())

    // 화면에서 오류를 못 찾으면 위쪽 안내로 알린다.
    expect(await screen.findByRole('alert')).toHaveTextContent('입력한 내용을 다시 확인해 주세요.')
    expect(router.replace).not.toHaveBeenCalled()
    expect(loadSession()).toBeNull()
  })
})

describe('허니팟', () => {
  it('허니팟은 사람 눈에 안 보이고 양식 밖에 있는 이름 없는 입력이다', async () => {
    render(<ApplyFlow />)
    await screen.findByRole('heading', { level: 2 })
    const field = honeypot()
    expect(field).toBeInTheDocument()
    expect(field).not.toHaveAttribute('name')
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('tabindex', '-1')
    // 보조 기기에 읽히지 않고, 화면 밖에 둔다.
    expect(field).toHaveAttribute('aria-hidden', 'true')
    expect(field.style.position).toBe('absolute')
    expect(field.style.left).toBe('-9999px')
    // 묶음 화면 안에 들어 있지 않다.
    expect(document.querySelector('[data-group]')!.contains(field)).toBe(false)
  })

  it('허니팟은 빈 값으로 간다', async () => {
    draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(sent().body.website).toBe('')
  })

  it('허니팟에 값이 들어 있으면 보낼 때 읽어서 싣는다', async () => {
    draftAtLastGroup()
    render(<ApplyFlow />)
    const submit = await submitButton()
    fireEvent.change(honeypot(), { target: { value: 'https://spam.example' } })
    fireEvent.click(submit)
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(sent().body.website).toBe('https://spam.example')
  })
})

describe('세션', () => {
  it('다음 신청을 보내면 세션이 새 신청으로 바뀐다', async () => {
    saveSession({
      submissionId: 'Zz9Yy8Xx7W',
      guardianName: '지난 보호자',
      guardianPhone: '010-0000-0000',
      petName: '지난 아이',
      services: ['Hotel 호텔'],
      wish: '1월 1일 (목) 오후',
      training: true,
    })
    draftAtLastGroup()
    render(<ApplyFlow />)
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))

    expect(loadSession()).toEqual(expect.not.objectContaining({ surveyDone: expect.anything() }))
    expect(loadSession()).toMatchObject({ submissionId: ID, petName: '보리', training: false })
  })

  it('저장소가 막혀도 제출이 성공하면 완료 화면이 방금 저장한 세션을 읽는다', async () => {
    draftAtLastGroup()
    render(<ApplyFlow />)
    const submit = await submitButton()
    // 초안을 읽은 뒤에 저장소가 닫힌 것처럼 한다.
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    fireEvent.click(submit)
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))

    const { unmount } = render(<Done />)
    expect(await screen.findByRole('heading', { level: 1, name: '보리의 신청서가 잘 도착했어요' })).toBeInTheDocument()
    expect(screen.getByText('Grooming 미용 · 1월 1일 (목) 희망')).toBeInTheDocument()
    expect(router.replace).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('신청을 낸 뒤 뒤로 가기', () => {
  it('신청을 낸 뒤 뒤로 와 다시 열린 신청서는 지난 칸을 건너뛰어 한 번에 양식을 떠난다', async () => {
    // 양식 앞 페이지(첫 화면)와, 그 뒤에 새로 쌓인 신청서의 첫 칸.
    history.replaceState({ page: 'landing' }, '')
    history.pushState(null, '')
    saveDraft('apply', { answers: validAnswers(applyForm), groupIndex: 0, submissionId: ID, key: OLD_KEY })
    const first = render(<ApplyFlow />)

    // 끝 묶음까지 넘기며(보호자→반려견→반려견 건강→이용 안내→미용→예약금 안내, 칸 다섯을 쌓고) 낸다.
    for (let i = 0; i < 5; i++) fireEvent.click(await screen.findByRole('button', { name: '다음' }))
    fireEvent.click(await submitButton())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))

    // Next 가 하는 일: 낸 칸을 완료 화면으로 바꾸고 신청서 화면은 내린다.
    history.replaceState({ page: 'apply-done' }, '')
    first.unmount()

    // 뒤로: 낸 칸 바로 앞의 지난 칸(위치 1)으로 돌아와 신청서가 다시 열린다. 새 신청이다.
    await goBack()
    render(<ApplyFlow />)
    expect(await screen.findByRole('heading', { level: 2, name: '보호자 정보' })).toBeInTheDocument()
    expect(history.state).toMatchObject({ hhForm: 'apply', hhStep: 0, hhPos: 0 })
    expect(history.state.hhKey).not.toBe(OLD_KEY)

    // 다시 뒤로: 지난 신청서의 남은 칸 넷(이용 안내·반려견 건강·반려견·보호자)을 하나씩 건너뛰고 양식 앞 페이지에서 멈춘다. 묶음도 초안도 그대로다.
    const back = vi.spyOn(history, 'back')
    history.back()
    await waitFor(() => expect(history.state).toEqual({ page: 'landing' }))
    expect(back).toHaveBeenCalledTimes(1 + 4)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('보호자')
    expect(loadDraft('apply')).toBeNull()
  })
})
