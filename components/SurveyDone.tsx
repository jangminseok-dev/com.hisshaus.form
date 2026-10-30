'use client'

import Link from 'next/link'

import { SURVEY_CREDIT } from '../forms/survey-credit'
import { clearDraft, clearSession } from '../lib/draft'
import { CheckMark } from './CheckMark'
import { KakaoLink } from './KakaoLink'
import styles from './Screen.module.css'

/**
 * 검사지가 접수된 뒤의 완료 화면. 예약금은 이미 입금한 뒤라 계좌 안내가 없다.
 * 누구나 열 수 있는 주소라 문항 정의(forms/survey.ts)를 불러오지 않는다. 불러오면 문항 전체가 이 화면의 JS 에 실린다.
 */
export function SurveyDone() {
  /** 처음으로 = 다 봤다. 세션과 초안을 지운다(공용 기기에서 다음 사람이 남은 것을 못 본다). */
  function finish() {
    clearSession()
    clearDraft('survey')
    clearDraft('apply')
  }

  return (
    <div className={styles.screen}>
      <CheckMark />
      <h1 className={styles.title}>검사지가 잘 도착했어요</h1>
      <p className={styles.text}>상담 전에 꼼꼼히 읽어 볼게요. 고칠 내용이 있으면 카카오톡 채널로 알려 주세요.</p>
      <div className={styles.actions}>
        <KakaoLink />
        <Link className={styles.primary} href="/" onClick={finish}>
          처음으로
        </Link>
      </div>
      <p className={styles.credit}>{SURVEY_CREDIT}</p>
    </div>
  )
}
