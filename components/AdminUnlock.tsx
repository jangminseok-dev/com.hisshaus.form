'use client'

import { useActionState } from 'react'

import { type ActionState, unlock } from '../app/admin/actions'
import styles from './Admin.module.css'

/** 아이패드 잠금 화면. PIN 4자리로 푼다. */
export function AdminUnlock() {
  const [state, action, pending] = useActionState<ActionState, FormData>(unlock, {})
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>잠겨 있어요</h1>
      <p className={styles.text}>사장님 PIN 4자리를 넣어 주세요.</p>
      <form className={styles.form} action={action}>
        <label className={styles.label} htmlFor="admin-pin">
          PIN
        </label>
        <input
          id="admin-pin"
          className={styles.input}
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          required
        />
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        <button className={styles.primary} type="submit" disabled={pending}>
          풀기
        </button>
      </form>
    </div>
  )
}
