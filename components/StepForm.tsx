'use client'

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'

import { blockedBy, isGroupVisible, isRequired, isVisible, visibleAnswers, visibleGroups } from '../forms/rules'
import type { Answer, Answers, FormDef, Question } from '../forms/types'
import type { Draft } from '../lib/draft'
import { todayKst } from '../lib/format'
import { validateForm, validateGroup } from '../lib/validate'
import { Field } from './fields/Field'
import styles from './StepForm.module.css'

export interface StepFormProps {
  form: FormDef
  /** 처음 한 번만 읽는다. 다른 초안이나 다른 양식으로 바꾸려면 React 의 key 를 바꿔 다시 세운다. */
  initial: Draft
  today: string
  /** 마지막 묶음 버튼 글자 */
  submitLabel: string
  /** 입력·묶음 이동마다 */
  onDraft(d: Draft): void
  onSubmit(answers: Answers): Promise<'ok' | 'invalid' | 'failed'>
  /** 첫 묶음에서 ‹ */
  onBackFromFirst?(): void
  /** 있으면 마지막 묶음의 제출 버튼이 바로 보내지 않고 이 글로 한 번 확인받는다(검사지: 제출하면 고칠 수 없다). */
  confirmSubmit?: string
}

const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'
const RECHECK = '입력한 내용을 다시 확인해 주세요.'

const clamp = (i: number, total: number) => Math.min(Math.max(i, 0), total - 1)

/** from 뒤의 첫 보이는 묶음 번호. 없으면 -1. */
function nextVisible(form: FormDef, from: number, a: Answers): number {
  return form.groups.findIndex((g, i) => i > from && isGroupVisible(g, a))
}

/** from 앞의 마지막 보이는 묶음 번호. 없으면 -1. */
function prevVisible(form: FormDef, from: number, a: Answers): number {
  for (let i = from - 1; i >= 0; i--) if (isGroupVisible(form.groups[i], a)) return i
  return -1
}

/**
 * 얼마나 왔는지 느끼게 하는 한 줄. 숫자·막대 대신 말로(사용자 결정). 보이는 묶음 기준이고, 앞쪽에서는 아무 말도 하지 않는다.
 */
function pace(position: number, total: number): string | undefined {
  if (total < 3) return undefined
  if (position === total) return '🎉 마지막 화면이에요'
  if (position === total - 1) return '✨ 거의 다 왔어요, 한 화면만 더!'
  if (position / total > 0.5) return '절반 넘게 왔어요'
  return undefined
}

/**
 * 복원한 묶음 번호가 숨은 묶음이면(서비스별 묶음에서 저장했다가 그 서비스를 뺀 초안) 그 **앞**의 보이는 묶음으로.
 * 뒤로 맞추면 아직 안 본 필수 묶음을 건너뛰어 제출 버튼에 닿는다. 앞으로 맞추면 다음을 눌러 정상 경로로 간다.
 */
function snap(form: FormDef, i: number, a: Answers): number {
  if (isGroupVisible(form.groups[i], a)) return i
  const prev = prevVisible(form, i, a)
  return prev === -1 ? nextVisible(form, i, a) : prev
}

/**
 * 묶음을 어떻게 옮기나. push: 방문 기록에 칸을 쌓는다(다음). replace: 지금 칸을 고쳐 쓴다(앞에 쌓은 칸이 없을 때의 이전,
 * 서버가 거절한 뒤의 복구). pop: 브라우저가 이미 옮겼다(뒤로·앞으로 가기).
 */
type Move = 'push' | 'replace' | 'pop'

/**
 * 묶음 하나씩 넘기며 쓰는 화면. 신청서와 검사지가 같이 쓴다. 저장은 onDraft 를 받은 부모 몫이다.
 *
 * 방문 기록: 이 화면이 만지는 모든 칸의 state 는 `hhForm`(양식)·`hhKey`(초안의 열쇠)·`hhStep`(묶음 번호)·`hhPos`(위치)를 담는다.
 * 위치는 이 초안에서 첫 칸이 0 이고 `pushState` 할 때마다 1 씩 는다. 뒤로·앞으로 가기가 몇 칸을 건너뛰든,
 * 새로 고침으로 돌아오든, 도착한 칸이 스스로 묶음과 위치를 말해 주므로 쌓은 칸을 따로 세지 않는다.
 * 칸의 주인은 신청 ID 가 아니라 초안이다. 검사지는 신청서의 신청 ID 를 그대로 쓰므로, 낸 뒤 뒤로 와 새로 연 검사지는 지난
 * 검사지와 신청 ID 가 같다. 같은 양식·같은 열쇠의 칸만 이 초안의 칸이다.
 * 같은 양식이 지난 초안에서 남긴 칸(다른 열쇠)에 닿으면 묶음도 초안도 바꾸지 않고 한 칸 더 뒤로 간다. 첫 묶음에서의
 * 뒤로 가기는 양식을 떠나는 일이라 지난 초안의 칸은 더는 뜻이 없다. 하나씩 건너뛰어 양식 앞 페이지에서 멈춘다.
 * 다른 양식의 칸과 양식 앞 페이지의 칸은 이 화면의 일이 아니라 그대로 둔다.
 */
