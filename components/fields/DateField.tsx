'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { dateKo } from '../../lib/format'
import { isOpenDay } from '../../lib/slots'
import styles from './Field.module.css'
import { describedBy, fieldIds, type FieldProps, Frame } from './parts'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' ↔ 숫자. 시간대에 안 끌리게 UTC 로만 센다. */
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const monthOf = (s: string) => s.slice(0, 7)
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return ymd(d).slice(0, 7)
}
const shiftDay = (s: string, by: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + by)
  return ymd(d)
}

/** d 부터 dir(1 = 뒤, -1 = 앞) 쪽으로 가장 가까운 여는 날. 쉬는 날은 누를 수 없어 포커스도 갈 수 없다. 두 주 안에 반드시 있다. */
const openFrom = (d: string, dir: 1 | -1, holidays: readonly string[]) => {
  for (let i = 0; i < 14 && !isOpenDay(d, holidays); i++) d = shiftDay(d, dir)
  return d
}

/** 그 달의 달력 칸(6주 × 7일)의 날짜. 앞뒤는 이웃 달 날짜로 채운다. */
function monthCells(ym: string): string[] {
  const first = toDate(`${ym}-01`)
  const start = shiftDay(ymd(first), -first.getUTCDay())
  return Array.from({ length: 42 }, (_, i) => shiftDay(start, i))
}

/**
 * 날짜 고르기. 입력칸을 누르면 아래에 달력이 펼쳐진다(화면 안에 자리를 차지해서 아래 고정 버튼과 겹치지 않는다).
 * 오늘 이전과 쉬는 날(content/shop.ts 의 openHours 에 없는 요일, 받은 공휴일)은 누를 수 없다. 값은 YYYY-MM-DD 또는 ''. 입력칸에는 "2026년 11월 1일 (일)" 로 보인다.
 * 브라우저 기본 달력(type="date")은 기기마다 모양이 다르고 사이트 색과 맞지 않아 직접 그린다.
 * 키보드: 입력칸에서 Enter·Space·↓ 로 열고, 달력 안에서는 화살표로 날짜를 옮기고 Enter 로 고르고 Esc 로 닫는다.
 */
export function DateField({ q, value, error, onChange, today, holidays = [] }: FieldProps & { today: string; holidays?: readonly string[] }) {
  const ids = fieldIds(q)
  const dialogId = useId()
  const current = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthOf(current || today))
  // 달력 안에서 키보드 포커스가 있는 날짜(roving tabindex).
  const [cursor, setCursor] = useState(current || today)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const focusPending = useRef(false)

  function show() {
    const start = openFrom(current && current >= today ? current : today, 1, holidays)
    setMonth(monthOf(start))
    setCursor(start)
    focusPending.current = true
    setOpen(true)
  }
  function hide(refocus = false) {
    setOpen(false)
    if (refocus) inputRef.current?.focus()
  }
  function pick(date: string) {
    onChange(date)
    hide(true)
  }
  function clear() {
    onChange('')
    hide(true)
  }
  function moveCursor(next: string, dir: 1 | -1) {
    // 쉬는 날은 같은 방향으로 건너뛴다. 그러다 오늘보다 앞이 되면 오늘부터 가장 가까운 여는 날로.
    let d = openFrom(next < today ? today : next, dir, holidays)
    if (d < today) d = openFrom(today, 1, holidays)
    setCursor(d)
    setMonth(monthOf(d))
    focusPending.current = true
  }

  // 열리거나 커서가 옮겨지면 그 날짜 칸에 포커스를 둔다.
  useEffect(() => {
    if (!open || !focusPending.current) return
    focusPending.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus()
  }, [open, cursor, month])

  // 달력 밖을 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const canPrev = month > monthOf(today)
  const [my, mm] = month.split('-').map(Number)

  function onGridKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in step) {
      e.preventDefault()
      moveCursor(shiftDay(cursor, step[e.key]), step[e.key] > 0 ? 1 : -1)
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const ym = shiftMonth(month, e.key === 'PageUp' ? -1 : 1)
      moveCursor(`${ym}-${cursor.slice(8)}` <= `${ym}-31` ? `${ym}-${cursor.slice(8)}` : `${ym}-01`, 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      hide(true)
    }
  }

  return (
    <Frame q={q} error={error} heading="label">
      <div ref={rootRef} className={styles.dateRoot}>
        <input
          ref={inputRef}
          type="text"
          readOnly
          id={ids.input}
          className={`${styles.input} ${styles.dateInput}`}
          placeholder="날짜를 골라 주세요"
          value={current ? `${current.slice(0, 4)}년 ${dateKo(current)}` : ''}
          data-value={current}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          aria-describedby={describedBy(q, error)}
          aria-invalid={error ? true : undefined}
          aria-required={q.required || undefined}
          onClick={() => (open ? hide() : show())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault()
              show()
            } else if (e.key === 'Escape') hide()
          }}
        />
        <svg className={styles.dateIcon} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>
        {open && (
          <div id={dialogId} role="dialog" aria-label={`${q.label} 달력`} className={styles.calendar}>
            <div className={styles.calHead}>
              <button
                type="button"
                className={styles.calNav}
                aria-label="이전 달"
                disabled={!canPrev}
                onClick={() => setMonth(shiftMonth(month, -1))}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className={styles.calMonth} aria-live="polite">
                {my}년 {mm}월
              </span>
              <button type="button" className={styles.calNav} aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className={styles.weekdays} aria-hidden="true">
              {WEEKDAYS.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div ref={gridRef} className={styles.days} onKeyDown={onGridKey}>
              {monthCells(month).map((d) => {
                const inMonth = monthOf(d) === month
                const past = d < today
                const closed = !isOpenDay(d, holidays)
                const [, m, day] = d.split('-').map(Number)
                return (
                  <button
                    key={d}
                    type="button"
                    data-date={d}
                    className={styles.day}
                    disabled={past || closed}
                    tabIndex={d === cursor ? 0 : -1}
                    aria-pressed={d === current}
                    aria-current={d === today ? 'date' : undefined}
                    aria-label={`${m}월 ${day}일 ${WEEKDAYS[toDate(d).getUTCDay()]}요일${closed ? ' 쉬는 날' : ''}`}
                    data-outside={inMonth ? undefined : 'true'}
                    onClick={() => pick(d)}
                    onFocus={() => setCursor(d)}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            {current && (
              <div className={styles.calFoot}>
                <button type="button" className={styles.calClear} onClick={clear}>
                  날짜 지우기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Frame>
  )
}
