import styles from './Screen.module.css'

/** 검사지가 접수된 뒤의 완료 화면. 보여 줄 값이 없어서 세션 없이도 열린다. */
export function SurveyDone() {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>검사지가 접수되었어요</h1>
      <p className={styles.text}>히스하우스가 내용을 확인하고 연락드려요.</p>
    </div>
  )
}
