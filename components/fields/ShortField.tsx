'use client'

import { formatKoreanPhone } from '../../lib/phone'
import { SHORT_MAX } from '../../lib/validate'
import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

const KINDS = {
  short: { type: 'text' },
  // 이메일·연락처는 맞춤법 검사를 끈다(붉은 밑줄이 오타처럼 보인다).
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel', spellCheck: false },
  email: { type: 'email', inputMode: 'email', autoComplete: 'email', spellCheck: false },
} as const

/** 한 줄 글 입력. 이름·연락처·이메일. 연락처는 적는 대로 하이픈을 넣고, 이름·주소는 브라우저 자동 완성을 받는다. */
export function ShortField({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const kind = q.type === 'phone' ? KINDS.phone : q.type === 'email' ? KINDS.email : KINDS.short
  const autoComplete = q.type === 'short' ? q.autoComplete : undefined
  return (
    <Frame q={q} error={error} heading="label">
      <input
        {...kind}
        autoComplete={autoComplete ?? ('autoComplete' in kind ? kind.autoComplete : undefined)}
        id={ids.input}
        className={styles.input}
        maxLength={SHORT_MAX}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(q.type === 'phone' ? formatKoreanPhone(e.target.value) : e.target.value)}
        aria-describedby={describedBy(q, error)}
        aria-invalid={error ? true : undefined}
        aria-required={q.required || undefined}
      />
    </Frame>
  )
}
