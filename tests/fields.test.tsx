import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Field } from '../components/fields/Field'
import type { Answer, Question } from '../forms/types'

const TODAY = '2026-10-23'

const shortQ: Question = { id: 'name', label: '보호자 성함', type: 'short', required: true }
const phoneQ: Question = { id: 'phone', label: '보호자 연락처', type: 'phone', required: true }
const emailQ: Question = { id: 'mail', label: '이메일', type: 'email', required: true }
const longQ: Question = { id: 'health', label: '건강상태에 대해 알려주세요.', type: 'long', required: true }
const singleQ: Question = { id: 'sex', label: '반려견 성별', type: 'single', required: true, options: ['남', '여'] }
const singleOtherQ: Question = {
  id: 'met',
  label: '몇 명과 만났나요',
  type: 'single',
  required: true,
  options: ['10명 이하', '20명 이하'],
  other: true,
}
const multiQ: Question = {
  id: 'services',
  label: '이용 서비스',
  type: 'multi',
  required: true,
  options: ['미용', '데이케어', '호텔'],
}
const multiOtherQ: Question = {
  id: 'rest',
  label: '휴식 공간',
  type: 'multi',
  required: false,
  options: ['울타리', '방석'],
  other: true,
}
const dateQ: Question = { id: 'wish', label: '희망 날짜', type: 'date', required: true }
const consentQ: Question = {
  id: 'agree',
  label: '개인정보 수집·이용 동의',
  type: 'consent',
  required: true,
  consentText: '성함과 연락처를 받아요.\n예약 안내에만 써요.',
}

/** 부모처럼 값을 쥐고 있는 껍데기. 값이 바뀌면 다시 그려진다. */
function Harness({
  q,
  initial,
  error,
  onChange,
}: {
  q: Question
  initial?: Answer
  error?: string
  onChange(v: Answer): void
}) {
  const [value, setValue] = useState<Answer | undefined>(initial)
  return (
    <Field
      q={q}
      value={value}
      error={error}
      today={TODAY}
      onChange={(v) => {
        onChange(v)
        setValue(v)
      }}
    />
  )
}

