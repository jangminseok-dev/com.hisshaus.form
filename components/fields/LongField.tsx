'use client'

import { useLayoutEffect, useRef } from 'react'

import { LONG_MAX } from '../../lib/validate'
import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

/** 여러 줄 글 입력. 높이가 내용을 따라 자란다. */
export function LongField({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const text = typeof value === 'string' ? value : ''
  const area = useRef<HTMLTextAreaElement>(null)

  // 먼저 줄여야 글을 지웠을 때 높이도 줄어든다. 테두리는 scrollHeight 에 들어 있지 않아 더한다.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [text])

  return (
    <Frame q={q} error={error} heading="label">
      <textarea
        ref={area}
        id={ids.input}
        className={styles.textarea}
        rows={3}
        maxLength={LONG_MAX}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(q, error)}
        aria-invalid={error ? true : undefined}
      />
    </Frame>
  )
}
