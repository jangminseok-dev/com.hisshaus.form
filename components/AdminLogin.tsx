'use client'

import { useActionState } from 'react'

import { type ActionState, login } from '../app/admin/actions'
import styles from './Admin.module.css'

/** 사장님 화면 로그인. 틀리면 서버가 1초 뒤에 답한다. */
export function AdminLogin() {
  const [state, action, pending] = useActionState<ActionState, FormData>(login, {})
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>사장님 화면</h1>
      <form className={styles.form} action={action}>
        <label className={styles.label} htmlFor="admin-password">
          비밀번호
        </label>
        <input
          id="admin-password"
          className={styles.input}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        <button className={styles.primary} type="submit" disabled={pending}>
          들어가기
        </button>
      </form>
    </div>
  )
}
