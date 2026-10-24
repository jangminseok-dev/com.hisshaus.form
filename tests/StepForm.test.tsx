import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StepForm, type StepFormProps } from '../components/StepForm'
import { applyForm, GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { allQuestions, visibleAnswers } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef } from '../forms/types'
import type { Draft } from '../lib/draft'
import { validAnswers } from './fixtures'

const TODAY = '2026-10-23'
const ID = 'Ab3dE5gH7j'
/** 이 초안의 열쇠. 방문 기록 칸이 어느 초안의 것인지 가린다. */
const KEY = 'Kk3dE5gH7j'
/** 지난 초안이 남긴 칸의 열쇠. */
const OLD_KEY = 'Zz9Yy8Xx7W'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const GUARDIAN: Answers = { guardian_name: '김하나', guardian_phone: '010-1234-5678', privacy_consent: '동의' }

const draft = (groupIndex = 0, answers: Answers = {}): Draft => ({ answers, groupIndex, submissionId: ID, key: KEY })
const groupIndexOf = (form: FormDef, id: string) => form.groups.findIndex((g) => g.id === id)
const question = (form: FormDef, id: string) => allQuestions(form).find((q) => q.id === id)!
/** 신청서의 마지막 묶음(예약금 안내). validAnswers 는 미용만 고르므로 보이는 묶음은 보호자·반려견·이용 안내·미용·예약금 안내 다섯이다. */
const LAST = groupIndexOf(applyForm, 'deposit')
const GROOMING = groupIndexOf(applyForm, 'grooming')
const HOTEL = groupIndexOf(applyForm, 'hotel')
const REQUEST_LABEL = question(applyForm, 'request').label
const SERVICES_LABEL = question(applyForm, 'services').label

function setup(over: Partial<Omit<StepFormProps, 'onDraft' | 'onSubmit'>> = {}) {
  const onDraft = vi.fn<StepFormProps['onDraft']>()
  const onSubmit = vi.fn<StepFormProps['onSubmit']>().mockResolvedValue('ok')
  const onBackFromFirst = vi.fn()
  const view = render(
    <StepForm
      form={applyForm}
      initial={draft()}
      today={TODAY}
      submitLabel="신청하기"
      onDraft={onDraft}
      onSubmit={onSubmit}
      onBackFromFirst={onBackFromFirst}
      {...over}
    />,
  )
  return { ...view, onDraft, onSubmit, onBackFromFirst }
}

/** 묶음 컨테이너(data-group)와 버튼(data-action). */
const groupId = () => document.querySelector<HTMLElement>('[data-group]')!.dataset.group
const action = (name: 'next' | 'submit' | 'back') => document.querySelector<HTMLElement>(`[data-action="${name}"]`)!
const isBlocked = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true'
const box = (id: string) => document.querySelector<HTMLElement>(`[data-question="${id}"]`)!

const write = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
/** 달력을 열어 날짜를 고른다('' 면 지운다). 테스트의 오늘(10-23)이 든 달이나 다음 달 날짜만 쓴다. */
const pickDate = (label: string, date: string) => {
  fireEvent.click(screen.getByLabelText(label))
  if (date === '') {
    fireEvent.click(screen.getByRole('button', { name: '날짜 지우기' }))
    return
  }
  if (!document.querySelector(`[data-date="${date}"]:not([data-outside])`)) fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
  fireEvent.click(document.querySelector(`[data-date="${date}"]`)!)
}
const chooseOne = (label: string, option: string) =>
  fireEvent.click(within(screen.getByRole('radiogroup', { name: label })).getByRole('radio', { name: option }))
const chooseMany = (label: string, option: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: label })).getByRole('checkbox', { name: option }))
const fillGuardian = () => {
  write('보호자 성함', '김하나')
  write('보호자 연락처', '010-1234-5678')
  fireEvent.click(screen.getByLabelText('개인정보 수집·이용 동의'))
}

/** scrollIntoView 가 불린 요소들(불린 순서). */
const scrolledTo = () => vi.mocked(Element.prototype.scrollIntoView).mock.contexts

/** StepForm 이 방문 기록 칸에 적는 state. 같은 양식·같은 초안(열쇠)의 step 번째 묶음이 pos 번째 칸이다. */
const entry = (step: number, pos: number, over: Record<string, unknown> = {}) => ({
  hhForm: 'apply',
  hhKey: KEY,
  hhStep: step,
  hhPos: pos,
  ...over,
})
const popstate = (state: unknown) => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state })))

