'use client'

import { useEffect, useRef, useState } from 'react'

import { blockedBy, isRequired, isVisible, visibleAnswers } from '../forms/rules'
import type { Answer, Answers, FormDef, Question } from '../forms/types'
import type { Draft } from '../lib/draft'
import { todayKst } from '../lib/format'
import { validateForm, validateGroup } from '../lib/validate'
import { Field } from './fields/Field'
import styles from './StepForm.module.css'

export interface StepFormProps {
  form: FormDef
  /** 처음 한 번만 읽는다. 다른 초안이나 다른 양식으로 바꾸려면 key 를 바꿔 다시 세운다. */
  initial: Draft
  today: string
  /** 마지막 묶음 버튼 글자 */
  submitLabel: string
  /** 입력·묶음 이동마다 */
  onDraft(d: Draft): void
  onSubmit(answers: Answers): Promise<'ok' | 'invalid' | 'failed'>
  /** 첫 묶음에서 ‹ */
  onBackFromFirst?(): void
}

const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'
const RECHECK = '입력한 내용을 다시 확인해 주세요.'

const clamp = (i: number, total: number) => Math.min(Math.max(i, 0), total - 1)

/**
 * 방문 기록 칸에 적는 값. 어느 양식의 몇째 묶음인지 담는다.
 * Next 가 칸에 넣어 둔 값(__NA 등)을 지우면 뒤로 가기가 깨지므로 있던 값에 더해서 쓴다.
 */
function stepState(formId: string, step: number) {
  return { ...(history.state ?? {}), hhForm: formId, hhStep: step }
}

