'use client'

import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

/** 날짜 고르기. 오늘 이전은 고를 수 없다. 값은 YYYY-MM-DD 또는 ''. */
export function DateField({ q, value, error, onChange, today }: FieldProps & { today: string }) {
  const ids = fieldIds(q)
  return (
    <Frame q={q} error={error} heading="label">
      <input
        type="date"
        id={ids.input}
        className={styles.input}
        min={today}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy(q, error)}
        aria-invalid={error ? true : undefined}
      />
    </Frame>
  )
}
