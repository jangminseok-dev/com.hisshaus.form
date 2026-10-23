import Link from 'next/link'

import styles from './Screen.module.css'

/** 없는 주소를 열었을 때의 화면. Next 의 기본 404(영어)를 대신한다. */
export function NotFound() {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>페이지를 찾을 수 없어요</h1>
      <p className={styles.text}>주소를 다시 확인해 주세요.</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/">
          처음으로
        </Link>
      </div>
    </div>
  )
}
