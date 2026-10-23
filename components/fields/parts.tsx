import type { ReactNode } from 'react'

import type { Answer, Question } from '../../forms/types'
import { OTHER_PREFIX, SHORT_MAX } from '../../lib/validate'
import styles from './Field.module.css'

/** 모든 필드가 받는 값. 날짜만 today 를 더 받는다. */
export interface FieldProps {
  q: Question
  value: Answer | undefined
  error?: string
  onChange(v: Answer): void
}

/** 입력·라벨·안내·오류의 id. 라벨의 htmlFor 와 입력의 aria-describedby 가 이걸로 이어진다. */
export function fieldIds(q: Question) {
  const base = `q-${q.id}`
  return { input: base, label: `${base}-label`, hint: `${base}-hint`, error: `${base}-error` }
}

/** 입력의 aria-describedby. 있는 안내·오류만 잇고, extra 는 맨 앞에 붙는다(동의 본문). */
export function describedBy(q: Question, error?: string, extra?: string): string | undefined {
  const ids = fieldIds(q)
  const list = [extra, q.hint ? ids.hint : undefined, error ? ids.error : undefined].filter(Boolean)
  return list.length > 0 ? list.join(' ') : undefined
}

/** 기타 칩을 골라서 생긴 값인가. */
export function isOtherValue(v: string): boolean {
  return v.startsWith(OTHER_PREFIX)
}

interface FrameProps {
  q: Question
  error?: string
  /** label: <label htmlFor> · text: <p>(칩 묶음이 aria-labelledby 로 잇는다) · none: 호출한 쪽이 그린다 */
  heading: 'label' | 'text' | 'none'
  children: ReactNode
}

/** 문항 하나의 틀. 라벨·안내·오류 문단을 같은 모양으로 그린다. */
export function Frame({ q, error, heading, children }: FrameProps) {
  const ids = fieldIds(q)
  return (
    <div className={styles.field} data-question={q.id} data-invalid={error ? 'true' : undefined}>
      {heading !== 'none' && (
        <div className={styles.labelRow}>
          {heading === 'label' ? (
            <label id={ids.label} htmlFor={ids.input} className={styles.label}>
              {q.label}
            </label>
          ) : (
            <p id={ids.label} className={styles.label}>
              {q.label}
            </p>
          )}
          {/* 라벨 밖 형제로 둔다. 안에 두면 라벨의 접근성 이름이 문항 글 그대로가 아니게 된다. */}
          {!q.required && <span className={styles.optional}>선택</span>}
        </div>
      )}
      {q.hint && (
        <p id={ids.hint} className={styles.hint}>
          {q.hint}
        </p>
      )}
      {children}
      {error && (
        <p id={ids.error} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}

/** 고르는 칩. 단일은 radio, 복수는 checkbox 로 읽힌다. */
export function Chip({
  role,
  checked,
  onClick,
  children,
}: {
  role: 'radio' | 'checkbox'
  checked: boolean
  onClick(): void
  children: ReactNode
}) {
  return (
    <button type="button" role={role} aria-checked={checked} className={styles.chip} onClick={onClick}>
      {children}
    </button>
  )
}

/** 기타 칩 아래에 열리는 한 줄 입력. 값 전체('기타: ' + 입력)가 짧은 답 한도를 넘지 않게 자른다. */
export function OtherInput({
  text,
  onText,
  described,
  invalid,
}: {
  text: string
  onText(t: string): void
  described?: string
  invalid: boolean
}) {
  return (
    <input
      type="text"
      aria-label="기타 내용"
      placeholder="직접 적어 주세요"
      maxLength={SHORT_MAX - OTHER_PREFIX.length}
      value={text}
      onChange={(e) => onText(e.target.value)}
      aria-describedby={described}
      aria-invalid={invalid ? true : undefined}
      className={`${styles.input} ${styles.otherInput}`}
    />
  )
}
