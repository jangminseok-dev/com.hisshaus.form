'use client'

import Link from 'next/link'

import { maskPhone } from '../lib/format'
import { useApplySession } from '../lib/use-session'
import styles from './Screen.module.css'

/** 신청이 접수된 뒤의 완료 화면. 신청 세션이 있어야 열린다. 연락처는 가운데를 가려 보여 준다. */
export function Done() {
  const session = useApplySession()
  if (!session) return null

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>신청이 접수되었어요</h1>
      <p className={`${styles.text} ${styles.summary}`}>
        {session.petName} · {session.services.join(', ')} · {session.wish} 희망
      </p>
      <div className={styles.box}>
        <h2 className={styles.boxTitle}>다음 순서</h2>
        <ol className={styles.steps}>
          <li>1. 히스하우스가 신청서를 확인하고 연락드려요</li>
          <li>2. 날짜·시간을 맞춘 뒤 예약금 10,000원을 입금해 주세요</li>
          <li>3. 입금이 확인되면 예약이 확정돼요</li>
        </ol>
      </div>
      <p className={styles.text}>{maskPhone(session.guardianPhone)} 로 연락드려요.</p>
      {session.training && !session.surveyDone && (
        <div className={styles.actions}>
          <Link className={styles.primary} href="/survey">
            검사지 이어서 쓰기
          </Link>
        </div>
      )}
    </div>
  )
}
