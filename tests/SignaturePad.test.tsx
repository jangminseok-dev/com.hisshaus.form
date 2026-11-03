import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignaturePad } from '../components/SignaturePad'
import { decodeSignature } from '../lib/signature'

beforeEach(() => {
  // jsdom 은 캔버스 그리기를 구현하지 않는다. 컨텍스트가 없어도 그리기만 건너뛰는지 함께 본다.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => vi.restoreAllMocks())

/** 화면 폭 300 짜리 칸(논리 600×200 의 절반)으로 만든다. */
function mockRect(canvas: HTMLElement) {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON() {},
  })
}

function drag(canvas: HTMLElement, points: [number, number][]) {
  const [first, ...rest] = points
  fireEvent.pointerDown(canvas, { clientX: first[0], clientY: first[1], pointerId: 1 })
  for (const [x, y] of rest) fireEvent.pointerMove(canvas, { clientX: x, clientY: y, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: rest.at(-1)![0], clientY: rest.at(-1)![1], pointerId: 1 })
}

describe('SignaturePad', () => {
  it('사인 칸은 서명 칸이라는 이름이 있고 touch-action 이 none 이며, 끌면 onChange 에 획이 담긴다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸') as HTMLCanvasElement
    expect(canvas.style.touchAction).toBe('none')
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(200)
    mockRect(canvas)
    drag(canvas, [[10, 10], [20, 20], [50, 30]])
    expect(onChange).toHaveBeenCalledTimes(1)
    // 화면 좌표는 논리 상자로 두 배가 된다
    expect(decodeSignature(onChange.mock.calls[0][0])).toEqual([[[20, 20], [40, 40], [100, 60]]])
  })

  it('상자 밖으로 끌어도 좌표는 상자 안으로 맞춘다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    drag(canvas, [[-10, -10], [400, 300]])
    expect(decodeSignature(onChange.mock.calls[0][0])).toEqual([[[0, 0], [600, 200]]])
  })

  it('이미 사인이 있으면 새 획을 뒤에 더한다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="1,1 9,9" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    drag(canvas, [[100, 50], [150, 50]])
    expect(onChange.mock.calls[0][0]).toBe('1,1 9,9;200,100 300,100')
  })

  it('점 하나만 찍은 손짓은 무시한다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('4000자를 넘게 되는 획은 버리고 기존 값을 지킨다', () => {
    const onChange = vi.fn()
    // 3000자가 넘는 기존 사인: 획 둘에 점 245개씩
    const big = Array.from({ length: 245 }, (_, i) => `${100 + (i % 2) * 5},${100 + (i % 3) * 5}`).join(' ')
    const value = `${big};${big}`
    expect(value.length).toBeGreaterThan(3000)
    expect(value.length).toBeLessThanOrEqual(4000)
    render(<SignaturePad value={value} onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    // 새 획이 1000자 넘게 → 합치면 4000자 초과
    const pts: [number, number][] = Array.from({ length: 300 }, (_, i) => [(i % 2) * 140, 5 + (i % 5) * 20])
    drag(canvas, pts)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('취소된 손짓은 끝점을 더하지 않고 그때까지 그린 점으로 획을 확정한다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 })
    // 취소 이벤트의 좌표는 보통 0,0 이다
    fireEvent.pointerCancel(canvas, { clientX: 0, clientY: 0, pointerId: 1 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(decodeSignature(onChange.mock.calls[0][0])).toEqual([[[20, 20], [100, 60]]])
  })

  it('점 하나만 그리고 취소되면 버린다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerCancel(canvas, { clientX: 0, clientY: 0, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('획이 진행 중일 때 다른 pointerId 의 입력은 무시한다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="" onChange={onChange} />)
    const canvas = screen.getByLabelText('서명 칸')
    mockRect(canvas)
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerDown(canvas, { clientX: 200, clientY: 90, pointerId: 2 })
    fireEvent.pointerMove(canvas, { clientX: 250, clientY: 90, pointerId: 2 })
    fireEvent.pointerUp(canvas, { clientX: 250, clientY: 90, pointerId: 2 })
    fireEvent.pointerCancel(canvas, { clientX: 0, clientY: 0, pointerId: 2 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: 50, clientY: 30, pointerId: 1 })
    expect(decodeSignature(onChange.mock.calls[0][0])).toEqual([[[20, 20], [100, 60]]])
  })

  it('다시 그리기는 빈 값으로 바꾼다', () => {
    const onChange = vi.fn()
    render(<SignaturePad value="1,1 9,9" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: '다시 그리기' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('값이 없을 때만 안내 글이 보인다', () => {
    const { rerender, container } = render(<SignaturePad value="" onChange={() => {}} />)
    expect(screen.getByText('여기에 사인해 주세요')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('여기에 사인해 주세요')
    rerender(<SignaturePad value="1,1 9,9" onChange={() => {}} />)
    expect(screen.queryByText('여기에 사인해 주세요')).toBeNull()
  })
})
