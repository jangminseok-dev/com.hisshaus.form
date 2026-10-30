import Link from 'next/link'

import { KakaoLink } from './KakaoLink'
import styles from './Screen.module.css'

const COPY = {
  locked: {
    title: '검사지는 받은 링크로 열어 주세요',
    text: '심층 행동 분석 검사지는 교육미용 상담 예약금 입금이 확인된 뒤 카카오톡으로 링크를 보내 드려요.',
  },
  closed: {
    title: '이미 제출된 검사지예요',
    text: '고칠 내용이 있으면 카카오톡 채널로 알려 주세요.',
  },
}

/**
 * 검사지 문항 대신 보이는 안내. locked: 링크 없이 `/survey` 를 열었거나 링크가 틀렸다. closed: 이 링크로 검사지를 이미 냈다.
 * 문항 정의를 불러오지 않는다(이 화면의 JS 에 문항이 실리지 않게).
 */
export function SurveyNotice({ kind }: { kind: 'locked' | 'closed' }) {
  const { title, text } = COPY[kind]
  return (
    <div className={styles.screen} data-notice={kind}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        <KakaoLink />
        <Link className={styles.primary} href="/">
          처음으로
        </Link>
      </div>
    </div>
  )
}