/** 테스트가 풀어 줄 때까지 끝나지 않는 Promise. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  // 앞 테스트가 쌓은 방문 기록 칸의 값이 이 테스트의 시작 상태에 섞이지 않게 한다.
  history.replaceState(null, '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('화면 틀', () => {
  it('얼마나 왔는지는 숫자·막대 대신 말로 알린다 — 절반 넘게·거의 다·마지막, 앞쪽에서는 없다', () => {
    // 검사지 12묶음: 1~6 없음, 7~10 '절반 넘게 왔어요', 11 '거의 다 왔어요', 12 '마지막 화면이에요'.
    const expectPace = (idx: number, text: string | null) => {
      const view = setup({ form: surveyForm, initial: draft(idx, validAnswers(surveyForm)), submitLabel: '제출하기' })
      const found = screen.queryByText(/절반 넘게 왔어요|거의 다 왔어요|마지막 화면이에요/)
      expect(found?.textContent ?? null).toBe(text)
      view.unmount()
    }
    expectPace(0, null)
    expectPace(5, null)
    expectPace(6, '절반 넘게 왔어요')
    expectPace(9, '절반 넘게 왔어요')
    expectPace(10, '거의 다 왔어요')
    expectPace(11, '마지막 화면이에요')
    // 숫자 진행 표시는 여전히 없다.
    setup({ form: surveyForm, initial: draft(11, validAnswers(surveyForm)), submitLabel: '제출하기' })
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  })

  it('양식 제목은 보조 기기용 h1 로 있다', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('예약 신청')
  })

  it('위 막대에 이전 버튼과 묶음 제목만 있고 진행 표시(k / N·막대)는 없다', () => {
    setup()
    expect(screen.getByRole('button', { name: '이전' })).toBe(action('back'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('보호자')
    expect(groupId()).toBe('guardian')
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  })

  it('묶음에 note 가 있으면 제목 아래에 보인다', () => {
    setup({ initial: draft(groupIndexOf(applyForm, 'training'), { services: [TRAINING_SERVICE] }) })
    const note = screen.getByText(/교육에 대한 자세한 안내는 따로 연락드려요/)
    const title = screen.getByRole('heading', { level: 2 })
    expect(title.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('note 가 없는 묶음에는 note 자리가 없다', () => {
    setup()
    expect(screen.queryByText(/따로 연락드려요/)).not.toBeInTheDocument()
  })

  it('검사지 화면에 전체 문항 수나 시간을 적지 않는다', () => {
    setup({ form: surveyForm, submitLabel: '제출하기' })
    const frame = [
      screen.getByRole('heading', { level: 2 }).parentElement!.textContent,
      action('next').textContent,
    ].join(' ')
    expect(frame).not.toMatch(/문항|소요|분/)
  })

  it('묶음의 문항을 순서대로 그린다', () => {
    setup({ initial: draft(1) })
    expect(Array.from(document.querySelectorAll('[data-question]')).map((e) => e.getAttribute('data-question'))).toEqual(
      applyForm.groups[1].questions.map((q) => q.id),
    )
  })

  it('localStorage 를 직접 만지지 않는다', () => {
    const touched = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
    ]
    setup()
    fillGuardian()
    fireEvent.click(action('next'))
    for (const spy of touched) expect(spy).not.toHaveBeenCalled()
  })
})

describe('다음·검증', () => {
  it('첫 묶음에서 필수를 비우면 버튼이 비활성이고 누르면 오류가 보인다', () => {
    setup()
    const next = action('next')
    expect(isBlocked(next)).toBe(true)
    // 진짜 disabled 가 아니라서 누를 수 있다.
    expect(next).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(next)

    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      '꼭 적어 주세요',
      '꼭 적어 주세요',
      '동의해야 신청할 수 있어요',
    ])
    expect(groupId()).toBe('guardian')
    // 첫 오류 문항으로 가서 그 입력에 포커스가 간다.
    expect(scrolledTo()).toHaveLength(1)
    expect(scrolledTo()[0]).toBe(box('guardian_name'))
    expect(screen.getByLabelText('보호자 성함')).toHaveFocus()
  })

  it('필수를 채우면 다음 묶음으로 가고 onDraft 가 불린다', () => {
    const { onDraft } = setup()
    fillGuardian()
    // 입력마다 초안이 나간다.
    expect(onDraft).toHaveBeenCalledTimes(3)
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })

    const next = action('next')
    expect(isBlocked(next)).toBe(false)
    fireEvent.click(next)

    expect(groupId()).toBe('pet')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('반려견')
    expect(onDraft).toHaveBeenCalledTimes(4)
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 1, submissionId: ID, key: KEY })
  })

  it('필드 오류는 넘어가려 하기 전에는 숨고, 그 뒤에는 고치는 대로 사라진다', () => {
    setup()
    write('보호자 성함', '김하나')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.click(action('next'))
    expect(screen.getAllByRole('alert')).toHaveLength(2)

    write('보호자 연락처', '010-1234-5678')
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['동의해야 신청할 수 있어요'])
  })

  it('묶음이 바뀌면 오류 표시가 꺼진다', () => {
    setup()
    fireEvent.click(action('next'))
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)

    fillGuardian()
    fireEvent.click(action('next'))
    expect(groupId()).toBe('pet')
    // 새 묶음은 비어 있어도 사용자가 넘어가려 하기 전에는 오류를 보이지 않는다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(isBlocked(action('next'))).toBe(true)
  })

  it('희망 날짜가 오늘 이전이면 화면이 막는다', () => {
    const answers = { ...validAnswers(applyForm), groom_date: '2026-10-22' }
    setup({ initial: draft(GROOMING, answers) })
    expect(groupId()).toBe('grooming')
    expect(isBlocked(action('next'))).toBe(true)
    fireEvent.click(action('next'))
    expect(groupId()).toBe('grooming')
    expect(within(box('groom_date')).getByRole('alert')).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
  })

  it('오늘 날짜가 달력에 전해져 오늘 이전은 누를 수 없다', () => {
    setup({ initial: draft(GROOMING, { services: [GROOMING_SERVICE] }) })
    fireEvent.click(screen.getByLabelText('희망 예약 날짜'))
    expect(document.querySelector('[data-date="2026-10-22"]')).toBeDisabled()
    expect(document.querySelector('[data-date="2026-10-23"]')).not.toBeDisabled()
  })
})

describe('서비스별 묶음', () => {
  /** 이용 안내 묶음에서 시작한다. 보호자·반려견은 채워져 있고 서비스는 아직 고르지 않았다. */
  const atVisit = () => {
    const answers = validAnswers(applyForm)
    delete answers.services
    return setup({ initial: draft(groupIndexOf(applyForm, 'visit'), answers) })
  }

  it('서비스를 둘 고르면 그 두 묶음만 정의 순서로 이어진다', () => {
    atVisit()

    chooseMany(SERVICES_LABEL, HOTEL_SERVICE)
    chooseMany(SERVICES_LABEL, GROOMING_SERVICE)
    expect(action('next')).not.toBeNull()

    // 고른 순서(호텔→미용)가 아니라 정의 순서(미용→호텔)다.
    fireEvent.click(action('next'))
    expect(groupId()).toBe('grooming')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Grooming 미용')
    // 미용 날짜는 validAnswers 가 이미 채웠다(미용은 기본으로 고른 서비스).

    fireEvent.click(action('next'))
    expect(groupId()).toBe('hotel')
    // 2026-11-03 은 화요일(10:00~15:30), 2026-11-05 는 목요일이다.
    pickDate('체크인 날짜', '2026-11-03')
    chooseOne('체크인 시간', '오후 3:00')
    pickDate('체크아웃 날짜', '2026-11-05')
    chooseOne('체크아웃 시간', '오전 11:00')

    fireEvent.click(action('next'))
    expect(groupId()).toBe('deposit')
    expect(action('submit')).toHaveTextContent('신청하기')
    expect(action('next')).toBeNull()
  })

  it('고르지 않은 서비스의 묶음은 건너뛴다', () => {
    atVisit()
    chooseMany(SERVICES_LABEL, TRAINING_SERVICE)

    // 미용·데이케어·호텔을 건너 교육미용으로, 그 뒤는 바로 예약금 안내다.
    fireEvent.click(action('next'))
    expect(groupId()).toBe('training')
    pickDate('교육미용 희망 날짜', '2026-11-05')
    fireEvent.click(action('next'))
    expect(groupId()).toBe('deposit')
  })

  it('복원된 묶음 번호가 숨은 묶음을 가리키면 그 앞의 가장 가까운 보이는 묶음으로 맞춘다 — 안 본 필수 묶음을 건너뛰지 않는다', () => {
    // 데이케어 묶음에서 저장된 초안인데 지금 답은 미용만 골랐다(옛 버전이 남긴 초안이거나 손으로 고친 값).
    const first = setup({ initial: draft(groupIndexOf(applyForm, 'daycare'), validAnswers(applyForm)) })
    expect(groupId()).toBe('grooming')
    expect(history.state).toMatchObject(entry(GROOMING, 0))
    // 맞추기만 했을 뿐 사용자가 한 일이 아니니 초안을 내보내지 않는다.
    expect(first.onDraft).not.toHaveBeenCalled()
    first.unmount()

    // 호텔만 골랐으면 미용 묶음 번호는 그 앞의 이용 안내로. 다음을 누르면 호텔 묶음이 정상 순서로 나온다.
    setup({ initial: draft(GROOMING, { ...validAnswers(applyForm), services: [HOTEL_SERVICE] }) })
    expect(groupId()).toBe('visit')
    expect(history.state).toMatchObject(entry(groupIndexOf(applyForm, 'visit'), 0))
  })

  it('앞으로 가기로 숨은 묶음의 칸에 닿으면 지금 묶음 다음의 보이는 묶음으로 간다 — 안 본 필수 묶음을 건너뛰지 않는다', () => {
    // 호텔만 골라 호텔 묶음까지 갔다가 뒤로 와서 호텔을 빼고 미용을 골랐다. 앞 칸은 여전히 호텔 묶음을 가리킨다.
    const answers = { ...validAnswers(applyForm), services: [GROOMING_SERVICE] }
    const { onDraft } = setup({ initial: draft(groupIndexOf(applyForm, 'visit'), answers) })
    const replace = vi.spyOn(history, 'replaceState')

    popstate(entry(HOTEL, 1))

    // 호텔 뒤의 예약금 안내가 아니라 지금 묶음 다음의 미용 묶음이다.
    expect(groupId()).toBe('grooming')
    expect(onDraft).toHaveBeenLastCalledWith({ answers, groupIndex: GROOMING, submissionId: ID, key: KEY })
    // 그 칸이 보이는 묶음을 가리키게 고쳐 둔다.
    expect(replace).toHaveBeenCalledWith(expect.objectContaining(entry(GROOMING, 1)), '')
  })

  it('뒤로 가기로 숨은 묶음의 칸에 닿으면 지금 묶음 앞의 보이는 묶음으로 간다 — 같은 묶음을 두 번 보이지 않는다', () => {
    // 미용·호텔을 골라 예약금 안내(위치 2)까지 갔다가 호텔을 뺀 상태. 뒤 칸(위치 1)은 호텔 묶음을 가리킨다.
    history.replaceState(entry(LAST, 2), '')
    const answers = { ...validAnswers(applyForm), services: [GROOMING_SERVICE] }
    setup({ initial: draft(LAST, answers) })

    popstate(entry(HOTEL, 1))

    expect(groupId()).toBe('grooming')
  })

  it('가운데서 복원된 뒤 이전은 숨은 묶음을 건너 앞의 보이는 묶음으로 간다', () => {
    // 미용만 골랐고 예약금 안내에서 복원됐다. 앞에 쌓은 칸이 없으니 지금 칸을 고쳐 쓰는데, 교육미용·호텔·데이케어는 숨어 있다.
    const back = vi.spyOn(history, 'back')
    setup({ initial: draft(LAST, validAnswers(applyForm)) })
    fireEvent.click(action('back'))
    expect(groupId()).toBe('grooming')
    expect(back).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(GROOMING, 0))
  })

  it('서비스를 뺐으면 그 묶음에 적어 둔 답은 onSubmit 에 실리지 않는다', () => {
    // 미용·호텔을 골라 호텔 묶음까지 적었다가 이용 안내로 돌아와 호텔을 뺀 초안이다.
    const answers: Answers = {
      ...validAnswers(applyForm),
      services: [GROOMING_SERVICE, HOTEL_SERVICE],
      hotel_checkin_date: '2026-11-03',
      hotel_checkin_time: '15:00',
      hotel_checkout_date: '2026-11-05',
      hotel_checkout_time: '11:00',
      hotel_stayed: 'O',
    }
    const { onSubmit } = setup({ initial: draft(groupIndexOf(applyForm, 'visit'), answers) })

    chooseMany(SERVICES_LABEL, HOTEL_SERVICE) // 해제

    fireEvent.click(action('next'))
    expect(groupId()).toBe('grooming')
    fireEvent.click(action('next'))
    expect(groupId()).toBe('deposit')
    fireEvent.click(action('submit'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const sent = onSubmit.mock.calls[0][0]
    expect(sent.services).toEqual([GROOMING_SERVICE])
    for (const id of ['hotel_checkin_date', 'hotel_checkin_time', 'hotel_checkout_date', 'hotel_checkout_time', 'hotel_stayed']) {
      expect(sent).not.toHaveProperty(id)
    }
    expect(sent).toEqual(visibleAnswers(applyForm, { ...answers, services: [GROOMING_SERVICE] }))
  })
})