function renderField(q: Question, opts: { initial?: Answer; error?: string } = {}) {
  const onChange = vi.fn<(v: Answer) => void>()
  const view = render(<Harness q={q} onChange={onChange} {...opts} />)
  const last = () => onChange.mock.lastCall?.[0]
  return { ...view, onChange, last }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('단일 선택', () => {
  it('단일 선택은 하나만 켜진다', () => {
    const { last } = renderField(singleQ)
    const male = screen.getByRole('radio', { name: '남' })
    const female = screen.getByRole('radio', { name: '여' })
    expect(male).not.toBeChecked()
    expect(female).not.toBeChecked()

    fireEvent.click(male)
    expect(male).toBeChecked()
    expect(female).not.toBeChecked()
    expect(last()).toBe('남')

    fireEvent.click(female)
    expect(male).not.toBeChecked()
    expect(female).toBeChecked()
    expect(last()).toBe('여')
  })

  it('켜진 칩을 다시 눌러도 꺼지지 않는다', () => {
    const { last } = renderField(singleQ)
    const male = screen.getByRole('radio', { name: '남' })
    fireEvent.click(male)
    fireEvent.click(male)
    expect(male).toBeChecked()
    expect(last()).toBe('남')
  })

  it('칩 묶음은 라디오 그룹이고 이름이 문항 그대로다', () => {
    renderField(singleQ)
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('반려견 성별')
    // 라벨 글로도 찾아진다(aria-labelledby).
    expect(screen.getByLabelText('반려견 성별')).toBe(screen.getByRole('radiogroup'))
  })

  it('칩은 폼을 보내지 않는 버튼이다', () => {
    renderField(singleQ)
    const chip = screen.getByRole('radio', { name: '남' })
    expect(chip.tagName).toBe('BUTTON')
    expect(chip).toHaveAttribute('type', 'button')
  })

  it('기타를 고르면 입력이 열리고 값이 기타: 로 시작한다', () => {
    const { last } = renderField(singleOtherQ)
    expect(screen.queryByLabelText('기타 내용')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '기타' }))
    expect(screen.getByRole('radio', { name: '기타' })).toBeChecked()
    expect(last()).toBe('기타: ')

    const input = screen.getByLabelText('기타 내용')
    expect(input).toHaveAttribute('placeholder', '직접 적어 주세요')
    fireEvent.change(input, { target: { value: '펫시터' } })
    expect(last()).toBe('기타: 펫시터')
    expect(input).toHaveValue('펫시터')
  })

  it('기타 칩을 다시 눌러도 쓴 내용은 그대로다', () => {
    const { last } = renderField(singleOtherQ, { initial: '기타: 펫시터' })
    fireEvent.click(screen.getByRole('radio', { name: '기타' }))
    expect(screen.getByRole('radio', { name: '기타' })).toBeChecked()
    expect(screen.getByLabelText('기타 내용')).toHaveValue('펫시터')
    expect(last()).toBeUndefined()
  })

  it('기타를 고른 뒤 다른 칩을 고르면 입력이 닫힌다', () => {
    const { last } = renderField(singleOtherQ)
    fireEvent.click(screen.getByRole('radio', { name: '기타' }))
    fireEvent.click(screen.getByRole('radio', { name: '10명 이하' }))
    expect(screen.queryByLabelText('기타 내용')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '기타' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: '10명 이하' })).toBeChecked()
    expect(last()).toBe('10명 이하')
  })

  it('저장된 기타 값이면 기타 칩이 켜지고 입력에 나머지를 보여 준다', () => {
    renderField(singleOtherQ, { initial: '기타: 펫시터' })
    expect(screen.getByRole('radio', { name: '기타' })).toBeChecked()
    expect(screen.getByLabelText('기타 내용')).toHaveValue('펫시터')
  })

  it('기타 입력은 값 전체가 200자를 넘지 않게 제한한다', () => {
    renderField(singleOtherQ, { initial: '기타: ' })
    // '기타: ' 가 4자라서 입력은 196자까지다.
    expect(screen.getByLabelText('기타 내용')).toHaveAttribute('maxlength', '196')
  })

  it('기타가 없는 문항에는 기타 칩이 없다', () => {
    renderField(singleQ)
    expect(screen.queryByRole('radio', { name: '기타' })).not.toBeInTheDocument()
  })
})

