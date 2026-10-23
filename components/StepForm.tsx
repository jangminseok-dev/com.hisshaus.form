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
 * 묶음을 어떻게 옮기나. push: 방문 기록에 칸을 쌓는다(다음). replace: 지금 칸을 고쳐 쓴다(앞에 쌓은 칸이 없을 때의 이전,
 * 서버가 거절한 뒤의 복구). pop: 브라우저가 이미 옮겼다(뒤로·앞으로 가기).
 */
type Move = 'push' | 'replace' | 'pop'

/**
 * 묶음 하나씩 넘기며 쓰는 화면. 신청서와 검사지가 같이 쓴다. 저장은 onDraft 를 받은 부모 몫이다.
 *
 * 방문 기록: 이 화면이 만지는 모든 칸의 state 는 `hhForm`(양식)·`hhSid`(신청 ID)·`hhStep`(묶음 번호)·`hhPos`(위치)를 담는다.
 * 위치는 이 양식 세션에서 첫 칸이 0 이고 `pushState` 할 때마다 1 씩 는다. 뒤로·앞으로 가기가 몇 칸을 건너뛰든,
 * 새로 고침으로 돌아오든, 도착한 칸이 스스로 묶음과 위치를 말해 주므로 쌓은 칸을 따로 세지 않는다.
 * 같은 양식·같은 신청의 칸이 아니면(다른 양식, 지난 신청, 양식 앞 페이지) 그 칸의 묶음을 따르지 않는다. 같은 양식이 지난 신청에서
 * 남긴 칸에 닿으면 그 칸을 이 신청의 칸으로 고쳐 쓴다.
 */
export function StepForm({ form, initial, today, submitLabel, onDraft, onSubmit, onBackFromFirst }: StepFormProps) {
  const total = form.groups.length
  const sid = initial.submissionId
  const [answers, setAnswers] = useState<Answers>(initial.answers)
  const [index, setIndex] = useState(() => clamp(initial.groupIndex, total))
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  // 화면이 열려 있는 사이 자정을 넘기면 서버의 오늘이 prop 보다 늦다. 서버가 거절했을 때 새로 알게 된 날짜.
  const [freshToday, setFreshToday] = useState(today)
  // 올릴 때마다 첫 오류 문항으로 한 번 간다.
  const [reveal, setReveal] = useState(0)

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

  function emit() {
    onDraft({ answers: answersRef.current, groupIndex: indexRef.current, submissionId: sid })
  }

  /** 방문 기록 칸에 적을 state. Next 가 칸에 넣어 둔 값(__NA 등)을 지우면 뒤로 가기가 깨지므로 있던 값에 더해서 쓴다. */
  function entryState(step: number, pos: number) {
    return { ...(history.state ?? {}), hhForm: form.id, hhSid: sid, hhStep: step, hhPos: pos }
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
      moveTo(indexRef.current - 1, 'replace')
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
    if (!isLast) {
      moveTo(indexRef.current + 1, 'push')
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

  // 처음 그릴 때 지금 방문 기록 칸에 보이는 묶음과 위치를 적는다. 새로 고침·탭 복원으로 같은 양식·같은 신청의 칸에
  // 돌아왔으면 그 위치를 이어받는다(앞 칸도 브라우저에 남아 있어서 ‹ 가 history.back 을 쓸 수 있다). 아니면 이 화면이 첫 칸이다.
  useEffect(() => {
    const here = history.state
    const mine = here?.hhForm === form.id && here?.hhSid === sid && Number.isInteger(here?.hhPos)
    posRef.current = mine ? here.hhPos : 0
    history.replaceState(entryState(indexRef.current, posRef.current), '')
  }, [])

  // 브라우저 뒤로·앞으로 가기. 몇 칸을 건너뛰어도 도착한 칸이 묶음과 위치를 말해 준다. 그릴 때마다 다시 거는 것은
  // 최신 onDraft 로 부르려는 것이다.
  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const s = event.state
      // 다른 양식의 칸과 양식 앞 페이지의 칸은 이 화면의 일이 아니다.
      if (s?.hhForm !== form.id) return
      if (s.hhSid !== sid) {
        // 같은 양식이 지난 신청에서 남긴 칸이다(완료 화면에서 뒤로 와 새 신청을 시작한 경우). 그 칸의 묶음은 따르지 않고,
        // 칸을 이 신청의 칸으로 고쳐 쓴다. 그냥 두면 위치(0)와 실제 방문 기록이 어긋나서, 이어지는 다음 → ‹ 가
        // 헛돌다가 쓰던 중에 양식을 떠난다.
        posRef.current = 0
        history.replaceState(entryState(indexRef.current, 0), '')
        return
      }
      if (!Number.isInteger(s.hhStep) || !Number.isInteger(s.hhPos)) return
      moveTo(clamp(s.hhStep, total), 'pop', s.hhPos)
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
          disabled={submitting || (index === 0 && !onBackFromFirst)}
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
