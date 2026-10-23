import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StepForm, type StepFormProps } from '../components/StepForm'
import { applyForm } from '../forms/apply'
import { allQuestions, visibleAnswers } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Answers, FormDef } from '../forms/types'
import type { Draft } from '../lib/draft'
import { validAnswers } from './fixtures'

const TODAY = '2026-10-23'
const ID = 'Ab3dE5gH7j'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const GUARDIAN: Answers = { guardian_name: '김하나', guardian_phone: '010-1234-5678', privacy_consent: '동의' }

const draft = (groupIndex = 0, answers: Answers = {}): Draft => ({ answers, groupIndex, submissionId: ID })
const groupIndexOf = (form: FormDef, id: string) => form.groups.findIndex((g) => g.id === id)
const question = (form: FormDef, id: string) => allQuestions(form).find((q) => q.id === id)!

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

beforeEach(() => {
  // 앞 테스트가 쌓은 방문 기록 칸의 값이 이 테스트의 시작 상태에 섞이지 않게 한다.
  history.replaceState(null, '')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('화면 틀', () => {
  it('위 막대에 이전 버튼·묶음 제목·진행이 있고 진행 막대는 장식이다', () => {
    const { container } = setup()
    expect(screen.getByRole('button', { name: '이전' })).toBe(action('back'))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('보호자')
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(groupId()).toBe('guardian')
    const decoration = container.querySelectorAll('[aria-hidden="true"]')
    expect(decoration).toHaveLength(1)
    expect(decoration[0]).toHaveTextContent('')
  })

  it('묶음에 note 가 있으면 제목 아래에 보인다', () => {
    setup({ initial: draft(2) })
    const note = screen.getByText(/원하는 날짜와 시간대를 알려 주시면/)
    const title = screen.getByRole('heading', { level: 2 })
    expect(title.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('note 가 없는 묶음에는 note 자리가 없다', () => {
    setup()
    expect(screen.queryByText(/원하는 날짜와 시간대를 알려 주시면/)).not.toBeInTheDocument()
  })

  it('검사지는 묶음 번호로만 진행을 보여 주고 전체 문항 수나 시간은 적지 않는다', () => {
    setup({ form: surveyForm, submitLabel: '제출하기' })
    expect(screen.getByText('1 / 12')).toBeInTheDocument()
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
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID })

    const next = action('next')
    expect(isBlocked(next)).toBe(false)
    fireEvent.click(next)

    expect(groupId()).toBe('pet')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('반려견')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(onDraft).toHaveBeenCalledTimes(4)
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 1, submissionId: ID })
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
    const answers = { ...validAnswers(applyForm), wish1_date: '2026-10-22' }
    setup({ initial: draft(2, answers) })
    expect(isBlocked(action('submit'))).toBe(true)
    fireEvent.click(action('submit'))
    expect(within(box('wish1_date')).getByRole('alert')).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
  })

  it('오늘 날짜는 min 으로 날짜 입력에 전해진다', () => {
    setup({ initial: draft(2) })
    expect(screen.getByLabelText('희망 날짜 1순위')).toHaveAttribute('min', TODAY)
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
    expect(history.state).toMatchObject({ hhStep: 0 })
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID })
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
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID })
    expect(screen.getByLabelText('보호자 성함')).toHaveValue('김하나')

    // 앞으로 가기도 그 묶음으로 따라간다.
    act(() => history.forward())
    await waitFor(() => expect(groupId()).toBe('pet'))
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 1, submissionId: ID })
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

  it('새로 고침 전에 쌓인 칸으로 돌아간 뒤에도 새로 쌓은 칸의 이전은 방문 기록을 되돌린다', async () => {
    // 새로 고침 전에 쌓은 칸(0 → 1)이 브라우저에 남아 있다. 새로 고침으로 돌아온 화면은 그 칸을 세지 못한다.
    history.replaceState({ hhForm: 'apply', hhStep: 0 }, '')
    history.pushState({ hhForm: 'apply', hhStep: 1 }, '')
    setup({ initial: draft(1, GUARDIAN) })
    expect(groupId()).toBe('pet')

    act(() => history.back())
    await waitFor(() => expect(groupId()).toBe('guardian'))

    fireEvent.click(action('next'))
    expect(groupId()).toBe('pet')

    const back = vi.spyOn(history, 'back')
    fireEvent.click(action('back'))
    expect(back).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(groupId()).toBe('guardian'))
  })

  it('이 양식의 묶음 번호가 아닌 popstate 는 따르지 않는다', () => {
    const { onDraft } = setup({ initial: draft(1, GUARDIAN) })
    const pop = (state: unknown) => act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state })))
    pop(null)
    pop({})
    pop({ hhStep: '0' })
    // 다른 양식(검사지)이 쌓은 칸으로 돌아가는 것은 이 양식의 일이 아니다.
    pop({ hhForm: 'survey', hhStep: 0 })
    expect(groupId()).toBe('pet')
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('popstate 가 가리키는 묶음 번호가 범위를 넘으면 맞춰 따른다', () => {
    setup({ initial: draft(0, GUARDIAN) })
    act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: { hhStep: 99 } })))
    expect(groupId()).toBe('visit')
  })

  it('다음은 방문 기록에 한 칸을 쌓고 Next 가 넣어 둔 값은 그대로 둔다', () => {
    history.replaceState({ __NA: true, tree: ['t'] }, '')
    const push = vi.spyOn(history, 'pushState')
    setup({ initial: draft(0, GUARDIAN) })
    // 처음 그릴 때 지금 칸에 묶음 번호를 적는다.
    expect(history.state).toEqual({ __NA: true, tree: ['t'], hhForm: 'apply', hhStep: 0 })

    fireEvent.click(action('next'))

    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ __NA: true, tree: ['t'], hhForm: 'apply', hhStep: 1 }, '')
    expect(history.state).toEqual({ __NA: true, tree: ['t'], hhForm: 'apply', hhStep: 1 })
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
    act(() => void window.dispatchEvent(new PopStateEvent('popstate', { state: { hhForm: 'apply', hhStep: 0 } })))
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('복원된 묶음 번호가 범위를 넘으면 마지막 묶음으로 맞춘다', () => {
    const { onDraft } = setup({ initial: draft(99, validAnswers(applyForm)) })
    expect(groupId()).toBe('visit')
    expect(action('submit')).toHaveTextContent('신청하기')
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    // 맞추기만 했을 뿐 사용자가 한 일이 아니니 초안을 내보내지 않는다.
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toMatchObject({ hhStep: 2 })
  })

  it('복원된 묶음 번호가 음수면 첫 묶음으로 맞춘다', () => {
    setup({ initial: draft(-4) })
    expect(groupId()).toBe('guardian')
  })

  it('초안은 언제나 처음 받은 신청 ID 를 담는다', () => {
    const { onDraft } = setup({ initial: { answers: {}, groupIndex: 0, submissionId: 'Zz9Yy8Xx7W' } })
    fillGuardian()
    fireEvent.click(action('next'))
    expect(onDraft.mock.calls.length).toBeGreaterThan(3)
    for (const [d] of onDraft.mock.calls) expect(d.submissionId).toBe('Zz9Yy8Xx7W')
  })
})

