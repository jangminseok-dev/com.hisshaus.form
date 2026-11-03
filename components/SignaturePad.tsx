'use client'

import { useCallback, useEffect, useRef } from 'react'
import { decodeSignature, encodeSignature, SIG_H, SIG_MAX_CHARS, SIG_W, simplify, type Stroke } from '../lib/signature'
import styles from './SignaturePad.module.css'

function drawStrokes(canvas: HTMLCanvasElement | null, strokes: Stroke[]) {
  // jsdom 처럼 그릴 수 없는 환경에서는 컨텍스트가 없다. 그리기만 건너뛴다.
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  ctx.clearRect(0, 0, SIG_W, SIG_H)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#1c1b19'
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    ctx.beginPath()
    ctx.moveTo(stroke[0][0], stroke[0][1])
    // 한 점만 찍어도 점으로 보이게 같은 자리로 선을 긋는다.
    if (stroke.length === 1) ctx.lineTo(stroke[0][0], stroke[0][1])
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i][0], stroke[i][1])
    ctx.stroke()
  }
}

export function SignaturePad({ value, onChange }: { value: string; onChange(v: string): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** 진행 중인 획과 그것을 그리는 포인터. 다른 손가락·손바닥의 입력은 섞이지 않게 pointerId 로 가른다. */
  const current = useRef<{ id: number; stroke: Stroke } | null>(null)

  const saved = useCallback((): Stroke[] => decodeSignature(value) ?? [], [value])

  useEffect(() => {
    drawStrokes(canvasRef.current, saved())
  }, [saved])

  /** 화면 좌표를 논리 상자(600×200)의 정수 좌표로 바꾼다. 상자 밖은 가장자리로 맞춘다. */
  function toPoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * SIG_W : 0
    const y = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * SIG_H : 0
    return [Math.min(SIG_W, Math.max(0, Math.round(x))), Math.min(SIG_H, Math.max(0, Math.round(y)))]
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (current.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    current.current = { id: e.pointerId, stroke: [toPoint(e)] }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const cur = current.current
    if (!cur || cur.id !== e.pointerId) return
    cur.stroke.push(toPoint(e))
    drawStrokes(canvasRef.current, [...saved(), cur.stroke])
  }

  /** 그리던 획까지 모두 버린다. 손 떼기 소식이 오지 않아 남은 획이 있어도 바로 새로 그릴 수 있다. */
  function reset() {
    current.current = null
    // 값이 이미 비어 있으면 다시 그려지지 않으니 그리던 선을 직접 지운다.
    drawStrokes(canvasRef.current, [])
    onChange('')
  }

  /**
   * 획을 확정한다. 취소(cancel)는 좌표가 믿을 수 없으니(보통 0,0) 끝점을 더하지 않는다.
   * 포인터 잡기를 잃었을 때(lostpointercapture)도 취소처럼 끝낸다: 손 떼기·취소 소식이 끝내 오지 않으면 획이 남아 그리기가 막힌다.
   * 보통은 손 떼기 다음에 오므로 그때는 이미 끝난 획이라 아무 일도 없다.
   */
  function finish(e: React.PointerEvent<HTMLCanvasElement>, canceled: boolean) {
    const cur = current.current
    if (!cur || cur.id !== e.pointerId) return
    current.current = null
    const stroke = cur.stroke
    if (!canceled) {
      // 손을 뗀 자리가 마지막 점과 같으면 겹쳐 더하지 않는다.
      const end = toPoint(e)
      const last = stroke[stroke.length - 1]
      if (end[0] !== last[0] || end[1] !== last[1]) stroke.push(end)
    }
    const done = simplify(stroke)
    // 한 점짜리(콕 찍기)는 선이 아니다. 4000자를 넘기면 이 획을 버려 값이 늘 올바르게 남게 한다.
    const next = done.length >= 2 ? encodeSignature([...saved(), done]) : ''
    if (next && next.length <= SIG_MAX_CHARS) onChange(next)
    else drawStrokes(canvasRef.current, saved())
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ touchAction: 'none' }}
          width={SIG_W}
          height={SIG_H}
          aria-label="서명 칸"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={(e) => finish(e, false)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
        />
        {value === '' && (
          <span className={styles.hint} aria-hidden="true">
            여기에 사인해 주세요
          </span>
        )}
      </div>
      <button type="button" className={styles.reset} onClick={reset}>
        다시 그리기
      </button>
    </div>
  )
}
