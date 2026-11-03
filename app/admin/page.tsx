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
// 메일 다시 보내기(서버 액션)가 이 경로에서 시트 읽기·PDF 만들기·메일 두 통을 한다. 함수 시간 제한을 30초로 올린다.
export const maxDuration = 30

/** 메일 줄을 못 붙였거나 응답 전에 끊긴 서명은 메일 결과가 없다. 보냈는지 모르니 다시 보낼 수 있게 한다. */
const needsResend = (r: ConsentRecord) => r.signed !== null && (r.mail === null || !r.mail.archive || !r.mail.guardian)

function toItem(r: ConsentRecord): ConsentItem {
  const p = r.prepared
  const waiting = !r.signed && !r.cancelled
  return {
    id: p.id,
    bundleLabel: bundleOf(p.bundle)?.label ?? p.bundle,
    guardianName: r.signed?.guardian.guardianName || p.shown?.guardianName || '신청서 없음',
    status: r.signed ? '서명함' : r.cancelled ? '취소함' : '서명 대기',
    mail: r.mail ? `보관 ${r.mail.archive ? '보냄' : '실패'} · 사본 ${r.mail.guardian ? '보냄' : '실패'}` : null,
    resend: needsResend(r),
    createdAt: p.createdAt,
    url: waiting ? consentUrl(p.id) : null,
  }
}

// 세션 없음 → 로그인, 잠김 → PIN, 아니면 홈. 시트를 못 읽으면 그 목록만 null 로 넘긴다.
// 최근 동의서는 30건만, 메일을 다시 보내야 하는 서명은 30건 밖까지 모두(최신순) 넘긴다.
export default async function Page() {
  const session = await readSession()
  if (!session) return <AdminLogin />
  if (session.locked) return <AdminUnlock />
  const applicants = await loadApplicants().then(
    (a) => a.slice(0, 100),
    () => null,
  )
  const records = await loadConsents().then(
    (m) => [...m.values()].reverse(),
    () => null,
  )
  const consents = records && records.slice(0, 30).map(toItem)
  const resends = (records ?? []).filter(needsResend).map(toItem)
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>사장님 화면</h1>
      <AdminHome applicants={applicants} consents={consents} resends={resends} />
      <AdminTestMail />
      <form action={logout}>
        <button className={styles.secondary} type="submit">
          로그아웃
        </button>
      </form>
    </div>
  )
}