describe('이전·방문 기록', () => {
  it('이전을 누르면 앞 묶음으로 돌아가고 입력이 남아 있다', async () => {
    setup()
    fillGuardian()
    fireEvent.click(action('next'))
    expect(groupId()).toBe('pet')

    fireEvent.click(action('back'))
    // 이전은 방문 기록을 한 칸 되돌리고, 묶음은 그 popstate 가 온 뒤에 바뀐다.
    await waitFor(() => expect(groupId()).toBe('guardian'))
    expect(screen.getByLabelText('보호자 성함')).toHaveValue('김하나')
    expect(screen.getByLabelText('보호자 연락처')).toHaveValue('010-1234-5678')
    expect(screen.getByLabelText('개인정보 수집·이용 동의')).toBeChecked()
  })

  it('첫 묶음의 이전은 onBackFromFirst 를 부른다', () => {
    const back = vi.spyOn(history, 'back')
    const { onBackFromFirst } = setup()
    fireEvent.click(action('back'))
    expect(onBackFromFirst).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
  })

  it('첫 묶음에서 갈 곳이 없으면 이전 버튼이 꺼져 있다', () => {
    setup({ onBackFromFirst: undefined })
    expect(action('back')).toBeDisabled()
  })

  it('가운데서 복원된 뒤 이전은 앞 묶음으로 간다', () => {
    const back = vi.spyOn(history, 'back')
    const push = vi.spyOn(history, 'pushState')
    const { onDraft, onBackFromFirst } = setup({ initial: draft(1, GUARDIAN) })
    expect(groupId()).toBe('pet')

    fireEvent.click(action('back'))

    // 우리가 쌓은 방문 기록이 없으니 되돌리지 않고 지금 칸을 앞 묶음으로 고친다.
    expect(groupId()).toBe('guardian')
    expect(back).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(0, 0))
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })
    expect(screen.getByLabelText('보호자 성함')).toHaveValue('김하나')

    // 첫 묶음에 닿으면 이제 앱 쪽 이전이다.
    fireEvent.click(action('back'))
    expect(onBackFromFirst).toHaveBeenCalledTimes(1)
  })

  it('브라우저 뒤로 가기는 앞 묶음으로 간다', async () => {
    const { onDraft } = setup({ initial: draft(0, GUARDIAN) })
    fireEvent.click(action('next'))
    expect(groupId()).toBe('pet')

    act(() => history.back())
    await waitFor(() => expect(groupId()).toBe('guardian'))
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })
    expect(screen.getByLabelText('보호자 성함')).toHaveValue('김하나')

    // 앞으로 가기도 그 묶음으로 따라간다.
    act(() => history.forward())
    await waitFor(() => expect(groupId()).toBe('pet'))
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 1, submissionId: ID, key: KEY })
  })

  it('앞으로 가기로 돌아온 뒤의 이전은 방문 기록을 되돌린다', async () => {
    setup({ initial: draft(0, GUARDIAN) })
    fireEvent.click(action('next'))
    act(() => history.back())
    await waitFor(() => expect(groupId()).toBe('guardian'))
    act(() => history.forward())
    await waitFor(() => expect(groupId()).toBe('pet'))

    const back = vi.spyOn(history, 'back')
    fireEvent.click(action('back'))
    expect(back).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(groupId()).toBe('guardian'))
  })

  it('새로 고침으로 복원되면 앞 칸이 남아 있으니 이전은 history.back 을 쓴다', async () => {
    // 새로 고침·탭 복원은 앞 칸을 브라우저에 남긴다. 지금 칸이 같은 양식·같은 초안(열쇠)의 세 번째 칸(hhPos 2)이다.
    history.replaceState(entry(0, 0), '')
    history.pushState(entry(1, 1), '')
    history.pushState(entry(2, 2), '')
    const back = vi.spyOn(history, 'back')
    const replace = vi.spyOn(history, 'replaceState')
    const { onBackFromFirst } = setup({ initial: draft(2, validAnswers(applyForm)) })
    expect(history.state).toMatchObject(entry(2, 2)) // 위치를 이어받는다(0 으로 되돌리지 않는다)
    replace.mockClear()

    fireEvent.click(action('back'))
    await waitFor(() => expect(groupId()).toBe('pet'))
    fireEvent.click(action('back'))
    await waitFor(() => expect(groupId()).toBe('guardian'))

    // 칸을 고쳐 쓰지 않고 방문 기록을 되돌렸다. 도착한 칸이 스스로 위치를 말해 준다.
    expect(back).toHaveBeenCalledTimes(2)
    expect(replace).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(0, 0))

    // 첫 묶음에 닿으면 앱 쪽 이전이다.
    fireEvent.click(action('back'))
    expect(onBackFromFirst).toHaveBeenCalledTimes(1)
    expect(back).toHaveBeenCalledTimes(2)
  })

  it('여러 칸을 한 번에 뒤로 가도 이전은 앞 묶음으로 간다', async () => {
    // 양식 앞 페이지(intro) 다음 칸에서 시작해 두 묶음을 넘어갔다가 history.go(-2) 로 한 번에 돌아온다.
    history.replaceState({ page: 'intro' }, '')
    history.pushState(null, '')
    setup({ form: surveyForm, initial: draft(5, validAnswers(surveyForm)), submitLabel: '제출하기' })
    fireEvent.click(action('next'))
    fireEvent.click(action('next'))
    expect(groupId()).toBe('h')

    act(() => history.go(-2))
    await waitFor(() => expect(groupId()).toBe('f'))
    expect(history.state).toMatchObject(entry(5, 0, { hhForm: 'survey' }))

    // 앞에 이 화면이 쌓은 칸이 없으니(위치 0) 양식 앞 페이지로 나가지 않고 지금 칸을 앞 묶음으로 고친다.
    const back = vi.spyOn(history, 'back')
    fireEvent.click(action('back'))
    expect(groupId()).toBe('e')
    expect(back).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(4, 0, { hhForm: 'survey' }))
    fireEvent.click(action('back'))
    expect(groupId()).toBe('d')
    expect(back).not.toHaveBeenCalled()
  })

  it('복원된 초안은 같은 열쇠로 위치를 이어받는다', () => {
    // 새로 고침·탭 복원: 이 초안이 남긴 칸(같은 열쇠)이면 그 위치를 이어받는다.
    history.replaceState(entry(2, 2), '')
    setup({ initial: draft(2, validAnswers(applyForm)) })
    expect(history.state).toMatchObject(entry(2, 2))
  })

  it('같은 신청 ID 라도 새 초안이면 지난 칸의 위치를 이어받지 않는다', () => {
    // 검사지는 신청서의 신청 ID 를 그대로 쓴다. 낸 뒤 뒤로 와 새로 연 검사지는 지난 검사지와 신청 ID 는 같지만 다른 초안이다.
    history.replaceState(entry(9, 9, { hhForm: 'survey', hhKey: OLD_KEY, hhSid: ID }), '')
    setup({ form: surveyForm, initial: draft(0), submitLabel: '제출하기' })
    expect(history.state).toMatchObject(entry(0, 0, { hhForm: 'survey' }))
  })

  it('지난 초안의 칸으로 돌아가도 묶음이 바뀌지 않는다', () => {
    // 지난 초안이 남긴 칸 위에서 새 초안이 두 번째 묶음으로 열렸다.
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { onDraft } = setup({ initial: draft(1, GUARDIAN) })
    const here = history.state

    popstate(entry(0, 0, { hhKey: OLD_KEY }))

    // 지난 초안의 묶음(0)을 따르지 않고 지금 칸도 초안도 건드리지 않는다.
    expect(groupId()).toBe('pet')
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toEqual(here)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('지난 초안의 칸에 닿으면 건너뛰어 양식을 떠난다', () => {
    // 완료 화면에서 뒤로 와 새 초안을 시작했다. 방문 기록 앞에는 지난 초안이 남긴 칸이 여럿 있다. 첫 묶음에서의 뒤로 가기는
    // 양식을 떠나는 일이라 그 칸들은 더는 뜻이 없다. 하나씩 건너뛰어 양식 앞 페이지에서 멈춘다.
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const { onDraft, onBackFromFirst } = setup({ initial: draft(0, GUARDIAN) })
    const here = history.state

    popstate(entry(2, 2, { hhKey: OLD_KEY }))
    popstate(entry(1, 1, { hhKey: OLD_KEY }))
    popstate(entry(0, 0, { hhKey: OLD_KEY }))

    // 칸마다 한 번씩 더 뒤로 간다. 묶음·초안·칸은 그대로다.
    expect(back).toHaveBeenCalledTimes(3)
    expect(groupId()).toBe('guardian')
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toEqual(here)
    expect(onBackFromFirst).not.toHaveBeenCalled()

    // 양식 앞 페이지(우리 칸이 아님)에 닿으면 멈춘다.
    popstate({ page: 'intro' })
    popstate(null)
    expect(back).toHaveBeenCalledTimes(3)
  })

  it('열쇠가 없는 칸(옛 모양)도 지난 초안의 칸이다', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    setup({ initial: draft(1, GUARDIAN) })
    popstate({ hhForm: 'apply', hhSid: ID, hhStep: 0, hhPos: 0 })
    expect(groupId()).toBe('pet')
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('같은 popstate 안에서 다른 리스너가 화면을 다시 그리게 해도 이 이벤트를 놓치지 않는다', () => {
    // 실제 Next 의 popstate 리스너는 같은 이벤트 안에서 화면을 다시 그리게 한다. 그릴 때마다 리스너를 뗐다 다시 거는 방식은
    // 이때 이 이벤트를 놓친다: 떼어진 리스너는 이 이벤트에서 부르지 않고, 새로 건 리스너는 이 이벤트에 끼지 못한다.
    let redraw = () => {}
    function Parent(props: StepFormProps) {
      const [, setCount] = useState(0)
      redraw = () => setCount((n) => n + 1)
      return <StepForm {...props} />
    }
    const redrawFirst = () => flushSync(() => redraw())
    // StepForm 의 리스너보다 먼저 걸린다.
    window.addEventListener('popstate', redrawFirst)
    try {
      const onDraft = vi.fn<StepFormProps['onDraft']>()
      render(
        <Parent
          form={applyForm}
          initial={draft(1, GUARDIAN)}
          today={TODAY}
          submitLabel="신청하기"
          onDraft={onDraft}
          onSubmit={vi.fn()}
        />,
      )
      expect(groupId()).toBe('pet')

      popstate(entry(0, 0))

      expect(groupId()).toBe('guardian')
      expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })
    } finally {
      window.removeEventListener('popstate', redrawFirst)
    }
  })

  it('popstate 는 가장 나중에 받은 onDraft 로 초안을 알린다', () => {
    // 리스너는 한 번만 걸려 있어도 오래된 props 를 쓰지 않는다.
    const first = vi.fn<StepFormProps['onDraft']>()
    const second = vi.fn<StepFormProps['onDraft']>()
    const props = { form: applyForm, today: TODAY, submitLabel: '신청하기', onSubmit: vi.fn() }
    const { rerender } = render(<StepForm {...props} initial={draft(1, GUARDIAN)} onDraft={first} />)
    rerender(<StepForm {...props} initial={draft(1, GUARDIAN)} onDraft={second} />)

    popstate(entry(0, 0))

    expect(groupId()).toBe('guardian')
    expect(second).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })
    expect(first).not.toHaveBeenCalled()
  })

  it('이 양식의 칸이 아니거나 모양이 틀린 popstate 는 따르지 않는다', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {})
    const replace = vi.spyOn(history, 'replaceState')
    const { onDraft } = setup({ initial: draft(1, GUARDIAN) })
    replace.mockClear()
    popstate(null)
    popstate({})
    popstate({ page: 'intro' }) // 양식 앞 페이지의 칸
    popstate(entry(0, 0, { hhStep: '0' })) // 묶음 번호가 숫자가 아니다
    popstate(entry(1.5, 0)) // 정수가 아니다(없는 묶음을 가리켜 화면이 깨지지 않게)
    popstate(entry(Number.NaN, 0))
    popstate(entry(0, 0, { hhPos: undefined })) // 위치가 없다
    // 다른 양식(검사지)이 쌓은 칸은 이 화면의 일이 아니다.
    popstate(entry(0, 0, { hhForm: 'survey' }))
    popstate(entry(0, 0, { hhForm: undefined }))
    expect(groupId()).toBe('pet')
    expect(onDraft).not.toHaveBeenCalled()
    // 칸도 건드리지 않고 한 칸 더 뒤로 가지도 않는다(지난 초안의 칸만 건너뛴다).
    expect(replace).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('popstate 가 가리키는 묶음 번호가 범위를 넘으면 맞춰 따른다', () => {
    setup({ initial: draft(0, GUARDIAN) })
    popstate(entry(99, 1))
    expect(groupId()).toBe('deposit')
  })

  it('다음은 방문 기록에 한 칸을 쌓고 Next 가 넣어 둔 값은 그대로 둔다', () => {
    history.replaceState({ __NA: true, tree: ['t'] }, '')
    const push = vi.spyOn(history, 'pushState')
    setup({ initial: draft(0, GUARDIAN) })
    // 처음 그릴 때 지금 칸에 양식·열쇠·묶음 번호·위치를 적는다. 이 화면이 첫 칸이라 위치는 0 이다.
    expect(history.state).toEqual({ __NA: true, tree: ['t'], ...entry(0, 0) })

    fireEvent.click(action('next'))

    // 쌓을 때마다 위치가 하나씩 는다.
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ __NA: true, tree: ['t'], ...entry(1, 1) }, '')
    expect(history.state).toEqual({ __NA: true, tree: ['t'], ...entry(1, 1) })
  })

  it('묶음이 바뀌면 맨 위로 올라가고 제목에 포커스가 간다. 처음 그릴 때는 가지 않는다', () => {
    setup({ initial: draft(0, GUARDIAN) })
    const title = screen.getByRole('heading', { level: 2 })
    expect(title).toHaveAttribute('tabindex', '-1')
    expect(title).not.toHaveFocus()
    expect(window.scrollTo).not.toHaveBeenCalled()

    fireEvent.click(action('next'))

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus()
  })

  it('떠나면 popstate 듣기를 푼다', () => {
    const { unmount, onDraft } = setup({ initial: draft(1, GUARDIAN) })
    unmount()
    popstate(entry(0, 0))
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('복원된 묶음 번호가 범위를 넘으면 마지막 묶음으로 맞춘다', () => {
    const { onDraft } = setup({ initial: draft(99, validAnswers(applyForm)) })
    expect(groupId()).toBe('deposit')
    expect(action('submit')).toHaveTextContent('신청하기')
    // 맞추기만 했을 뿐 사용자가 한 일이 아니니 초안을 내보내지 않는다.
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(LAST, 0))
  })

  it('복원된 묶음 번호가 음수면 첫 묶음으로 맞춘다', () => {
    setup({ initial: draft(-4) })
    expect(groupId()).toBe('guardian')
  })

  it('초안은 언제나 처음 받은 신청 ID 와 열쇠를 담는다', () => {
    const { onDraft } = setup({ initial: { answers: {}, groupIndex: 0, submissionId: 'Zz9Yy8Xx7W', key: 'Qq3dE5gH7j' } })
    fillGuardian()
    fireEvent.click(action('next'))
    expect(onDraft.mock.calls.length).toBeGreaterThan(3)
    for (const [d] of onDraft.mock.calls) {
      expect(d.submissionId).toBe('Zz9Yy8Xx7W')
      expect(d.key).toBe('Qq3dE5gH7j')
    }
  })
})

