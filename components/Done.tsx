'use client'

import Link from 'next/link'

import { depositOf } from '../lib/deposit'
import { BankAccount } from './BankAccount'
import { CheckMark } from './CheckMark'
import { KakaoLink } from './KakaoLink'
import { useApplySession } from '../lib/use-session'
import styles from './Screen.module.css'

/** 신청이 접수된 뒤의 완료 화면. 신청 세션이 있어야 열린다. 연락처는 방금 적은 본인이 확인하는 자리라 가리지 않는다(사용자 결정 2026-10-24). */
export function Done() {
  const session = useApplySession()
  if (!session) return null

  return (
    <div className={styles.screen}>
      <CheckMark />
      {/* 반려견 이름을 불러 준다(끝맛). 요약은 아래에 그대로. */}
      <h1 className={styles.title}>{session.petName}의 신청서가 잘 도착했어요</h1>
      <p className={`${styles.text} ${styles.summary}`}>
        {session.services.join(', ')} · {session.wish} 희망
      </p>
      <div className={styles.box}>
        <h2 className={styles.boxTitle}>다음 순서</h2>
        <ol className={styles.steps}>
          <li>1. 히스하우스가 신청서를 확인하고 연락드려요</li>
          <li>2. 연락하면서 예약 날짜와 시간을 확정해요</li>
          <li>3. 확정된 뒤 예약금 {depositOf(session.services)}을 아래 계좌로 입금해 주세요</li>
          <li>4. 입금이 확인되면 예약이 완료돼요</li>
        </ol>
        <BankAccount />
      </div>
      <p className={styles.text}>
        곧 {session.guardianPhone} 로 연락드릴게요.
        <br />
        변경이나 취소는 카카오톡 채널로 알려 주세요.
      </p>
      {/* 교육미용이면 검사지가 주 버튼이고 확인은 보조 버튼. 아니면 확인 하나가 주 버튼이다. 확인은 첫 화면으로 간다. */}
      <div className={styles.actions}>
        {session.training && !session.surveyDone ? (
          <>
            <Link className={styles.primary} href="/survey?from=apply">
              검사지 이어서 쓰기
            </Link>
            <KakaoLink />
            <Link className={styles.secondary} href="/">
              확인
            </Link>
          </>
        ) : (
          <>
            <KakaoLink />
            <Link className={styles.primary} href="/">
              확인
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
