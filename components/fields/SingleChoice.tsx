'use client'

import { OTHER_PREFIX } from '../../lib/validate'
import styles from './Field.module.css'
import { Chip, describedBy, fieldIds, type FieldProps, Frame, isOtherValue, OtherInput } from './parts'

/** 하나만 고르는 칩 묶음. other 면 '기타' 칩이 더해지고, 고르면 아래에 한 줄 입력이 열린다. */
export function SingleChoice({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const picked = typeof value === 'string' ? value : ''
  const otherOn = !!q.other && isOtherValue(picked)
  const described = describedBy(q, error)
  return (
    <Frame q={q} error={error} heading="text">
      <div
        id={ids.input}
        role="radiogroup"
        aria-labelledby={ids.label}
        aria-describedby={described}
        aria-invalid={error ? true : undefined}
        className={styles.chips}
      >
        {(q.options ?? []).map((option) => (
          <Chip key={option} role="radio" checked={picked === option} onClick={() => onChange(option)}>
            {option}
          </Chip>
        ))}
        {q.other && (
          // 이미 켜져 있으면 다시 눌러도 쓴 내용을 지우지 않는다.
          <Chip role="radio" checked={otherOn} onClick={() => !otherOn && onChange(OTHER_PREFIX)}>
            기타
          </Chip>
        )}
      </div>
      {otherOn && (
        <OtherInput
          text={picked.slice(OTHER_PREFIX.length)}
          onText={(text) => onChange(OTHER_PREFIX + text)}
          described={described}
          invalid={!!error}
        />
      )}
    </Frame>
  )
}