describe('제출', () => {
  it('마지막 묶음 버튼은 submitLabel 이고 누르면 onSubmit 이 답 전체를 받는다', () => {
    const answers = validAnswers(applyForm)
    const { onSubmit } = setup({ initial: draft(LAST, answers), submitLabel: '신청하기' })
    const submit = screen.getByRole('button', { name: '신청하기' })
    expect(submit).toBe(action('submit'))
    expect(action('next')).toBeNull()

    fireEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith(answers)
  })

  it('submitLabel 은 그때그때 받은 글자다', () => {
    setup({ form: surveyForm, initial: draft(99, validAnswers(surveyForm)), submitLabel: '제출하기' })
    expect(action('submit')).toHaveTextContent('제출하기')
    expect(groupId()).toBe('l')
  })

  it('마지막 묶음에서도 오류가 있으면 보내지 않고 오류를 보여 준다', () => {
    // 예약금 안내의 요청 사항은 선택이지만 3,000자를 넘으면 오류다.
    const answers = { ...validAnswers(applyForm), request: '가'.repeat(3001) }
    const { onSubmit } = setup({ initial: draft(LAST, answers) })
    expect(isBlocked(action('submit'))).toBe(true)

    fireEvent.click(action('submit'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(within(box('request')).getByRole('alert')).toHaveTextContent('3,000자까지 적을 수 있어요')
    expect(scrolledTo()[0]).toBe(box('request'))
  })

  it('보내는 중에 두 번 누르면 onSubmit 은 한 번만 불린다', () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    onSubmit.mockReturnValue(new Promise(() => {})) // 끝나지 않는 Promise
    const submit = action('submit')

    // 화면이 다시 그려지기 전에 두 번 누른다.
    act(() => {
      submit.click()
      submit.click()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent('보내는 중…')
    // 다시 그려진 뒤에 눌러도 마찬가지다.
    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('ok 가 와도 부모가 화면을 바꿀 때까지 버튼을 막아 둔다', async () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    fireEvent.click(action('submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(action('submit')).toBeDisabled()
    expect(action('submit')).toHaveTextContent('보내는 중…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('failed 면 안내가 보이고 입력이 남는다', async () => {
    const answers = { ...validAnswers(applyForm), request: '문 앞에서 기다릴게요' }
    const { onSubmit } = setup({ initial: draft(LAST, answers) })
    onSubmit.mockResolvedValue('failed')

    fireEvent.click(action('submit'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(FAILED)
    // 안내가 화면 밖에 있지 않게 보이는 곳으로 올려 준다(그린 다음 효과에서 하는 일이라 기다린다).
    await waitFor(() => expect(scrolledTo().at(-1)).toBe(alert))
    // 입력은 그대로고 다시 보낼 수 있다.
    expect(action('submit')).toBeEnabled()
    expect(action('submit')).toHaveTextContent('신청하기')
    expect(isBlocked(action('submit'))).toBe(false)
    expect(screen.getByLabelText(REQUEST_LABEL)).toHaveValue('문 앞에서 기다릴게요')

    onSubmit.mockResolvedValue('ok')
    fireEvent.click(action('submit'))
    expect(onSubmit).toHaveBeenCalledTimes(2)
    // 다시 보내기 시작하면 앞의 안내는 치운다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('failed 안내는 다음 입력에서 사라진다', async () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    onSubmit.mockResolvedValue('failed')
    fireEvent.click(action('submit'))
    await screen.findByText(FAILED)

    write(REQUEST_LABEL, '요청')

    expect(screen.queryByText(FAILED)).not.toBeInTheDocument()
  })

  it('onSubmit 이 거부돼도 failed 로 보고 다시 누를 수 있다', async () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    onSubmit.mockRejectedValue(new Error('네트워크'))

    fireEvent.click(action('submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(action('submit')).toBeEnabled()
  })

  it('숨은 문항의 옛 답은 onSubmit 에 실리지 않는다', async () => {
    const q49 = question(surveyForm, 'q49')
    const q50 = question(surveyForm, 'q50')
    const { onSubmit } = setup({
      form: surveyForm,
      initial: draft(groupIndexOf(surveyForm, 'g'), validAnswers(surveyForm)),
      submitLabel: '제출하기',
    })

    // q49 '예' 로 q50 이 열리면 답하고, 다시 '아니오' 로 바꾼다.
    chooseOne(q49.label, '예')
    chooseMany(q50.label, '울타리')
    chooseOne(q49.label, '아니오')
    expect(screen.queryByRole('group', { name: q50.label })).not.toBeInTheDocument()

    // 마지막 묶음까지 간다.
    for (let i = groupIndexOf(surveyForm, 'g'); i < surveyForm.groups.length - 1; i++) fireEvent.click(action('next'))
    expect(groupId()).toBe('l')
    fireEvent.click(action('submit'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const sent = onSubmit.mock.calls[0][0]
    expect(sent).not.toHaveProperty('q50')
    expect(sent.q49).toBe('아니오')
    expect(sent).toEqual(visibleAnswers(surveyForm, { ...validAnswers(surveyForm), q49: '아니오', q50: ['울타리'] }))
  })

  it('서버가 invalid 를 주면 오류가 있는 첫 묶음으로 옮긴다', async () => {
    // 앞 묶음이 비어 있는 채 복원된 초안이다(화면은 마지막 묶음만 본다).
    const answers = validAnswers(applyForm)
    delete answers.guardian_name
    const push = vi.spyOn(history, 'pushState')
    const { onSubmit, onDraft } = setup({ initial: draft(LAST, answers) })
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    await waitFor(() => expect(groupId()).toBe('guardian'))
    expect(within(box('guardian_name')).getByRole('alert')).toHaveTextContent('꼭 적어 주세요')
    // 첫 오류 문항으로 가서 그 입력에 포커스를 둔다. 묶음을 옮기고 그린 다음 효과에서 하는 일이라 기다린다.
    await waitFor(() => {
      expect(scrolledTo().at(-1)).toBe(box('guardian_name'))
      expect(screen.getByLabelText('보호자 성함')).toHaveFocus()
    })
    // 옮기는 것은 방문 기록을 쌓지 않고 지금 칸을 고친다.
    expect(push).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(0, 0))
    expect(onDraft).toHaveBeenLastCalledWith({ answers, groupIndex: 0, submissionId: ID, key: KEY })
    // 그 묶음의 버튼은 채워야 할 곳이 남아 막혀 있다.
    expect(isBlocked(action('next'))).toBe(true)
  })

  it('보내는 중에는 이전이 꺼져 있다', async () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    const sending = deferred<'ok' | 'invalid' | 'failed'>()
    onSubmit.mockReturnValue(sending.promise)
    expect(action('back')).toBeEnabled()

    fireEvent.click(action('submit'))
    expect(action('back')).toBeDisabled()

    // 실패하면 다시 켜진다.
    await act(async () => sending.resolve('failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent(FAILED)
    expect(action('back')).toBeEnabled()
  })

  it('invalid 전에 묶음이 바뀌었으면 칸과 초안이 화면을 따른다', async () => {
    // 보내는 동안 브라우저 뒤로 가기로 묶음이 바뀌었다. 서버는 자정을 넘긴 희망 날짜 때문에 거절한다.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T01:00:00+09:00'))
    const answers = { ...validAnswers(applyForm), groom_date: '2026-10-23' }
    const { onSubmit, onDraft } = setup({ initial: draft(0, answers), today: '2026-10-23' })
    const sending = deferred<'ok' | 'invalid' | 'failed'>()
    onSubmit.mockReturnValue(sending.promise)
    // 보호자→반려견→반려견 건강→이용 안내→미용→예약금 안내.
    for (let i = 0; i < 5; i++) fireEvent.click(action('next'))
    expect(groupId()).toBe('deposit')
    fireEvent.click(action('submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    // 두 칸 뒤로 가 이용 안내로 돌아왔다.
    act(() => history.go(-2))
    await waitFor(() => expect(groupId()).toBe('visit'))
    expect(history.state).toMatchObject(entry(groupIndexOf(applyForm, 'visit'), 3))

    await act(async () => sending.resolve('invalid'))

    // 오류가 있는 묶음(미용의 희망 날짜)으로 옮기고, 칸과 초안도 그 묶음을 적는다. 위치는 그대로다.
    await waitFor(() => expect(groupId()).toBe('grooming'))
    expect(within(box('groom_date')).getByRole('alert')).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
    expect(history.state).toMatchObject(entry(GROOMING, 3))
    expect(onDraft).toHaveBeenLastCalledWith({ answers, groupIndex: GROOMING, submissionId: ID, key: KEY })
  })

  it('보내는 중에 언마운트되면 결과가 와도 이력·초안을 건드리지 않는다', async () => {
    // 앞 묶음이 비어 있어 서버가 거절하면 그 묶음으로 옮겨야 하는 초안이다.
    const answers = validAnswers(applyForm)
    delete answers.guardian_name
    const { onSubmit, onDraft, unmount } = setup({ initial: draft(LAST, answers) })
    const sending = deferred<'ok' | 'invalid' | 'failed'>()
    onSubmit.mockReturnValue(sending.promise)
    fireEvent.click(action('submit'))

    // 기다리는 사이 다른 페이지로 갔다.
    unmount()
    const stateAtLeaving = history.state
    const replace = vi.spyOn(history, 'replaceState')
    const push = vi.spyOn(history, 'pushState')
    onDraft.mockClear()
    await act(async () => sending.resolve('invalid'))

    expect(replace).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toEqual(stateAtLeaving)
  })

  it('서버가 invalid 를 주면 새 오늘로 전체를 다시 본다 — 자정을 넘겨 희망 날짜가 과거가 된 경우', async () => {
    // 화면의 오늘(prop)은 어제인 채로 열려 있었다. 서버는 새 날짜로 판정했다.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T01:00:00+09:00'))
    const answers = { ...validAnswers(applyForm), groom_date: '2026-10-23' }
    const { onSubmit } = setup({ initial: draft(LAST, answers), today: '2026-10-23' })
    expect(isBlocked(action('submit'))).toBe(false)
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    // 과거가 된 날짜는 미용 묶음에 있으니 그 묶음으로 옮긴다.
    await waitFor(() => expect(groupId()).toBe('grooming'))
    expect(within(box('groom_date')).getByRole('alert')).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
    expect(isBlocked(action('next'))).toBe(true)
    // 새 오늘(10-24)이 달력에 전해진다.
    fireEvent.click(screen.getByLabelText('희망 예약 날짜'))
    expect(document.querySelector('[data-date="2026-10-23"]')).toBeDisabled()
    expect(document.querySelector('[data-date="2026-10-24"]')).not.toBeDisabled()
    await waitFor(() => expect(scrolledTo().at(-1)).toBe(box('groom_date')))
  })

  it('서버가 invalid 를 주는데 화면에서 오류를 못 찾으면 다시 확인해 달라고 안내하고 다음 입력에서 지운다', async () => {
    const { onSubmit } = setup({ initial: draft(LAST, validAnswers(applyForm)) })
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('입력한 내용을 다시 확인해 주세요.')
    expect(action('submit')).toBeEnabled()
    expect(isBlocked(action('submit'))).toBe(false)

    write(REQUEST_LABEL, '요청')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('조건 문항', () => {
  it('showIf 문항은 조건이 맞을 때만 그린다', () => {
    const q49 = question(surveyForm, 'q49')
    const q50 = question(surveyForm, 'q50')
    setup({ form: surveyForm, initial: draft(groupIndexOf(surveyForm, 'g')), submitLabel: '제출하기' })
    expect(screen.queryByRole('group', { name: q50.label })).not.toBeInTheDocument()
    expect(box('q50')).toBeNull()

    chooseOne(q49.label, '예')
    expect(screen.getByRole('group', { name: q50.label })).toBeInTheDocument()

    chooseOne(q49.label, '아니오')
    expect(screen.queryByRole('group', { name: q50.label })).not.toBeInTheDocument()
  })

  it('숨은 필수 문항은 버튼을 막지 않는다', () => {
    // 검사지의 조건 문항은 모두 선택이라, 필수인 조건 문항은 합성 양식으로 본다.
    const conditional: FormDef = {
      id: 'survey',
      title: '조건',
      groups: [
        {
          id: 'g',
          title: '묶음',
          questions: [
            { id: 'a', label: '앞 문항', type: 'single', required: true, options: ['예', '아니오'] },
            { id: 'b', label: '뒤 문항', type: 'short', required: true, showIf: { questionId: 'a', equals: '예' } },
          ],
        },
      ],
    }
    setup({ form: conditional, submitLabel: '제출하기' })

    chooseOne('앞 문항', '아니오')
    expect(screen.queryByLabelText('뒤 문항')).not.toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(false)

    chooseOne('앞 문항', '예')
    expect(screen.getByLabelText('뒤 문항')).toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(true)
  })

  it('blockIf 면 버튼이 막히고 메시지가 보인다', () => {
    const q2 = question(surveyForm, 'q2')
    const blockedOption = q2.blockIf!.value
    setup({
      form: surveyForm,
      initial: draft(0, { ...validAnswers(surveyForm), q2: '동의함' }),
      submitLabel: '제출하기',
    })
    expect(isBlocked(action('next'))).toBe(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    chooseOne(q2.label, blockedOption)

    // 넘어가려 하기 전에도 그 문항 아래에 곧바로 보인다.
    expect(within(box('q2')).getByRole('alert')).toHaveTextContent('동의하지 않으면 검사지를 진행할 수 없어요')
    expect(isBlocked(action('next'))).toBe(true)

    fireEvent.click(action('next'))
    expect(groupId()).toBe('a')

    chooseOne(q2.label, '동의함')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(action('next'))
    expect(groupId()).toBe('b')
  })

  it('기타를 고르고 비워 두면 기타 내용을 적어 주세요 가 보인다', () => {
    const q14 = question(surveyForm, 'q14')
    const answers = validAnswers(surveyForm)
    delete answers.q14
    setup({ form: surveyForm, initial: draft(groupIndexOf(surveyForm, 'c'), answers), submitLabel: '제출하기' })

    chooseOne(q14.label, '기타')
    // 입력이 열렸을 뿐 아직 넘어가려 하지 않았으니 오류는 안 보인다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(action('next'))

    expect(within(box('q14')).getByRole('alert')).toHaveTextContent('기타 내용을 적어 주세요')
    expect(groupId()).toBe('c')
    // 비어 있는 입력으로 포커스가 간다.
    expect(screen.getByLabelText('기타 내용')).toHaveFocus()

    write('기타 내용', '펫시터')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(isBlocked(action('next'))).toBe(false)
  })

  it('필수 문항에는 * 표시가 있고 라벨 이름은 문항 그대로다', () => {
    setup({ initial: draft(GROOMING, { services: [GROOMING_SERVICE] }) })
    // 희망 시간은 필수가 아니라 * 가 없다. 시간 칩 묶음은 라디오 그룹이고 이름이 라벨 그대로다.
    expect(within(box('groom_time')).queryByText('*')).not.toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: '희망 시간' })).toBe(screen.getByLabelText('희망 시간'))
    // 필수 문항에는 * 가 있고, 라벨 이름에는 들어가지 않는다.
    expect(within(box('groom_date')).getByText('*')).toBeInTheDocument()
    expect(screen.getByLabelText('희망 예약 날짜')).toHaveAccessibleName('희망 예약 날짜')
  })

  it('시간 칩은 짝 날짜의 요일에 맞는 영업시간만 보인다 — 날짜를 바꾸면 칩이 바뀐다', () => {
    setup({ initial: draft(GROOMING, { services: [GROOMING_SERVICE] }) })
    const chips = () => within(box('groom_time')).getAllByRole('radio')
    // 날짜를 고르기 전에는 모든 요일을 합친 범위(10:00~19:30, 20개)다.
    expect(chips()).toHaveLength(20)

    // 2026-11-03 은 화요일(10:00~16:00) — 15:30 까지 12개.
    pickDate('희망 예약 날짜', '2026-11-03')
    expect(chips()).toHaveLength(12)
    expect(within(box('groom_time')).queryByRole('radio', { name: '오후 4:00' })).not.toBeInTheDocument()

    // 2026-11-05 는 목요일(10:00~20:00) — 19:30 까지 20개.
    pickDate('희망 예약 날짜', '2026-11-05')
    expect(chips()).toHaveLength(20)
    expect(within(box('groom_time')).getByRole('radio', { name: '오후 7:30' })).toBeInTheDocument()

    // 목요일에 18:00 을 고른 채 화요일로 되돌리면 그 칩은 켜진 채 남고, 다음으로 넘어가지 못한다(그날 영업시간 안의 시간을 골라 달라 한다).
    chooseOne('희망 시간', '오후 6:00')
    pickDate('희망 예약 날짜', '2026-11-03')
    expect(chips()).toHaveLength(13)
    expect(within(box('groom_time')).getByRole('radio', { name: '오후 6:00' })).toBeChecked()
    expect(isBlocked(action('next'))).toBe(true)
    fireEvent.click(action('next'))
    expect(within(box('groom_time')).getByRole('alert')).toHaveTextContent('그날 영업시간 안의 시간을 골라 주세요')
    expect(groupId()).toBe('grooming')

    // 범위 안 칩을 고르면 풀린다.
    chooseOne('희망 시간', '오후 3:00')
    expect(chips()).toHaveLength(12)
    expect(isBlocked(action('next'))).toBe(false)
  })

  it('선택 문항의 고른 칩은 다시 누르면 해제되고, 필수 문항은 해제되지 않는다', () => {
    // 호텔의 숙박 경험(O/X)은 선택이다.
    const hotel = setup({ initial: draft(groupIndexOf(applyForm, 'hotel'), { services: [HOTEL_SERVICE] }) })
    const stayed = () => within(box('hotel_stayed')).getByRole('radio', { name: 'O' })
    fireEvent.click(stayed())
    fireEvent.click(stayed())
    expect(stayed()).not.toBeChecked()
    expect(hotel.onDraft.mock.lastCall![0].answers.hotel_stayed).toBe('')
    hotel.unmount()

    // 반려견 성별은 필수라 다시 눌러도 그대로다.
    const pet = setup({ initial: draft(1) })
    const male = () => within(box('pet_sex')).getByRole('radio', { name: '남' })
    fireEvent.click(male())
    fireEvent.click(male())
    expect(male()).toBeChecked()
    expect(pet.onDraft.mock.lastCall![0].answers.pet_sex).toBe('남')
  })

  it('requiredIf 대상에 답이 생기면 선택 표시가 사라지고 필수가 된다', () => {
    // 신청서는 이 규칙을 더 쓰지 않는다(옛 2순위 날짜·시간대). 합성 문항으로 본다.
    const dependent: FormDef = {
      id: 'survey',
      title: '조건',
      groups: [
        {
          id: 'g',
          title: '묶음',
          questions: [
            { id: 'd', label: '선택 날짜', type: 'date', required: false },
            { id: 's', label: '선택 시간대', type: 'single', required: false, options: ['오전', '오후'], requiredIf: { questionId: 'd' } },
          ],
        },
      ],
    }
    setup({ form: dependent, submitLabel: '제출하기' })
    // 처음에는 날짜도 시간대도 선택이다(* 없음).
    expect(within(box('s')).queryByText('*')).not.toBeInTheDocument()
    expect(within(box('s')).getByRole('radiogroup')).not.toBeRequired()
    expect(isBlocked(action('submit'))).toBe(false)

    pickDate('선택 날짜', '2026-10-30')

    // 날짜를 고르면 시간대는 필수가 된다(* 가 붙고 보조 기기에도). 날짜 쪽은 여전히 선택이다.
    expect(within(box('s')).getByText('*')).toBeInTheDocument()
    expect(within(box('s')).getByRole('radiogroup')).toBeRequired()
    expect(within(box('d')).queryByText('*')).not.toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(true)
    fireEvent.click(action('submit'))
    expect(within(box('s')).getByRole('alert')).toHaveTextContent('하나를 골라 주세요')

    // 필수가 된 칩은 다시 눌러도 해제되지 않는다.
    const afternoon = () => within(box('s')).getByRole('radio', { name: '오후' })
    fireEvent.click(afternoon())
    fireEvent.click(afternoon())
    expect(afternoon()).toBeChecked()

    // 날짜를 지우면 다시 선택이다.
    pickDate('선택 날짜', '')
    expect(within(box('s')).queryByText('*')).not.toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(false)
  })
})
