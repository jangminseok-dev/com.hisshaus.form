import styles from './Screen.module.css'

/**
 * 완료 화면 맨 위의 체크 표시. 열릴 때 선이 한 번 그려진다(끝맛 하나). 움직임 줄이기 설정에서는 그려진 채로 보인다.
 * 장식이라 낭독에서 뺀다.
 */
export function CheckMark() {
  return (
    <svg className={styles.check} width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="28" cy="28" r="26" stroke="currentColor" strokeWidth="2" />
      <path className={styles.checkStroke} d="M17 29l8 8 14-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