/** 묶음 하나씩 넘기며 쓰는 화면. 신청서와 검사지가 같이 쓴다. 저장은 onDraft 를 받은 부모 몫이다. */
export function StepForm({ form, initial, today, submitLabel, onDraft, onSubmit, onBackFromFirst }: StepFormProps) {
  const total = form.groups.length
  const [answers, setAnswers] = useState<Answers>(initial.answers)
  const [index, setIndex] = useState(() => clamp(initial.groupIndex, total))
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  // 화면이 열려 있는 사이 자정을 넘기면 서버의 오늘이 prop 보다 늦다. 서버가 거절했을 때 새로 알게 된 날짜.
  const [freshToday, setFreshToday] = useState(today)
  // 올릴 때마다 첫 오류 문항으로 한 번 간다.
  const [reveal, setReveal] = useState(0)

  // state 와 같은 답을 ref 로도 쥔다. 제출을 기다린 뒤나 한 번에 여러 입력이 와도 가장 나중 답을 읽으려는 것이다.
  const answersRef = useRef(initial.answers)
  // 다시 그려지기 전에 또 눌려도 한 번만 보내려고 동기로 확인하는 자리.
  const submittingRef = useRef(false)
  // 이 화면이 방문 기록에 쌓은 칸 가운데 지금 위치 뒤에 남은 수.
  const pushed = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const shownIndex = useRef(index)

  const group = form.groups[index]
  const isLast = index === total - 1
  const todayNow = freshToday > today ? freshToday : today
  const errors = validateGroup(group, answers, todayNow)
  const blocked = blockedBy(group, answers)
  // 필드 오류는 넘어가려 한 뒤에만 보인다. 막힘(blockIf) 안내는 곧바로 그 문항 아래에 보인다.
  const errorOf = (q: Question) =>
    showErrors || blocked?.questionId === q.id ? errors.find((e) => e.questionId === q.id)?.message : undefined

  // 선택 표시는 지금 필수인지로 정한다. requiredIf 로 필수가 된 문항(2순위 시간대)은 선택이 아니다.
  const asShown = (q: Question): Question => ({ ...q, required: isRequired(q, answers) })

  function emit(next: Answers, groupIndex: number) {
    onDraft({ answers: next, groupIndex, submissionId: initial.submissionId })
  }

  /** 다른 묶음을 보인다. 오류 표시와 앞 안내는 새 묶음에 가져가지 않는다. */
  function showGroup(next: number) {
    setIndex(next)
    setShowErrors(false)
    setNotice('')
  }

  function change(q: Question, value: Answer) {
    const next = { ...answersRef.current, [q.id]: value }
    answersRef.current = next
    setAnswers(next)
    setNotice('')
    emit(next, index)
  }

  function goNext() {
    const next = index + 1
    history.pushState(stepState(form.id, next), '')
    pushed.current += 1
    showGroup(next)
    emit(answersRef.current, next)
  }

  function goBack() {
    if (index === 0) {
      onBackFromFirst?.()
    } else if (pushed.current > 0) {
      // 묶음은 popstate 가 바꾼다. 브라우저 뒤로 가기와 같은 길이다.
      history.back()
    } else {
      // 가운데서 복원돼 이 화면이 쌓은 칸이 없다. 칸을 더 쌓지 않고 지금 칸을 앞 묶음으로 고친다.
      const prev = index - 1
      history.replaceState(stepState(form.id, prev), '')
      showGroup(prev)
      emit(answersRef.current, prev)
    }
  }

  /** 서버가 거절했다. 새 오늘로 전체를 다시 보고 오류가 있는 첫 묶음으로 옮긴다. */
  function recheck() {
    const current = answersRef.current
    const now = todayKst()
    setFreshToday(now)
    const first = validateForm(form, current, now)[0]
    if (!first) {
      setNotice(RECHECK)
      return
    }
    const target = form.groups.findIndex((g) => g.questions.some((q) => q.id === first.questionId))
    if (target !== index) {
      history.replaceState(stepState(form.id, target), '')
      emit(current, target)
    }
    showGroup(target)
    setShowErrors(true)
    setReveal((n) => n + 1)
  }

  async function press() {
    if (submittingRef.current) return
    if (errors.length > 0) {
      setShowErrors(true)
      setReveal((n) => n + 1)
      return
    }
    if (!isLast) {
      goNext()
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setNotice('')
    let result: 'ok' | 'invalid' | 'failed'
    try {
      // 숨은 문항의 옛 답은 보내지 않는다.
      result = await onSubmit(visibleAnswers(form, answersRef.current))
    } catch {
      result = 'failed'
    }
    // ok 면 부모가 화면을 바꾼다. 그때까지 버튼을 막아 둔다.
    if (result === 'ok') return
    submittingRef.current = false
    setSubmitting(false)
    if (result === 'failed') setNotice(FAILED)
    else recheck()
  }

  // 처음 그릴 때 지금 방문 기록 칸에 묶음 번호를 적는다(처음 그릴 때의 번호만 쓴다).
  // 새로 고침 뒤에도 칸에 남아 있어서, 앞 칸으로 가는 뒤로 가기가 그 묶음을 알아본다.
  useEffect(() => {
    history.replaceState(stepState(form.id, index), '')
  }, [])

  // 브라우저 뒤로·앞으로 가기. 최신 묶음 번호를 보려고 그릴 때마다 다시 건다.
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state = event.state
      if (typeof state?.hhStep !== 'number') return
      // 다른 양식이 쌓은 칸(예: 신청서 칸으로 한 번에 건너뛴 경우)은 이 양식이 따르지 않는다.
      if (typeof state.hhForm === 'string' && state.hhForm !== form.id) return
      const next = clamp(state.hhStep, total)
      if (next === index) return
      pushed.current = Math.max(0, pushed.current + (next > index ? 1 : -1))
      showGroup(next)
      emit(answersRef.current, next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  })

  // 묶음이 바뀌면 맨 위로 올라가 제목을 읽게 한다. 처음 그릴 때는 하지 않는다.
  useEffect(() => {
    if (shownIndex.current === index) return
    shownIndex.current = index
    window.scrollTo(0, 0)
    titleRef.current?.focus()
  }, [index])

  // 넘어가려 했는데 막혔으면 첫 오류 문항으로 가서 그 입력에 포커스를 둔다. 묶음을 옮긴 뒤라 그린 다음에 한다.
  useEffect(() => {
    if (reveal === 0) return
    const first = errors[0]
    const target = first && rootRef.current?.querySelector<HTMLElement>(`[data-question="${first.questionId}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    // 입력칸이 있으면 거기로(기타 내용처럼), 칩뿐이면 첫 칩으로.
    const control = target.querySelector<HTMLElement>('input, textarea') ?? target.querySelector<HTMLElement>('button')
    control?.focus({ preventScroll: true })
  }, [reveal])

  // 위쪽 안내가 화면 밖이면 보이는 곳으로 올려 준다. 버튼은 아래 고정이라 스크롤한 채로 눌렀을 수 있다.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [notice])

  return (
    <div ref={rootRef} className={styles.root} data-group={group.id}>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.back}
          aria-label="이전"
          data-action="back"
          disabled={index === 0 && !onBackFromFirst}
          onClick={goBack}
        >
          ‹
        </button>
        <h2 key={group.id} ref={titleRef} tabIndex={-1} className={styles.title}>
          {group.title}
        </h2>
        <span className={styles.count}>{`${index + 1} / ${total}`}</span>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      {notice && (
        <p ref={noticeRef} role="alert" className={styles.notice}>
          {notice}
        </p>
      )}
      {group.note && <p className={styles.note}>{group.note}</p>}
      {group.questions
        .filter((q) => isVisible(q, answers))
        .map((q) => (
          <Field
            key={q.id}
            q={asShown(q)}
            value={answers[q.id]}
            error={errorOf(q)}
            today={todayNow}
            onChange={(value) => change(q, value)}
          />
        ))}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          data-action={isLast ? 'submit' : 'next'}
          aria-disabled={errors.length > 0}
          disabled={submitting}
          onClick={press}
        >
          {submitting ? '보내는 중…' : isLast ? submitLabel : '다음'}
        </button>
      </div>
    </div>
  )
}
