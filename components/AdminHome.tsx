'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { cancelConsentAction, resendConsentMailAction } from '../app/admin/actions'
import type { Applicant } from '../lib/applicants'
import styles from './Admin.module.css'
import { CopyLink, SignHere } from './ConsentCreate'

export interface ConsentItem {
  id: string
  bundleLabel: string
  guardianName: string
  status: '서명 대기' | '서명함' | '취소함'
  /** 메일 결과 글. 메일 줄이 있을 때만. */
  mail: string | null
  /** 서명했는데 메일 결과에 실패가 있거나 메일 줄이 없으면 '메일 다시 보내기' 를 둔다. */
  resend: boolean
  createdAt: string
  /** 서명 대기일 때만 있는 보호자 링크 */
  url: string | null
}

/** 사장님 홈: 신청서에서 만들기, 신청서 없이 만들기, 최근 동의서. 시트를 못 읽은 목록은 null. */
export function AdminHome({ applicants, consents }: { applicants: Applicant[] | null; consents: ConsentItem[] | null }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')
  /** 동의서 ID → '다시 보냈어요: …' 한 줄 */
  const [resent, setResent] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const shown = (applicants ?? []).filter(
    (a) =>
      !q ||
      a.guardianName.toLowerCase().includes(q) ||
      (digits !== '' && a.phone.replace(/\D/g, '').includes(digits)),
  )

  function cancel(id: string) {
    startTransition(async () => {
      const out = await cancelConsentAction(id)
      setConfirming(null)
      if (out.error) setError(out.error)
      else if (out.result === 'signed') setError('이미 서명한 동의서는 취소할 수 없어요.')
      else setError('')
      router.refresh()
    })
  }

  function resend(id: string) {
    startTransition(async () => {
      const out = await resendConsentMailAction(id)
      if (out.error) setError(out.error)
      else if (out.result === 'not-signed') setError('서명한 동의서만 다시 보낼 수 있어요.')
      else if (out.result === 'already-sent') {
        setError('')
        setResent((cur) => ({ ...cur, [id]: '이미 두 통 다 보냈어요.' }))
      } else if (out.result) {
        const sent = (ok: boolean) => (ok ? '보냄' : '실패')
        const line = `다시 보냈어요: 보관 ${sent(out.result.archive)} · 사본 ${sent(out.result.guardian)}`
        setError('')
        setResent((cur) => ({ ...cur, [id]: line }))
      }
      router.refresh()
    })
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.heading}>신청서에서 만들기</h2>
        {applicants === null ? (
          <p className={styles.muted}>지금은 시트를 읽을 수 없어요.</p>
        ) : (
          <>
            <label className={styles.label} htmlFor="applicant-search">
              이름이나 연락처로 찾기
            </label>
            <input
              id="applicant-search"
              className={styles.input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {shown.length === 0 ? (
              <p className={styles.muted}>{applicants.length === 0 ? '아직 신청서가 없어요.' : '찾는 신청서가 없어요.'}</p>
            ) : (
              <ul className={`${styles.list} ${styles.scroll}`}>
                {shown.slice(0, 100).map((a) => (
                  <li key={a.applyId}>
                    <Link className={styles.item} href={`/admin/new?apply=${a.applyId}`}>
                      <span className={styles.itemTitle}>
                        {a.guardianName || '(이름 없음)'} · {a.petName}
                      </span>
                      <span className={styles.muted}>
                        {a.receivedAt.slice(0, 10)} · {a.phone}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <Link className={styles.secondary} href="/admin/new">
          신청서 없이 새로 만들기
        </Link>
      </section>

      <section className={styles.section}>
        <h2 className={styles.heading}>최근 동의서</h2>
        {consents === null ? (
          <p className={styles.muted}>지금은 시트를 읽을 수 없어요.</p>
        ) : consents.length === 0 ? (
          <p className={styles.muted}>아직 만든 동의서가 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {consents.map((c) => (
              <li key={c.id} className={styles.item} data-consent={c.id}>
                <span className={styles.itemTitle}>
                  {c.bundleLabel} · {c.guardianName}
                </span>
                <span>{c.status}</span>
                <span className={styles.muted}>
                  {c.createdAt.slice(0, 10)}
                  {c.mail ? ` · 메일: ${c.mail}` : ''}
                </span>
                {c.url && (
                  <div className={styles.row}>
                    <CopyLink url={c.url} />
                    <SignHere url={c.url} />
                    <button className={styles.small} type="button" onClick={() => setConfirming(c.id)}>
                      취소
                    </button>
                  </div>
                )}
                {c.resend && (
                  <div className={styles.row}>
                    <button className={styles.small} type="button" disabled={pending} onClick={() => resend(c.id)}>
                      메일 다시 보내기
                    </button>
                  </div>
                )}
                {resent[c.id] && (
                  <p className={styles.muted} role="status">
                    {resent[c.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>

      {confirming && (
        <div className={styles.backdrop}>
          <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="동의서 취소">
            <p>이 링크를 취소할까요? 보호자가 더 이상 열 수 없어요.</p>
            <button className={styles.primary} type="button" disabled={pending} onClick={() => cancel(confirming)}>
              취소하기
            </button>
            <button className={styles.secondary} type="button" disabled={pending} onClick={() => setConfirming(null)}>
              그대로 두기
            </button>
          </div>
        </div>
      )}
    </>
  )
}
