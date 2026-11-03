import type { Metadata } from 'next'

import { AdminHome, type ConsentItem } from '../../components/AdminHome'
import { AdminLogin } from '../../components/AdminLogin'
import { AdminTestMail } from '../../components/AdminTestMail'
import { AdminUnlock } from '../../components/AdminUnlock'
import styles from '../../components/Admin.module.css'
import { readSession } from '../../lib/admin-guard'
import { loadApplicants } from '../../lib/applicants'
import { bundleOf } from '../../lib/consent-docs'
import { consentUrl } from '../../lib/consent-link'
import { type ConsentRecord, loadConsents } from '../../lib/consent-store'
import { logout } from './actions'

export const metadata: Metadata = { title: '사장님 화면' }
export const dynamic = 'force-dynamic'

function toItem(r: ConsentRecord): ConsentItem {
  const p = r.prepared
  const waiting = !r.signed && !r.cancelled
  return {
    id: p.id,
    bundleLabel: bundleOf(p.bundle)?.label ?? p.bundle,
    guardianName: r.signed?.guardian.guardianName || p.shown?.guardianName || '신청서 없음',
    status: r.signed ? '서명함' : r.cancelled ? '취소함' : '서명 대기',
    mail: r.mail ? `보관 ${r.mail.archive ? '보냄' : '실패'} · 사본 ${r.mail.guardian ? '보냄' : '실패'}` : null,
    // 메일 줄을 못 붙였거나 응답 전에 끊긴 서명은 메일 결과가 없다. 보냈는지 모르니 다시 보낼 수 있게 한다.
    resend: r.signed !== null && (r.mail === null || !r.mail.archive || !r.mail.guardian),
    createdAt: p.createdAt,
    url: waiting ? consentUrl(p.id) : null,
  }
}

// 세션 없음 → 로그인, 잠김 → PIN, 아니면 홈. 시트를 못 읽으면 그 목록만 null 로 넘긴다.
export default async function Page() {
  const session = await readSession()
  if (!session) return <AdminLogin />
  if (session.locked) return <AdminUnlock />
  const applicants = await loadApplicants().then(
    (a) => a.slice(0, 100),
    () => null,
  )
  const consents = await loadConsents().then(
    (m) => [...m.values()].reverse().slice(0, 30).map(toItem),
    () => null,
  )
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>사장님 화면</h1>
      <AdminHome applicants={applicants} consents={consents} />
      <AdminTestMail />
      <form action={logout}>
        <button className={styles.secondary} type="submit">
          로그아웃
        </button>
      </form>
    </div>
  )
}