describe('복수 선택', () => {
  it('복수 선택은 여러 개가 켜진다', () => {
    const { last } = renderField(multiQ)
    const care = screen.getByRole('checkbox', { name: '미용' })
    const hotel = screen.getByRole('checkbox', { name: '호텔' })
    const daycare = screen.getByRole('checkbox', { name: '데이케어' })

    fireEvent.click(care)
    fireEvent.click(hotel)
    expect(care).toBeChecked()
    expect(hotel).toBeChecked()
    expect(daycare).not.toBeChecked()
    expect(last()).toEqual(['미용', '호텔'])
  })

  it('켜진 칩을 누르면 꺼진다', () => {
    const { last } = renderField(multiQ, { initial: ['미용', '호텔'] })
    fireEvent.click(screen.getByRole('checkbox', { name: '미용' }))
    expect(screen.getByRole('checkbox', { name: '미용' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '호텔' })).toBeChecked()
    expect(last()).toEqual(['호텔'])
  })

  it('칩 묶음은 그룹이고 이름이 문항 그대로다', () => {
    renderField(multiQ)
    expect(screen.getByRole('group')).toHaveAccessibleName('이용 서비스')
    expect(screen.getByLabelText('이용 서비스')).toBe(screen.getByRole('group'))
  })

  it('기타를 켜면 입력이 열리고 배열에 기타: 가 들어간다', () => {
    const { last } = renderField(multiOtherQ, { initial: ['울타리'] })
    expect(screen.queryByLabelText('기타 내용')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '기타' }))
    expect(screen.getByRole('checkbox', { name: '기타' })).toBeChecked()
    expect(last()).toEqual(['울타리', '기타: '])

    const input = screen.getByLabelText('기타 내용')
    expect(input).toHaveAttribute('placeholder', '직접 적어 주세요')
    fireEvent.change(input, { target: { value: '소파' } })
    expect(last()).toEqual(['울타리', '기타: 소파'])
  })

  it('기타를 끄면 배열에서 기타가 빠지고 입력이 닫힌다', () => {
    // 기타가 맨 뒤가 아닌 자리에 있어도 그 원소만 빠진다.
    const { last } = renderField(multiOtherQ, { initial: ['기타: 소파', '울타리'] })
    fireEvent.click(screen.getByRole('checkbox', { name: '기타' }))
    expect(last()).toEqual(['울타리'])
    expect(screen.queryByLabelText('기타 내용')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '기타' })).not.toBeChecked()
  })

  it('기타 입력을 고치면 배열의 그 자리에서 바뀐다', () => {
    const { last } = renderField(multiOtherQ, { initial: ['울타리', '기타: 소파', '방석'] })
    expect(screen.getByLabelText('기타 내용')).toHaveValue('소파')
    fireEvent.change(screen.getByLabelText('기타 내용'), { target: { value: '소파 위' } })
    expect(last()).toEqual(['울타리', '기타: 소파 위', '방석'])
  })

  it('기타를 켰다 껐다 해도 배열에 기타는 하나뿐이다', () => {
    const { last } = renderField(multiOtherQ)
    const other = screen.getByRole('checkbox', { name: '기타' })
    fireEvent.click(other)
    fireEvent.click(other)
    fireEvent.click(other)
    expect(last()).toEqual(['기타: '])
  })
})

