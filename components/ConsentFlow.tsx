'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { consentInfoGroup } from '../forms/consent'
import { SURVEY_CREDIT } from '../forms/survey-credit'
import type { Answer, Answers, Question } from '../forms/types'
import { bundleOf, consentFilename, ESIGN_LABEL, fieldValues, PAGES, type FieldKey, type PageId } from '../lib/consent-docs'
import { normalizeConsentInfo, validateConsentInfo } from '../lib/consent-info'
// 형만 가져온다. 이 모듈은 시트(서버 전용)를 부른다.
import type { Prepared } from '../lib/consent-store'
import { nowKst, todayKst } from '../lib/format'
import { postForResult } from '../lib/post'
import type { FieldError } from '../lib/validate'
import { CheckMark } from './CheckMark'
import styles from './Consent.module.css'
import { ConsentNotice } from './ConsentNotice'
import { ConsentPage } from './ConsentPage'
import { Field } from './fields/Field'
import { Honeypot } from './Honeypot'
import screenStyles from './Screen.module.css'
import { SignaturePad } from './SignaturePad'
import stepStyles from './StepForm.module.css'

const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'
const RECHECK = '입력한 내용을 다시 확인해 주세요.'
const PRIVACY =
  '동의서 사본을 보내고 서명 기록을 남기려고 이메일, 서명, 서명한 기기 정보와 시각을 받아요. 서명일부터 5년 동안 보관한 뒤 지워요.'
const INFO_IDS = consentInfoGroup.questions.map((q) => q.id)

/** 체크 하나를 ConsentField 로 그리려고 만드는 문항(켜면 값이 '동의'). 장 동의는 한 번에 한 장만 그려지므로 id 를 같이 쓴다. */
const check = (id: 'agreed' | 'esign', label: string): Question => ({ id, label, type: 'consent', required: true })

interface Done {
  /** base64. 이미 서명된 재시도면 없다. */
  pdf?: string
  mailed: boolean
  filename: string
}