export function StepForm({ form, initial, today, submitLabel, onDraft, onSubmit, onBackFromFirst, confirmSubmit }: StepFormProps) {
  const total = form.groups.length
  const sid = initial.submissionId
  const key = initial.key
  const [answers, setAnswers] = useState<Answers>(initial.answers)
  const [index, setIndex] = useState(() => snap(form, clamp(initial.groupIndex, total), initial.answers))
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  // 화면이 열려 있는 사이 자정을 넘기면 서버의 오늘이 prop 보다 늦다. 서버가 거절했을 때 새로 알게 된 날짜.
  const [freshToday, setFreshToday] = useState(today)
  // 올릴 때마다 첫 오류 문항으로 한 번 간다.
  const [reveal, setReveal] = useState(0)
  // 제출 전 확인 창. 열려 있으면 true, 닫았으면 false(제출 버튼으로 포커스), null 은 포커스를 옮기지 않는다(처음, 묶음이 바뀌어 닫힘).
  const [confirming, setConfirming] = useState<boolean | null>(null)
  const confirmId = useId()

  // 답과 보이는 묶음은 state 와 같은 값을 ref 로도 쥔다. 제출을 기다린 뒤나 popstate 처럼 그린 값이 한 박자 늦을 수 있는
  // 자리에서 가장 나중 값을 읽으려는 것이다. 쓰는 곳은 moveTo 와 change 뿐이다.
  const answersRef = useRef(initial.answers)
  const indexRef = useRef(index)
  // 지금 방문 기록 칸의 위치(hhPos).
  const posRef = useRef(0)
  // 다시 그려지기 전에 또 눌려도 한 번만 보내려고 동기로 확인하는 자리.
  const submittingRef = useRef(false)
  // 화면이 떠 있나. 제출을 기다리는 사이 다른 페이지로 갔으면 그 페이지의 방문 기록 칸과 초안을 건드리지 않는다.
  const aliveRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const shownIndex = useRef(index)

  const group = form.groups[index]
  // 묶음은 보이는 것 사이로만 옮긴다. 서비스별 묶음은 그 서비스를 골랐을 때만 낀다.
  const isLast = nextVisible(form, index, answers) === -1
  const shown = visibleGroups(form, answers)
  const paceText = pace(shown.indexOf(group) + 1, shown.length)
  const todayNow = freshToday > today ? freshToday : today
  const errors = validateGroup(group, answers, todayNow)
  const blocked = blockedBy(group, answers)
  // 필드 오류는 넘어가려 한 뒤에만 보인다. 막힘(blockIf) 안내는 곧바로 그 문항 아래에 보인다.
  const errorOf = (q: Question) =>
    showErrors || blocked?.questionId === q.id ? errors.find((e) => e.questionId === q.id)?.message : undefined

  // 선택 표시는 지금 필수인지로 정한다. requiredIf 로 필수가 된 문항(2순위 시간대)은 선택이 아니다.
  const asShown = (q: Question): Question => ({ ...q, required: isRequired(q, answers) })

  function emit() {
    onDraft({ answers: answersRef.current, groupIndex: indexRef.current, submissionId: sid, key })
  }

  /** 방문 기록 칸에 적을 state. Next 가 칸에 넣어 둔 값(__NA 등)을 지우면 뒤로 가기가 깨지므로 있던 값에 더해서 쓴다. */
  function entryState(step: number, pos: number) {
    return { ...(history.state ?? {}), hhForm: form.id, hhKey: key, hhStep: step, hhPos: pos }
  }

  /**
   * 묶음을 옮기는 일은 전부 여기서 한다: 방문 기록 칸, 보이는 묶음, 초안, 오류 표시.
   * (맨 위로 올리고 제목에 포커스를 두는 것은 보이는 묶음이 바뀐 뒤 index 이펙트가 한다.)
   * pop 은 브라우저가 이미 칸을 옮겼으니 도착한 칸의 위치를 받아 적는다.
   */
  function moveTo(target: number, how: Move, popPos = 0) {
    if (how === 'push') {
      posRef.current += 1
      history.pushState(entryState(target, posRef.current), '')
    } else if (how === 'replace') {
      history.replaceState(entryState(target, posRef.current), '')
    } else {
      posRef.current = popPos
    }
    indexRef.current = target
    setIndex(target)
    setShowErrors(false)
    setNotice('')
    // 확인 창이 열린 채 묶음이 바뀌면(휴대폰 뒤로 버튼으로 창을 닫으려 했다) 창을 닫는다. 포커스는 새 묶음 제목이 받는다.
    setConfirming((c) => (c ? null : c))
    emit()
  }

  function change(q: Question, value: Answer) {
    answersRef.current = { ...answersRef.current, [q.id]: value }
    setAnswers(answersRef.current)
    setNotice('')
    emit()
  }

  function goBack() {
    if (indexRef.current === 0) {
      onBackFromFirst?.()
    } else if (posRef.current > 0) {
      // 앞에 이 화면이 쌓은 칸이 있다. 묶음은 popstate 가 바꾼다(브라우저 뒤로 가기와 같은 길이다).
      history.back()
    } else {
      // 앞에 이 화면이 쌓은 칸이 없다(가운데서 복원됐거나 여러 칸을 한 번에 돌아왔다). 지금 칸을 앞 묶음으로 고쳐 쓴다.
      moveTo(prevVisible(form, indexRef.current, answersRef.current), 'replace')
    }
  }

  /**
   * 서버가 거절했다. 새 오늘로 전체를 다시 보고 오류가 있는 첫 묶음으로 옮긴다.
   * 알려진 한계: 이렇게 칸의 묶음을 고쳐 쓰면 앞 칸과 묶음이 이어지지 않아서 이어지는 ‹ 한 번이 같은 묶음으로 헛돌거나
   * 묶음을 건너뛸 수 있다. 서버만 거절하는 경우에만 생긴다: 화면이 열려 있는 사이 자정을 넘겼거나, 브라우저 앞으로 가기로
   * 검증 없이 넘어간 묶음에 오류가 있는 경우다.
   */
  function recheck() {
    const now = todayKst()
    setFreshToday(now)
    const first = validateForm(form, answersRef.current, now)[0]
    if (!first) {
      setNotice(RECHECK)
      return
    }
    const target = form.groups.findIndex((g) => g.questions.some((q) => q.id === first.questionId))
    // 보내는 사이 브라우저 뒤로 가기로 묶음이 바뀌었을 수 있다. 누른 때 그린 값이 아니라 지금 값과 견준다.
    if (target !== indexRef.current) moveTo(target, 'replace')
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
    const next = nextVisible(form, indexRef.current, answersRef.current)
    if (next !== -1) {
      moveTo(next, 'push')
      return
    }
    if (confirmSubmit) {
      setConfirming(true)
      return
    }
    await send()
  }

  /** 확인 창의 제출. 창을 닫고 보낸다. 다시 그려지기 전에 또 눌려도 send 가 한 번만 보낸다. */
  function confirm() {
    setConfirming(false)
    void send()
  }

  async function send() {
    if (submittingRef.current) return
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
    // 기다리는 사이 화면이 내려갔으면 다른 페이지의 방문 기록 칸·초안을 건드리지 않는다.
    if (!aliveRef.current) return
    // ok 면 부모가 화면을 바꾼다. 그때까지 버튼을 막아 둔다.
    if (result === 'ok') return
    submittingRef.current = false
    setSubmitting(false)
    if (result === 'failed') setNotice(FAILED)
    else recheck()
  }

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 처음 그릴 때 지금 방문 기록 칸에 보이는 묶음과 위치를 적는다. 새로 고침·탭 복원으로 같은 양식·같은 초안(열쇠)의 칸에
  // 돌아왔으면 그 위치를 이어받는다(앞 칸도 브라우저에 남아 있어서 ‹ 가 history.back 을 쓸 수 있다). 아니면 이 화면이 첫 칸이다.
  useEffect(() => {
    const here = history.state
    const mine = here?.hhForm === form.id && here?.hhKey === key && Number.isInteger(here?.hhPos)
    posRef.current = mine ? here.hhPos : 0
    history.replaceState(entryState(indexRef.current, posRef.current), '')
  }, [])

  // 브라우저 뒤로·앞으로 가기. 몇 칸을 건너뛰어도 도착한 칸이 묶음과 위치를 말해 준다. 리스너는 한 번만 걸고 최신 props·state 는
  // Effect Event 로 읽는다. 그릴 때마다 뗐다 다시 걸면 같은 popstate 안에서 화면이 다시 그려질 때 이 이벤트를 놓친다. 실제 Next 의
  // popstate 리스너가 그렇게 한다: 이 화면의 리스너보다 먼저 불려서 화면을 다시 그리게 하는데, 떼어진 리스너는 이 이벤트에서
  // 부르지 않고 새로 건 리스너는 이 이벤트에 끼지 못한다.
  const onPopState = useEffectEvent((event: PopStateEvent) => {
    const s = event.state
    // 다른 양식의 칸과 양식 앞 페이지의 칸은 이 화면의 일이 아니다.
    if (s?.hhForm !== form.id) return
    if (s.hhKey !== key) {
      // 같은 양식이 지난 초안에서 남긴 칸이다(완료 화면에서 뒤로 와 새 초안을 시작한 경우). 묶음도 초안도 바꾸지 않고 한 칸 더
      // 뒤로 가서 건너뛴다. 그 칸의 위치와 묶음을 따르면 빈 초안이 지난 초안의 뒤 묶음으로 뛰고, 그대로 두면 양식을 떠나는 데
      // 칸 수만큼 눌러야 한다. 알려진 한계: 앞으로 가기로 지난 초안의 칸에 닿아도 같은 길로 뒤로 돌려서 그 앞으로 가기는 먹지 않는다.
      history.back()
      return
    }
    if (!Number.isInteger(s.hhStep) || !Number.isInteger(s.hhPos)) return
    const a = answersRef.current
    const step = clamp(s.hhStep, total)
    let target = step
    if (!isGroupVisible(form.groups[step], a)) {
      // 칸이 가리키는 묶음이 지금은 숨어 있다(그 서비스를 뺐다). 그 칸 기준이 아니라 지금 묶음에서 간 방향의 다음 보이는 묶음으로
      // 간다. 앞으로 가기가 아직 안 본 필수 묶음을 건너뛰지 않고, 뒤로 가기가 같은 묶음을 두 번 보이지 않는다.
      const forward = s.hhPos > posRef.current
      const byDirection = forward ? nextVisible(form, indexRef.current, a) : prevVisible(form, indexRef.current, a)
      target = byDirection === -1 ? snap(form, step, a) : byDirection
      // 칸이 보이는 묶음을 가리키게 고쳐 둔다. 다음에 같은 칸에 닿으면 방향 없이도 맞는다.
      history.replaceState(entryState(target, s.hhPos), '')
    }
    moveTo(target, 'pop', s.hhPos)
  })
  useEffect(() => {
    const listen = (event: PopStateEvent) => onPopState(event)
    window.addEventListener('popstate', listen)
    return () => window.removeEventListener('popstate', listen)
  }, [])

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

  // 확인 창이 열리면 '다시 볼게요' 에 포커스를 둔다(잘못 눌러 보내지 않게). 닫히면 제출 버튼으로 돌려준다.
  useEffect(() => {
    if (confirming === null) return
    if (confirming) cancelRef.current?.focus()
    else submitRef.current?.focus()
  }, [confirming])

  // 위쪽 안내가 화면 밖이면 보이는 곳으로 올려 준다. 버튼은 아래 고정이라 스크롤한 채로 눌렀을 수 있다.
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [notice])

  return (
    <div ref={rootRef} className={styles.root} data-group={group.id}>
      <h1 className="srOnly">{form.title}</h1>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.back}
          data-action="back"
          disabled={submitting || (index === 0 && !onBackFromFirst)}
          onClick={goBack}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          이전
        </button>
        <h2 key={group.id} ref={titleRef} tabIndex={-1} className={styles.title}>
          {group.title}
        </h2>
      </div>
      {/* 출처는 첫 묶음에서 한 번만. */}
      {form.credit && index === 0 && <p className={styles.credit}>{form.credit}</p>}
      {paceText && (
        <p className={styles.pace} aria-live="polite">
          {paceText}
        </p>
      )}
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
            date={q.dateId ? (typeof answers[q.dateId] === 'string' ? (answers[q.dateId] as string) : undefined) : undefined}
            onChange={(value) => change(q, value)}
          />
        ))}
      <div className={styles.actions}>
        <button
          ref={submitRef}
          type="button"
          className={styles.primary}
          data-action={isLast ? 'submit' : 'next'}
          aria-disabled={errors.length > 0}
          disabled={submitting}
          onClick={press}
        >
          {submitting && <span className={styles.spinner} aria-hidden="true" />}
          {submitting ? '보내는 중…' : isLast ? submitLabel : '다음'}
        </button>
      </div>
      {confirming && (
        <div className={styles.scrim}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmId}
            className={styles.dialog}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirming(false)
            }}
          >
            <p id={confirmId} className={styles.dialogText}>
              {confirmSubmit}
            </p>
            <div className={styles.dialogActions}>
              <button ref={cancelRef} type="button" className={styles.secondary} data-action="cancel-submit" onClick={() => setConfirming(false)}>
                다시 볼게요
              </button>
              <button type="button" className={styles.primary} data-action="confirm-submit" onClick={confirm}>
                {submitLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
