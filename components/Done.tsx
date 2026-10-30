'use client'

import Link from 'next/link'

import { depositOf } from '../lib/deposit'
import { clearDraft, clearSession } from '../lib/draft'
import { BankAccount } from './BankAccount'
import { CheckMark } from './CheckMark'
import { KakaoLink } from './KakaoLink'
import { useApplySession } from '../lib/use-session'
import styles from './Screen.module.css'

/** 신청이 접수된 뒤의 완료 화면. 신청 세션이 있어야 열린다. 연락처는 방금 적은 본인이 확인하는 자리라 가리지 않는다(사용자 결정 2026-10-24). */
export function Done() {
  const session = useApplySession()
  if (!session) return null

  function finish() {
    clearSession()
    clearDraft('survey')
  }

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
          {/* 검사지는 교육미용 상담 예약금을 받은 뒤에만 보낸다(사장님 결정 2026-10-30). */}
          {session.training && <li>5. 입금이 확인되면 카카오톡으로 검사지 링크를 보내 드려요</li>}
        </ol>
        <BankAccount />
      </div>
      <p className={styles.text}>
        곧 {session.guardianPhone} 로 연락드릴게요.
        <br />
        변경이나 취소는 카카오톡 채널로 알려 주세요.
      </p>
      {/*
        확인은 "다 봤다" 는 뜻이라 세션과 검사지 초안을 지우고 첫 화면으로 간다(공용 기기에서 다음 사람이 완료 화면을 못 본다).
        뒤로·앞으로 가기만으로는 지우지 않는다(CLAUDE.md).
      */}
      <div className={styles.actions}>
        <KakaoLink />
        <Link className={styles.primary} href="/" onClick={finish}>
          확인
        </Link>
      </div>
    </div>
  )
}