describe('제출', () => {
  it('마지막 묶음 버튼은 submitLabel 이고 누르면 onSubmit 이 답 전체를 받는다', () => {
    const answers = validAnswers(applyForm)
    const { onSubmit } = setup({ initial: draft(2, answers), submitLabel: '신청하기' })
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
    const answers = validAnswers(applyForm)
    delete answers.services
    const { onSubmit } = setup({ initial: draft(2, answers) })
    expect(isBlocked(action('submit'))).toBe(true)

    fireEvent.click(action('submit'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(within(box('services')).getByRole('alert')).toHaveTextContent('하나 이상 골라 주세요')
    expect(scrolledTo()[0]).toBe(box('services'))
  })

  it('보내는 중에 두 번 누르면 onSubmit 은 한 번만 불린다', () => {
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
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
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
    fireEvent.click(action('submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(action('submit')).toBeDisabled()
    expect(action('submit')).toHaveTextContent('보내는 중…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('failed 면 안내가 보이고 입력이 남는다', async () => {
    const answers = validAnswers(applyForm)
    const { onSubmit } = setup({ initial: draft(2, answers) })
    onSubmit.mockResolvedValue('failed')

    fireEvent.click(action('submit'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(FAILED)
    // 안내가 화면 밖에 있지 않게 보이는 곳으로 올려 준다.
    expect(scrolledTo().at(-1)).toBe(alert)
    // 입력은 그대로고 다시 보낼 수 있다.
    expect(action('submit')).toBeEnabled()
    expect(action('submit')).toHaveTextContent('신청하기')
    expect(isBlocked(action('submit'))).toBe(false)
    expect(screen.getByLabelText('희망 날짜 1순위')).toHaveValue(answers.wish1_date)
    expect(within(screen.getByRole('radiogroup', { name: '히스하우스 방문 여부' })).getByRole('radio', { name: '첫 방문' })).toBeChecked()

    onSubmit.mockResolvedValue('ok')
    fireEvent.click(action('submit'))
    expect(onSubmit).toHaveBeenCalledTimes(2)
    // 다시 보내기 시작하면 앞의 안내는 치운다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('failed 안내는 다음 입력에서 사라진다', async () => {
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
    onSubmit.mockResolvedValue('failed')
    fireEvent.click(action('submit'))
    await screen.findByText(FAILED)

    chooseOne('히스하우스 방문 여부', '재방문')

    expect(screen.queryByText(FAILED)).not.toBeInTheDocument()
  })

  it('onSubmit 이 거부돼도 failed 로 보고 다시 누를 수 있다', async () => {
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
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
    const { onSubmit, onDraft } = setup({ initial: draft(2, answers) })
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    await waitFor(() => expect(groupId()).toBe('guardian'))
    expect(within(box('guardian_name')).getByRole('alert')).toHaveTextContent('꼭 적어 주세요')
    expect(scrolledTo().at(-1)).toBe(box('guardian_name'))
    expect(screen.getByLabelText('보호자 성함')).toHaveFocus()
    // 옮기는 것은 방문 기록을 쌓지 않고 지금 칸을 고친다.
    expect(push).not.toHaveBeenCalled()
    expect(history.state).toMatchObject({ hhStep: 0 })
    expect(onDraft).toHaveBeenLastCalledWith({ answers, groupIndex: 0, submissionId: ID })
    // 그 묶음의 버튼은 채워야 할 곳이 남아 막혀 있다.
    expect(isBlocked(action('next'))).toBe(true)
  })

  it('서버가 invalid 를 주면 새 오늘로 전체를 다시 본다 — 자정을 넘겨 희망 날짜가 과거가 된 경우', async () => {
    // 화면의 오늘(prop)은 어제인 채로 열려 있었다. 서버는 새 날짜로 판정했다.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T01:00:00+09:00'))
    const answers = { ...validAnswers(applyForm), wish1_date: '2026-10-23' }
    const { onSubmit } = setup({ initial: draft(2, answers), today: '2026-10-23' })
    expect(isBlocked(action('submit'))).toBe(false)
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    const alert = await within(box('wish1_date')).findByRole('alert')
    expect(alert).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
    expect(groupId()).toBe('visit')
    expect(isBlocked(action('submit'))).toBe(true)
    expect(screen.getByLabelText('희망 날짜 1순위')).toHaveAttribute('min', '2026-10-24')
    expect(scrolledTo().at(-1)).toBe(box('wish1_date'))
  })

  it('서버가 invalid 를 주는데 화면에서 오류를 못 찾으면 다시 확인해 달라고 안내하고 다음 입력에서 지운다', async () => {
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
    onSubmit.mockResolvedValue('invalid')

    fireEvent.click(action('submit'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('입력한 내용을 다시 확인해 주세요.')
    expect(action('submit')).toBeEnabled()
    expect(isBlocked(action('submit'))).toBe(false)

    chooseOne('히스하우스 방문 여부', '재방문')
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

  it('선택 문항에는 선택 표시가 있고 라벨 이름은 문항 그대로다', () => {
    setup({ initial: draft(2) })
    // wish2_date 는 필수가 아니다.
    expect(within(box('wish2_date')).getByText('선택')).toBeInTheDocument()
    expect(screen.getByLabelText('희망 날짜 2순위')).toHaveAccessibleName('희망 날짜 2순위')
    // 필수 문항에는 없다.
    expect(within(box('wish1_date')).queryByText('선택')).not.toBeInTheDocument()
    expect(screen.getByLabelText('희망 날짜 1순위')).toHaveAccessibleName('희망 날짜 1순위')
  })

  it('2순위 날짜를 고르면 시간대의 선택 표시가 사라진다', () => {
    setup({ initial: draft(2, validAnswers(applyForm)) })
    // 2순위는 날짜도 시간대도 선택이다.
    expect(within(box('wish2_slot')).getByText('선택')).toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(false)

    write('희망 날짜 2순위', '2026-10-30')

    // 날짜를 고르면 시간대는 필수가 된다. 날짜 쪽은 여전히 선택이다.
    expect(within(box('wish2_slot')).queryByText('선택')).not.toBeInTheDocument()
    expect(within(box('wish2_date')).getByText('선택')).toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(true)
    fireEvent.click(action('submit'))
    expect(within(box('wish2_slot')).getByRole('alert')).toHaveTextContent('하나를 골라 주세요')

    // 날짜를 지우면 다시 선택이다.
    write('희망 날짜 2순위', '')
    expect(within(box('wish2_slot')).getByText('선택')).toBeInTheDocument()
    expect(isBlocked(action('submit'))).toBe(false)
  })
})
