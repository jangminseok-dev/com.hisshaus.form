import type { Metadata } from 'next'

import { ConsentCreate } from '../../../components/ConsentCreate'
import { requireAdmin } from '../../../lib/admin-guard'
import { type Applicant, loadApplicants } from '../../../lib/applicants'
import { isSubmissionId } from '../../../lib/id'

export const metadata: Metadata = { title: '동의서 만들기' }
export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ apply?: string | string[] }> }) {
  await requireAdmin()
  const { apply } = await searchParams
  const id = Array.isArray(apply) ? apply[0] : apply
  let applicant: Applicant | null = null
  let notFound = false
  if (id !== undefined) {
    if (isSubmissionId(id)) {
      try {
        applicant = (await loadApplicants()).find((a) => a.applyId === id) ?? null
      } catch {
        // 시트를 못 읽으면 신청서 없이 만드는 것과 같다.
      }
    }
    notFound = applicant === null
  }
  return <ConsentCreate applicant={applicant} notFound={notFound} />
}