describe('글 입력', () => {
  it('짧은 답은 라벨에 이어진 텍스트 입력이고 200자까지다', () => {
    const { last } = renderField(shortQ)
    const input = screen.getByLabelText('보호자 성함')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('maxlength', '200')

    fireEvent.change(input, { target: { value: '김하나' } })
    expect(last()).toBe('김하나')
    expect(input).toHaveValue('김하나')
  })

  it('연락처는 전화 입력이다', () => {
    renderField(phoneQ)
    const input = screen.getByLabelText('보호자 연락처')
    expect(input).toHaveAttribute('type', 'tel')
    expect(input).toHaveAttribute('inputmode', 'tel')
    expect(input).toHaveAttribute('autocomplete', 'tel')
    expect(input).toHaveAttribute('maxlength', '200')
  })

  it('이메일은 이메일 입력이다', () => {
    renderField(emailQ)
    const input = screen.getByLabelText('이메일')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toHaveAttribute('inputmode', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('maxlength', '200')
  })

  it('긴 답은 세 줄짜리 여러 줄 입력이고 3000자까지다', () => {
    const { last } = renderField(longQ)
    const area = screen.getByLabelText('건강상태에 대해 알려주세요.')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveAttribute('rows', '3')
    expect(area).toHaveAttribute('maxlength', '3000')

    fireEvent.change(area, { target: { value: '첫 줄\n둘째 줄' } })
    expect(last()).toBe('첫 줄\n둘째 줄')
  })

  it('긴 답은 값이 바뀔 때마다 높이를 내용에 맞춘다', () => {
    // jsdom 은 배치를 하지 않아 scrollHeight 가 늘 0 이다. 내용 높이를 가짜로 준다.
    const height = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(140)
    renderField(longQ)
    const area = screen.getByLabelText('건강상태에 대해 알려주세요.')
    expect(area.style.height).toBe('140px')

    height.mockReturnValue(260)
    fireEvent.change(area, { target: { value: '줄\n'.repeat(10) } })
    expect(area.style.height).toBe('260px')
  })
})

describe('날짜', () => {
  it('날짜 입력은 오늘을 min 으로 가진다', () => {
    renderField(dateQ)
    const input = screen.getByLabelText('희망 날짜')
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('min', TODAY)
  })

  it('날짜를 고르면 YYYY-MM-DD 값을 돌려준다', () => {
    const { last } = renderField(dateQ)
    expect(screen.getByLabelText('희망 날짜')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('희망 날짜'), { target: { value: '2026-10-28' } })
    expect(last()).toBe('2026-10-28')
    expect(screen.getByLabelText('희망 날짜')).toHaveValue('2026-10-28')
  })
})

describe('동의', () => {
  it('동의 문항은 본문과 체크 하나를 보여 주고 켜면 동의, 끄면 빈 값이다', () => {
    const { last } = renderField(consentQ)
    expect(screen.getByText(/성함과 연락처를 받아요\./)).toBeInTheDocument()
    const box = screen.getByLabelText('개인정보 수집·이용 동의')
    expect(box).toHaveAttribute('type', 'checkbox')
    expect(box).not.toBeChecked()
    // 본문을 읽어 주는 쪽에서도 체크와 함께 듣는다.
    expect(box).toHaveAccessibleDescription(expect.stringContaining('예약 안내에만 써요.'))

    fireEvent.click(box)
    expect(box).toBeChecked()
    expect(last()).toBe('동의')

    fireEvent.click(box)
    expect(box).not.toBeChecked()
    expect(last()).toBe('')
  })

  it('이미 동의한 값이면 체크되어 있다', () => {
    renderField(consentQ, { initial: '동의' })
    expect(screen.getByLabelText('개인정보 수집·이용 동의')).toBeChecked()
  })
})

describe('오류·안내·표시', () => {
  it('오류가 있으면 alert 로 보인다', () => {
    renderField(shortQ, { error: '꼭 적어 주세요' })
    expect(screen.getByRole('alert')).toHaveTextContent('꼭 적어 주세요')
    const input = screen.getByLabelText('보호자 성함')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('꼭 적어 주세요')
  })

  it('오류가 없으면 alert 도 aria-invalid 도 없다', () => {
    renderField(shortQ)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('보호자 성함')).not.toHaveAttribute('aria-invalid')
  })

  it('칩 묶음의 오류도 alert 로 보이고 그룹에 이어진다', () => {
    renderField(singleQ, { error: '하나를 골라 주세요' })
    expect(screen.getByRole('alert')).toHaveTextContent('하나를 골라 주세요')
    const group = screen.getByRole('radiogroup')
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('하나를 골라 주세요')
  })

  it('기타 입력에도 오류가 이어진다', () => {
    renderField(singleOtherQ, { initial: '기타: ', error: '기타 내용을 적어 주세요' })
    const input = screen.getByLabelText('기타 내용')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('기타 내용을 적어 주세요')
  })

  it('안내문은 입력의 설명으로 이어지고 오류와 함께 읽힌다', () => {
    const withHint: Question = { ...shortQ, hint: '정확하지 않으면 대략 적어도 돼요' }
    const { rerender } = render(<Field q={withHint} value="" today={TODAY} onChange={() => {}} />)
    expect(screen.getByText('정확하지 않으면 대략 적어도 돼요')).toBeInTheDocument()
    expect(screen.getByLabelText('보호자 성함')).toHaveAccessibleDescription('정확하지 않으면 대략 적어도 돼요')

    rerender(<Field q={withHint} value="" error="꼭 적어 주세요" today={TODAY} onChange={() => {}} />)
    expect(screen.getByLabelText('보호자 성함')).toHaveAccessibleDescription(
      '정확하지 않으면 대략 적어도 돼요 꼭 적어 주세요',
    )
  })

  it('안내문은 칩 묶음에도 이어진다', () => {
    renderField({ ...singleQ, hint: '한 개만 선택해주세요.' })
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription('한 개만 선택해주세요.')
  })

  it('id 는 q-<문항>, -label, -hint, -error 규칙을 따른다', () => {
    const q: Question = { ...shortQ, hint: '안내' }
    const { container } = render(<Field q={q} value="" error="오류" today={TODAY} onChange={() => {}} />)
    expect(container.querySelector('input')).toHaveAttribute('id', 'q-name')
    expect(container.querySelector('label')).toHaveAttribute('id', 'q-name-label')
    expect(container.querySelector('label')).toHaveAttribute('for', 'q-name')
    expect(container.querySelector('#q-name-hint')).toHaveTextContent('안내')
    expect(container.querySelector('#q-name-error')).toHaveTextContent('오류')
  })

  it('문항 감싸개에 data-question 이 붙는다', () => {
    const { container } = renderField(singleQ)
    expect(container.querySelector('[data-question="sex"]')).toContainElement(screen.getByRole('radiogroup'))
  })

  it.each([
    ['짧은 답', shortQ],
    ['연락처', phoneQ],
    ['이메일', emailQ],
    ['긴 답', longQ],
    ['날짜', dateQ],
    ['단일 선택', singleQ],
    ['복수 선택', multiQ],
  ])('선택 문항에는 선택 표시가 있고 라벨 이름은 문항 그대로다 — %s', (_, base) => {
    const q: Question = { ...base, required: false }
    const { container } = renderField(q)
    const box = container.querySelector<HTMLElement>(`[data-question="${q.id}"]`)!
    expect(within(box).getByText('선택')).toBeInTheDocument()

    const control =
      q.type === 'single'
        ? screen.getByRole('radiogroup')
        : q.type === 'multi'
          ? screen.getByRole('group')
          : screen.getByLabelText(q.label)
    expect(control).toHaveAccessibleName(q.label)
  })

  it('필수 문항에는 선택 표시가 없다', () => {
    renderField(shortQ)
    expect(screen.queryByText('선택')).not.toBeInTheDocument()
    renderField(singleQ)
    expect(screen.queryByText('선택')).not.toBeInTheDocument()
  })
})

