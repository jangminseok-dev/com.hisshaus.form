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
  const current = useRef<Stroke | null>(null)

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
    e.currentTarget.setPointerCapture?.(e.pointerId)
    current.current = [toPoint(e)]
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = current.current
    if (!stroke) return
    stroke.push(toPoint(e))
    drawStrokes(canvasRef.current, [...saved(), stroke])
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = current.current
    if (!stroke) return
    current.current = null
    // 손을 뗀 자리가 마지막 점과 같으면 겹쳐 더하지 않는다.
    const end = toPoint(e)
    const last = stroke[stroke.length - 1]
    if (end[0] !== last[0] || end[1] !== last[1]) stroke.push(end)
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
          onPointerUp={up}
          onPointerCancel={up}
        />
        {value === '' && (
          <span className={styles.hint} aria-hidden="true">
            여기에 사인해 주세요
          </span>
        )}
      </div>
      <button type="button" className={styles.reset} onClick={() => onChange('')}>
        다시 그리기
      </button>
    </div>
  )
}
