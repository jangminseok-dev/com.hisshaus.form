'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { loadSession, type ApplySession } from '../lib/draft'
import styles from './Screen.module.css'

/**
 * 검사지가 접수된 뒤의 완료 화면. 세션 없이도 열린다(사장님이 보낸 검사지 링크로 바로 쓴 경우).
 * 신청서를 내고 이어서 쓴 경우(세션에 surveyDone)에는 신청과 함께 전달됐다고 알리고, 아니면 신청서도 써 달라고 안내한다.
 * 세션은 브라우저에만 있어서 마운트 뒤에 읽는다(use-session 과 같은 이유). 읽기 전에는 공통 부분만 보인다.
 */
export function SurveyDone() {
  const [session, setSession] = useState<ApplySession | null | undefined>(undefined)
  useEffect(() => {
    setSession(loadSession())
  }, [])
  const withApply = session?.surveyDone === true

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>검사지가 접수되었어요</h1>
      {withApply && (
        <p className={`${styles.text} ${styles.summary}`}>{session.petName}의 예약 신청과 함께 히스하우스에 전달됐어요.</p>
      )}
      <div className={styles.box}>
        <h2 className={styles.boxTitle}>다음 순서</h2>
        <ol className={styles.steps}>
          <li>1. 히스하우스가 검사지를 확인해요</li>
          <li>2. 교육미용 상담 날짜와 시간을 연락드려요</li>
          <li>3. 예약금 10,000원 입금이 확인되면 예약이 확정돼요</li>
        </ol>
      </div>
      {session === null && (
        <p className={styles.text}>예약 신청서를 아직 보내지 않았다면 이어서 작성해 주세요. 검사지만으로는 예약이 잡히지 않아요.</p>
      )}
      {session !== undefined && (
        <div className={styles.actions}>
          {session === null ? (
            <>
              <Link className={styles.primary} href="/apply">
                예약 신청서 쓰기
              </Link>
              <Link className={styles.secondary} href="/">
                처음으로
              </Link>
            </>
          ) : (
            <Link className={styles.primary} href="/">
              처음으로
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
