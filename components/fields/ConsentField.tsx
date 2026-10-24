'use client'

import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

/** 동의 본문과 체크 하나. 켜면 '동의', 끄면 ''. */
export function ConsentField({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const textId = `${ids.input}-text`
  return (
    <Frame q={q} error={error} heading="none">
      {q.consentText && (
        <p id={textId} className={styles.consentBox}>
          {q.consentText}
        </p>
      )}
      <div className={styles.checkRow}>
        <input
          type="checkbox"
          id={ids.input}
          className={styles.checkbox}
          checked={value === '동의'}
          onChange={(e) => onChange(e.target.checked ? '동의' : '')}
          aria-describedby={describedBy(q, error, q.consentText ? textId : undefined)}
          aria-invalid={error ? true : undefined}
          aria-required={q.required || undefined}
        />
        <label id={ids.label} htmlFor={ids.input} className={styles.checkLabel}>
          {q.label}
        </label>
      </div>
    </Frame>
  )
}
