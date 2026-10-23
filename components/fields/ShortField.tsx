'use client'

import { SHORT_MAX } from '../../lib/validate'
import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

const KINDS = {
  short: { type: 'text' },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email' },
} as const

/** 한 줄 글 입력. 이름·연락처·이메일. */
export function ShortField({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const kind = q.type === 'phone' ? KINDS.phone : q.type === 'email' ? KINDS.email : KINDS.short
  return (
    <Frame q={q} error={error} heading="label">
      <input
        {...kind}
        id={ids.input}
        className={styles.input}
        maxLength={SHORT_MAX}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(q, error)}
        aria-invalid={error ? true : undefined}
      />
    </Frame>
  )
}
