'use client'

import { timeKo, timeSlots } from '../../lib/slots'
import styles from './Field.module.css'
import { Chip, describedBy, fieldIds, type FieldProps, Frame } from './parts'

/**
 * 시간 고르기. 영업시간 안의 30분 단위 칩이다. 짝 날짜(q.dateId)가 골라져 있으면 그 요일의 영업시간만 보인다.
 * 날짜를 바꿔서 고른 시간이 범위 밖이 되면 그 칩은 그대로 보이고(검증이 안내한다) 다른 칩을 누르면 바뀐다.
 * 선택 문항은 켜진 칩을 다시 누르면 비운다.
 */
export function TimeField({ q, value, error, onChange, date }: FieldProps & { date?: string }) {
  const ids = fieldIds(q)
  const picked = typeof value === 'string' ? value : ''
  const slots = timeSlots(date)
  const options = picked && !slots.includes(picked) ? [...slots, picked].sort() : slots
  return (
    <Frame q={q} error={error} heading="text">
      <div
        id={ids.input}
        role="radiogroup"
        aria-labelledby={ids.label}
        aria-describedby={describedBy(q, error)}
        aria-invalid={error ? true : undefined}
        aria-required={q.required || undefined}
        className={styles.chips}
      >
        {options.map((t) => (
          <Chip key={t} role="radio" checked={picked === t} onClick={() => onChange(!q.required && picked === t ? '' : t)}>
            {timeKo(t)}
          </Chip>
        ))}
      </div>
    </Frame>
  )
}
