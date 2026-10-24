'use client'

import { OTHER_PREFIX } from '../../lib/validate'
import styles from './Field.module.css'
import { Chip, describedBy, fieldIds, type FieldProps, Frame, isOtherValue, OtherInput } from './parts'

/**
 * 하나만 고르는 칩 묶음. other 면 '기타' 칩이 더해지고, 고르면 아래에 한 줄 입력이 열린다.
 * 선택 문항(지금 기준)은 켜진 칩을 다시 누르면 '' 로 해제한다. 그러지 않으면 한 번 고른 뒤 비워 둘 방법이 없다.
 * 필수 문항은 다시 눌러도 그대로다.
 */
export function SingleChoice({ q, value, error, onChange }: FieldProps) {
  const ids = fieldIds(q)
  const picked = typeof value === 'string' ? value : ''
  const otherOn = !!q.other && isOtherValue(picked)
  const described = describedBy(q, error)
  const choose = (option: string) => onChange(!q.required && picked === option ? '' : option)
  const chooseOther = () => {
    if (!otherOn) onChange(OTHER_PREFIX)
    // 필수 문항에서는 이미 켜진 기타를 다시 눌러도 쓴 내용을 지우지 않는다.
    else if (!q.required) onChange('')
  }
  return (
    <Frame q={q} error={error} heading="text">
      <div
        id={ids.input}
        role="radiogroup"
        aria-labelledby={ids.label}
        aria-describedby={described}
        aria-invalid={error ? true : undefined}
        aria-required={q.required || undefined}
        className={styles.chips}
      >
        {(q.options ?? []).map((option) => (
          <Chip key={option} role="radio" checked={picked === option} onClick={() => choose(option)}>
            {option}
          </Chip>
        ))}
        {q.other && (
          <Chip role="radio" checked={otherOn} onClick={chooseOther}>
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
