'use client'

import { useActionState } from 'react'

import { type ActionState, sendTestMail } from '../app/admin/actions'
import styles from './Admin.module.css'

/** 운영에서 메일 발송이 되는지 눌러 보는 버튼. */
export function AdminTestMail() {
  const [state, action, pending] = useActionState<ActionState & { ok?: boolean }, FormData>(sendTestMail, {})
  return (
    <form className={styles.form} action={action}>
      <button className={styles.secondary} type="submit" disabled={pending}>
        메일 시험 보내기
      </button>
      {state.ok && <p className={styles.text}>보냈어요. hisshaus 메일함을 확인해 주세요.</p>}
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
