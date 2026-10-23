import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { flushSync } from 'react-dom'
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
/** 이 초안의 열쇠. 방문 기록 칸이 어느 초안의 것인지 가린다. */
const KEY = 'Kk3dE5gH7j'
/** 지난 초안이 남긴 칸의 열쇠. */
const OLD_KEY = 'Zz9Yy8Xx7W'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'

const GUARDIAN: Answers = { guardian_name: '김하나', guardian_phone: '010-1234-5678', privacy_consent: '동의' }

const draft = (groupIndex = 0, answers: Answers = {}): Draft => ({ answers, groupIndex, submissionId: ID, key: KEY })
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
  it('위 막대에 이전 버튼·묶음 제목·진행이 있고 진행 막대는 장식이다', () => {
    setup()
    expect(screen.getByRole('button', { name: '이전' })).toBe(action('back'))
    const title = screen.getByRole('heading', { level: 2 })
    expect(title).toHaveTextContent('보호자')
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(groupId()).toBe('guardian')
    // 진행 막대는 위 막대 바로 아래에 있다. 읽히지 않고 글이 없는 장식이다.
    const progress = title.parentElement!.nextElementSibling
    expect(progress).toHaveAttribute('aria-hidden', 'true')
    expect(progress).toHaveTextContent('')
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
    expect(onDraft).toHaveBeenLastCalledWith({ answers: GUARDIAN, groupIndex: 0, submissionId: ID, key: KEY })

    const next = action('next')
    expect(isBlocked(next)).toBe(false)
    fireEvent.click(next)

    expect(groupId()).toBe('pet')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('반려견')
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
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
    expect(groupId()).toBe('visit')
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
    expect(groupId()).toBe('visit')
    expect(action('submit')).toHaveTextContent('신청하기')
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    // 맞추기만 했을 뿐 사용자가 한 일이 아니니 초안을 내보내지 않는다.
    expect(onDraft).not.toHaveBeenCalled()
    expect(history.state).toMatchObject(entry(2, 0))
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
    // 안내가 화면 밖에 있지 않게 보이는 곳으로 올려 준다(그린 다음 효과에서 하는 일이라 기다린다).
    await waitFor(() => expect(scrolledTo().at(-1)).toBe(alert))
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
    const { onSubmit } = setup({ initial: draft(2, validAnswers(applyForm)) })
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
    const answers = { ...validAnswers(applyForm), wish1_date: '2026-10-23' }
    const { onSubmit, onDraft } = setup({ initial: draft(0, answers), today: '2026-10-23' })
    const sending = deferred<'ok' | 'invalid' | 'failed'>()
    onSubmit.mockReturnValue(sending.promise)
    fireEvent.click(action('next'))
    fireEvent.click(action('next'))
    expect(groupId()).toBe('visit')
    fireEvent.click(action('submit'))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    act(() => history.back())
    await waitFor(() => expect(groupId()).toBe('pet'))
    expect(history.state).toMatchObject(entry(1, 1))

    await act(async () => sending.resolve('invalid'))

    // 오류가 있는 묶음(희망 날짜)으로 옮기고, 칸과 초안도 그 묶음을 적는다. 위치는 그대로다.
    await waitFor(() => expect(groupId()).toBe('visit'))
    expect(within(box('wish1_date')).getByRole('alert')).toHaveTextContent('오늘 이후 날짜를 골라 주세요')
    expect(history.state).toMatchObject(entry(2, 1))
    expect(onDraft).toHaveBeenLastCalledWith({ answers, groupIndex: 2, submissionId: ID, key: KEY })
  })

  it('보내는 중에 언마운트되면 결과가 와도 이력·초안을 건드리지 않는다', async () => {
    // 앞 묶음이 비어 있어 서버가 거절하면 그 묶음으로 옮겨야 하는 초안이다.
    const answers = validAnswers(applyForm)
    delete answers.guardian_name
    const { onSubmit, onDraft, unmount } = setup({ initial: draft(2, answers) })
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
    await waitFor(() => expect(scrolledTo().at(-1)).toBe(box('wish1_date')))
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
    expect(within(box('wish2_slot')).getByRole('radiogroup')).not.toBeRequired()
    expect(isBlocked(action('submit'))).toBe(false)

    write('희망 날짜 2순위', '2026-10-30')

    // 날짜를 고르면 시간대는 필수가 된다(보조 기기에도). 날짜 쪽은 여전히 선택이다.
    expect(within(box('wish2_slot')).queryByText('선택')).not.toBeInTheDocument()
    expect(within(box('wish2_slot')).getByRole('radiogroup')).toBeRequired()
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
