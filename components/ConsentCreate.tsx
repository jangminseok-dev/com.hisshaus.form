'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { type CreateState, createConsentAction } from '../app/admin/actions'
import { BUNDLES, GROOMING_PARTS, bundleOf } from '../lib/consent-docs'
import type { Applicant } from '../lib/applicants'
import styles from './Admin.module.css'

// 글자 수 상한(lib/consent-admin.ts 의 MAX 와 같다. 그 파일은 서버 전용 모듈을 끌어와서 여기서 쓰지 않는다)
const LIMIT = { programName: 30, goal: 60, classTime: 30, guardian: 50 }

/** 링크 복사 버튼. 카카오톡 앱 안 브라우저처럼 복사가 막히면 길게 눌러 복사하라고 안내한다. */
export function CopyLink({ url, showField = false }: { url: string; showField?: boolean }) {
  const [result, setResult] = useState<'' | 'ok' | 'fail'>('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setResult('ok')
    } catch {
      setResult('fail')
    }
  }
  return (
    <div className={styles.form}>
      {(showField || result === 'fail') && (
        <input
          className={styles.input}
          readOnly
          value={url}
          aria-label="동의서 링크"
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      <button className={styles.small} type="button" onClick={copy}>
        링크 복사
      </button>
      {result === 'ok' && (
        <p className={styles.muted} role="status">
          복사했어요
        </p>
      )}
      {result === 'fail' && (
        <p className={styles.muted} role="status">
          길게 눌러 복사해 주세요
        </p>
      )}
    </div>
  )
}

function Counter({ value, max }: { value: string; max: number }) {
  return <p className={styles.counter}>{`${value.length}/${max}`}</p>
}

/** 사장님이 묶음을 고르고 그 묶음의 칸만 채워 동의서(링크)를 만든다. */
export function ConsentCreate({ applicant, notFound }: { applicant: Applicant | null; notFound: boolean }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createConsentAction, {})
  const [bundleId, setBundleId] = useState('')
  const [programName, setProgramName] = useState('')
  const [goal, setGoal] = useState('')
  const [classTime, setClassTime] = useState('')
  const [parts, setParts] = useState<string[]>([])
  const [guardian, setGuardian] = useState({
    guardianName: applicant?.guardianName ?? '',
    phone: applicant?.phone ?? '',
    petName: applicant?.petName ?? '',
    breed: applicant?.breed ?? '',
  })
  const errors = state.errors ?? {}
  const fields = bundleOf(bundleId)?.ownerFields ?? []

  if (state.url) {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>링크를 만들었어요</h1>
        <p className={styles.text}>아래 링크를 복사해서 보호자에게 카카오톡으로 보내 주세요.</p>
        <CopyLink url={state.url} showField />
        <div className={styles.section}>
          <Link className={styles.secondary} href="/admin">
            사장님 화면으로
          </Link>
        </div>
      </div>
    )
  }

  const togglePart = (p: string) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  const guardianFields: { key: keyof typeof guardian; label: string }[] = [
    { key: 'guardianName', label: '보호자 성함' },
    { key: 'phone', label: '연락처' },
    { key: 'petName', label: '반려견 이름' },
    { key: 'breed', label: '견종' },
  ]

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>동의서 만들기</h1>
      <p className={styles.text}>
        {applicant
          ? `${applicant.guardianName} 님 신청서로 만들어요.`
          : '신청서 없이 만들어요. 보호자 정보를 비워 두면 보호자가 직접 적어요.'}
      </p>
      {notFound && <p className={styles.muted}>신청서를 찾지 못했어요</p>}
      <form className={styles.form} action={action}>
        <input type="hidden" name="applyId" value={applicant?.applyId ?? ''} />
        <input type="hidden" name="bundle" value={bundleId} />
        {parts.map((p) => (
          <input key={p} type="hidden" name="groomingParts" value={p} />
        ))}

        <span className={styles.label} id="bundle-label">
          문서 묶음
        </span>
        <div className={styles.chips} role="group" aria-labelledby="bundle-label">
          {BUNDLES.map((b) => (
            <button
              key={b.id}
              type="button"
              className={styles.chip}
              aria-pressed={bundleId === b.id}
              onClick={() => setBundleId(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        {errors.bundle && (
          <p className={styles.error} role="alert">
            {errors.bundle}
          </p>
        )}

        {fields.includes('programName') && (
          <>
            <label className={styles.label} htmlFor="c-program">
              프로그램 명
            </label>
            <input
              id="c-program"
              className={styles.input}
              name="programName"
              maxLength={LIMIT.programName}
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
            />
            <Counter value={programName} max={LIMIT.programName} />
            {errors.programName && <p className={styles.error}>{errors.programName}</p>}
          </>
        )}
        {fields.includes('goal') && (
          <>
            <label className={styles.label} htmlFor="c-goal">
              수업 목표
            </label>
            <input
              id="c-goal"
              className={styles.input}
              name="goal"
              maxLength={LIMIT.goal}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <Counter value={goal} max={LIMIT.goal} />
            {errors.goal && <p className={styles.error}>{errors.goal}</p>}
          </>
        )}
        {fields.includes('classTime') && (
          <>
            <label className={styles.label} htmlFor="c-time">
              수업 시간
            </label>
            <input
              id="c-time"
              className={styles.input}
              name="classTime"
              maxLength={LIMIT.classTime}
              value={classTime}
              onChange={(e) => setClassTime(e.target.value)}
            />
            <Counter value={classTime} max={LIMIT.classTime} />
            {errors.classTime && <p className={styles.error}>{errors.classTime}</p>}
          </>
        )}
        {fields.includes('groomingParts') && (
          <>
            <span className={styles.label} id="parts-label">
              미용 부위
            </span>
            <div className={styles.chips} role="group" aria-labelledby="parts-label">
              {GROOMING_PARTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.chip}
                  aria-pressed={parts.includes(p)}
                  onClick={() => togglePart(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            {errors.groomingParts && (
              <p className={styles.error} role="alert">
                {errors.groomingParts}
              </p>
            )}
          </>
        )}

        <h2 className={styles.heading}>보호자 정보</h2>
        <p className={styles.muted}>고치면 고친 값으로 보호자 화면에 보여요.</p>
        {guardianFields.map(({ key, label }) => (
          <div key={key} className={styles.form}>
            <label className={styles.label} htmlFor={`c-${key}`}>
              {label}
            </label>
            <input
              id={`c-${key}`}
              className={styles.input}
              name={key}
              maxLength={LIMIT.guardian}
              value={guardian[key]}
              onChange={(e) => setGuardian({ ...guardian, [key]: e.target.value })}
            />
            {errors[key] && <p className={styles.error}>{errors[key]}</p>}
          </div>
        ))}

        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        <button className={styles.primary} type="submit" disabled={pending}>
          {pending ? '만드는 중…' : '링크 만들기'}
        </button>
        <Link className={styles.secondary} href="/admin">
          돌아가기
        </Link>
      </form>
    </div>
  )
}
