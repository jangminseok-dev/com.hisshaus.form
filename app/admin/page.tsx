import type { Metadata } from 'next'

import { AdminLogin } from '../../components/AdminLogin'
import { AdminUnlock } from '../../components/AdminUnlock'
import styles from '../../components/Admin.module.css'
import { readSession } from '../../lib/admin-guard'
import { logout } from './actions'

export const metadata: Metadata = { title: '사장님 화면' }
export const dynamic = 'force-dynamic'

// 세션 없음 → 로그인, 잠김 → PIN, 아니면 홈. 홈은 이후 작업에서 채운다.
export default async function Page() {
  const session = await readSession()
  if (!session) return <AdminLogin />
  if (session.locked) return <AdminUnlock />
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>사장님 화면</h1>
      <form action={logout}>
        <button className={styles.secondary} type="submit">
          로그아웃
        </button>
      </form>
    </div>
  )
}