describe('필수 여부를 보조 기기에 알린다', () => {
  // 화면은 선택 문항에만 '선택' 을 붙이고 필수에는 표시가 없다. 보조 기기는 입력의 aria-required 로 필수를 듣는다.
  // 값은 StepForm 이 넘긴 지금의 필수 여부(q.required)다.
  it.each([
    ['짧은 답', shortQ],
    ['연락처', phoneQ],
    ['이메일', emailQ],
    ['긴 답', longQ],
    ['날짜', dateQ],
    ['동의', consentQ],
  ])('%s 입력은 필수면 aria-required 이고 선택이면 아니다', (_, base) => {
    const { unmount } = renderField(base)
    expect(screen.getByLabelText(base.label)).toHaveAttribute('aria-required', 'true')
    unmount()
    renderField({ ...base, required: false })
    expect(screen.getByLabelText(base.label)).not.toHaveAttribute('aria-required')
  })

  it('단일 선택의 라디오 그룹은 필수면 aria-required 이고 선택이면 아니다', () => {
    const { unmount } = renderField(singleQ)
    expect(screen.getByRole('radiogroup')).toBeRequired()
    unmount()
    renderField({ ...singleQ, required: false })
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-required')
  })

  it('복수 선택 그룹에는 aria-required 를 달지 않는다 — ARIA 가 group 에서 지원하지 않고 크로미움도 버린다', () => {
    renderField(multiQ)
    expect(screen.getByRole('group')).not.toHaveAttribute('aria-required')
  })

  it('흐린 글자 색(--mute)은 흰 바탕과 대비가 4.5:1 이상이다', () => {
    // '선택' 표시(13px)·진행 'k / N'(14px)·입력 안내 글이 이 색이다. 작은 글자의 기준(WCAG AA)이 4.5:1 이다.
    const css = readFileSync(join(import.meta.dirname, '..', 'app', 'globals.css'), 'utf8')
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css)![1]
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const [fg, bg] = [luminance(token('mute')), luminance(token('bg'))]
    expect((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})
