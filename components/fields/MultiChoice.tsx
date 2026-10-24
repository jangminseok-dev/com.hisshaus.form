'use client'

import { OTHER_PREFIX } from '../../lib/validate'
import styles from './Field.module.css'
import { Chip, describedBy, fieldIds, type FieldProps, Frame, isOtherValue, OtherInput } from './parts'

/**
 * 여러 개 고르는 칩 묶음. 누를 때마다 켜고 끈다. 기타는 배열 안에 한 원소('기타: ' + 입력)뿐이다.
 * 다른 필드와 달리 aria-required 를 달지 않는다: ARIA 가 group 역할에서 지원하지 않고 크로미움도 버린다.
 */
export function MultiChoice({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const picked = Array.isArray(value) ? value : []
  const otherAt = q.other ? picked.findIndex(isOtherValue) : -1
  const described = describedBy(q, error)

  const toggle = (option: string) =>
    onChange(picked.includes(option) ? picked.filter((x) => x !== option) : [...picked, option])
  const toggleOther = () =>
    onChange(otherAt >= 0 ? picked.filter((x) => !isOtherValue(x)) : [...picked, OTHER_PREFIX])
  // 입력을 고치면 배열의 그 자리에서 바꾼다.
  const editOther = (text: string) => onChange(picked.map((x, i) => (i === otherAt ? OTHER_PREFIX + text : x)))

  return (
    <Frame q={q} error={error} heading="text">
      <div
        id={ids.input}
        role="group"
        aria-labelledby={ids.label}
        aria-describedby={described}
        aria-invalid={error ? true : undefined}
        className={styles.chips}
      >
        {(q.options ?? []).map((option) => (
          <Chip key={option} role="checkbox" checked={picked.includes(option)} onClick={() => toggle(option)}>
            {option}
          </Chip>
        ))}
        {q.other && (
          <Chip role="checkbox" checked={otherAt >= 0} onClick={toggleOther}>
            기타
          </Chip>
        )}
      </div>
      {otherAt >= 0 && (
        <OtherInput
          text={picked[otherAt].slice(OTHER_PREFIX.length)}
          onText={editOther}
          described={described}
          invalid={!!error}
        />
      )}
    </Frame>
  )
}