/** base64 PDF 를 파일로 내려받는다. */
function download(pdf: string, filename: string) {
  const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  // 바로 풀면 일부 브라우저(iOS 사파리 등)가 받기를 시작하기 전에 주소를 잃는다. 넉넉히 기다렸다 푼다.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * 보호자의 동의서 서명. 사장님이 보낸 링크(app/consent/[token])로 열리고, 서버가 링크를 확인해 이 동의서의 준비 기록을 넘긴다.
 * 단계: ① 정보 확인 → ② 장마다 읽고 동의 → ③ 사인 → 완료. 단계 사이는 화면 안 '이전' 으로만 오간다(방문 기록은 쓰지 않는다).
 * 초안은 저장하지 않는다(짧은 흐름이고, 매장 아이패드는 여럿이 쓴다). device 는 사장님이 잠근 매장 아이패드다.
 */
export function ConsentFlow({ token, prepared, device }: { token: string; prepared: Prepared; device: boolean }) {
  const bundle = bundleOf(prepared.bundle)!
  const pages = bundle.pages
  const signStep = pages.length + 1
  // 0 = 정보 확인, 1..장 수 = 장, 장 수 + 1 = 사인
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Answers>(() => ({
    guardianName: prepared.shown?.guardianName ?? '',
    phone: prepared.shown?.phone ?? '',
    petName: prepared.shown?.petName ?? '',
    breed: prepared.shown?.breed ?? '',
    email: '',
  }))
  const [showInfoErrors, setShowInfoErrors] = useState(false)
  const [agreed, setAgreed] = useState<PageId[]>([])
  const [esign, setEsign] = useState(false)
  const [signature, setSignature] = useState('')
  // 서버가 거절한 칸과 그 글. 칸을 고치면 그 칸의 것을 지운다.
  const [serverErrors, setServerErrors] = useState<FieldError[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [done, setDone] = useState<Done | null>(null)
  const [closed, setClosed] = useState(false)
  // 올릴 때마다 첫 오류 칸으로 한 번 간다.
  const [reveal, setReveal] = useState(0)
  const website = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // 다시 그려지기 전에 또 눌려도 한 번만 보내려고 동기로 확인하는 자리.
  const submittingRef = useRef(false)

  const today = todayKst()
  const info = normalizeConsentInfo(answers)
  const infoErrors = validateConsentInfo(info, today)
  const serverError = (id: string) => serverErrors.find((e) => e.questionId === id)?.message
  const clearServerError = (id: string) => setServerErrors((list) => list.filter((e) => e.questionId !== id))

  const view = closed ? 'closed' : done ? 'done' : String(stepIndex)
  const shownView = useRef(view)
  // 단계가 바뀌면 맨 위로 올라가 제목을 읽게 한다. 처음 그릴 때는 하지 않는다.
  useEffect(() => {
    if (shownView.current === view) return
    shownView.current = view
    window.scrollTo(0, 0)
    titleRef.current?.focus()
  }, [view])

  // 넘어가려 했는데 막혔거나 서버가 거절했으면 첫 오류 칸으로 가서 그 입력에 포커스를 둔다. 단계를 옮긴 뒤라 그린 다음에 한다.
  useEffect(() => {
    if (reveal === 0) return
    const target = rootRef.current?.querySelector<HTMLElement>('[data-invalid="true"]')
    if (!target) return
    target.scrollIntoView({ block: 'start' })
    target.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true })
  }, [reveal])

  if (closed) return <ConsentNotice kind="closed" />
  if (done) return <Finished done={done} device={device} titleRef={titleRef} />

  function go(to: number) {
    setStepIndex(to)
    setNotice('')
  }

  function change(id: string, value: Answer) {
    setAnswers((a) => ({ ...a, [id]: value }))
    clearServerError(id)
  }

  function nextFromInfo() {
    if (infoErrors.length > 0) {
      setShowInfoErrors(true)
      setReveal((n) => n + 1)
      return
    }
    go(1)
  }

  async function submit() {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setNotice('')
    const { result, data } = await postForResult('/api/consent', {
      token,
      info,
      agreed: pages.filter((p) => agreed.includes(p)),
      esign,
      signature,
      website: website.current?.value ?? '',
    })
    submittingRef.current = false
    setSubmitting(false)
    if (result === 'ok') {
      setDone({ pdf: data?.pdf, mailed: data?.mailed === true, filename: consentFilename(bundle.label, info.petName, todayKst()) })
      return
    }
    if (result === 'closed') {
      setClosed(true)
      return
    }
    if (result === 'failed') {
      setNotice(FAILED)
      return
    }
    // 거절: 첫 오류를 가진 단계로 돌아가 서버의 글을 칸 아래에 보인다.
    const errors = data?.errors ?? []
    setServerErrors(errors)
    const first = errors[0]?.questionId
    if (first === undefined) {
      setNotice(RECHECK)
      return
    }
    if (INFO_IDS.includes(first)) {
      setShowInfoErrors(true)
      go(0)
    } else if (first === 'agreed') {
      go(1)
    }
    // esign·signature 는 지금 단계(사인)의 칸이다.
    setReveal((n) => n + 1)
  }

  let id: string
  let title: string
  let body: React.ReactNode
  let action: React.ReactNode
  if (stepIndex === 0) {
    id = 'info'
    title = '계약서에 이렇게 들어가요'
    const errorOf = (q: Question) => (showInfoErrors ? infoErrors.find((e) => e.questionId === q.id)?.message : undefined) ?? serverError(q.id)
    body = (
      <>
        <p className={styles.lead}>틀린 곳이 있으면 고쳐 주세요.</p>
        {consentInfoGroup.questions.map((q) => (
          <Field key={q.id} q={q} value={answers[q.id]} error={errorOf(q)} today={today} onChange={(v) => change(q.id, v)} />
        ))}
        <p className={styles.privacy}>{PRIVACY}</p>
      </>
    )
    action = (
      <button type="button" className={stepStyles.primary} data-action="next" aria-disabled={infoErrors.length > 0} onClick={nextFromInfo}>
        다음
      </button>
    )
  } else if (stepIndex < signStep) {
    const page = pages[stepIndex - 1]
    id = `page-${page}`
    title = PAGES[page].title
    // 화면의 작성일은 오늘이다. 서버가 서명할 때의 날짜를 PDF 에 찍는다.
    const values: Partial<Record<FieldKey, string>> = {
      ...fieldValues({ guardian: info, owner: prepared, signedAt: nowKst() }),
      ...Object.fromEntries(prepared.groomingParts.map((part) => [`part:${part}`, '✓'])),
    }
    const on = agreed.includes(page)
    body = (
      <>
        <ConsentPage page={page} values={values} />
        <Field
          q={check('agreed', PAGES[page].agreeLabel)}
          value={on ? '동의' : ''}
          error={stepIndex === 1 ? serverError('agreed') : undefined}
          today={today}
          onChange={(v) => {
            setAgreed((list) => (v === '동의' ? [...list, page] : list.filter((p) => p !== page)))
            clearServerError('agreed')
          }}
        />
      </>
    )
    action = (
      <button type="button" className={stepStyles.primary} data-action="next" disabled={!on} onClick={() => go(stepIndex + 1)}>
        다음
      </button>
    )
  } else {
    id = 'sign'
    title = '마지막으로 사인해 주세요'
    const sigError = serverError('signature')
    body = (
      <>
        {notice && (
          <p role="alert" className={stepStyles.notice}>
            {notice}
          </p>
        )}
        <div data-question="signature" data-invalid={sigError ? 'true' : undefined}>
          <SignaturePad
            value={signature}
            onChange={(v) => {
              setSignature(v)
              clearServerError('signature')
            }}
          />
          {sigError && (
            <p role="alert" className={styles.error}>
              {sigError}
            </p>
          )}
        </div>
        <Field
          q={check('esign', ESIGN_LABEL)}
          value={esign ? '동의' : ''}
          error={serverError('esign')}
          today={today}
          onChange={(v) => {
            setEsign(v === '동의')
            clearServerError('esign')
          }}
        />
        <p className={styles.mailTo}>{`이 주소로 사본을 보내요: ${info.email}`}</p>
      </>
    )
    action = (
      <button type="button" className={stepStyles.primary} data-action="submit" disabled={!signature || !esign || submitting} onClick={submit}>
        {submitting && <span className={stepStyles.spinner} aria-hidden="true" />}
        {submitting ? '보내는 중…' : '서명하기'}
      </button>
    )
  }

  return (
    <div ref={rootRef} className={stepStyles.root} data-step={id}>
      <h1 className="srOnly">히스하우스 동의서</h1>
      <div className={stepStyles.bar}>
        {stepIndex > 0 && (
          <button type="button" className={stepStyles.back} data-action="back" disabled={submitting} onClick={() => go(stepIndex - 1)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            이전
          </button>
        )}
        <h2 key={id} ref={titleRef} tabIndex={-1} className={stepStyles.title}>
          {title}
        </h2>
      </div>
      {body}
      <p className={styles.credit}>{SURVEY_CREDIT}</p>
      <div className={stepStyles.actions}>{action}</div>
      <Honeypot ref={website} />
    </div>
  )
}

/** 완료 화면. 내려받기는 보호자 기기에서만, 매장 아이패드면 기기를 돌려 달라고 하고 사장님 화면(PIN)으로 가는 길만 둔다. */
function Finished({ done, device, titleRef }: { done: Done; device: boolean; titleRef: React.Ref<HTMLHeadingElement> }) {
  const mail = done.pdf === undefined ? '사본은 메일로 보내 드렸어요.' : done.mailed ? '메일로 사본을 보냈어요' : '사본 메일은 곧 다시 보내 드릴게요'
  return (
    <div className={screenStyles.screen} data-step="done">
      <CheckMark />
      <h1 ref={titleRef} tabIndex={-1} className={screenStyles.title}>
        서명이 끝났어요
      </h1>
      <p className={screenStyles.text}>{mail}</p>
      {device && <p className={screenStyles.text}>기기를 사장님께 돌려주세요</p>}
      <div className={screenStyles.actions}>
        {device ? (
          <Link className={screenStyles.primary} href="/admin">
            사장님 화면으로
          </Link>
        ) : (
          done.pdf !== undefined && (
            <button type="button" className={screenStyles.primary} onClick={() => download(done.pdf!, done.filename)}>
              PDF 내려받기
            </button>
          )
        )}
      </div>
      <p className={screenStyles.credit}>{SURVEY_CREDIT}</p>
    </div>
  )
}
