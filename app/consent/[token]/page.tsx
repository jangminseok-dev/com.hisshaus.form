import type { Metadata } from 'next'

import { ConsentFlow } from '../../../components/ConsentFlow'
import { ConsentNotice } from '../../../components/ConsentNotice'
import { readSession } from '../../../lib/admin-guard'
import { BASE_PATH } from '../../../lib/base-path'
import { consentIdOf } from '../../../lib/consent-link'
import { loadConsents, type ConsentRecord } from '../../../lib/consent-store'

const title = '히스하우스 동의서'
const description = '보호자 정보를 확인하고 동의서에 서명해 주세요.'

// 사장님이 카카오톡으로 동의서 링크를 보낼 때 보이는 미리보기다. Next 는 openGraph 를 통째로 덮으므로 그림도 다시 적고,
// 그림 주소에는 basePath 를 직접 붙인다.
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [`${BASE_PATH}/og-shop.jpg`] },
}

// 서명됐는지·취소됐는지는 열 때마다 다르다. 미리 그려 두지 않는다.
export const dynamic = 'force-dynamic'

/** 잠긴 사장님 세션이면 매장 아이패드로 서명하는 중이다. 세션을 못 읽어도 페이지는 연다(보호자 기기로 본다). */
async function isDevice(): Promise<boolean> {
  try {
    return (await readSession())?.locked === true
  } catch {
    return false
  }
}

/**
 * 동의서 서명 링크(`/consent/{동의서 ID}-{서명}`). 링크가 틀렸거나 취소됐거나 모르는 동의서면 닫힌 안내, 이미 서명했으면 서명함 안내,
 * 기록을 못 읽으면 오류 안내(묶음·사장님 칸이 시트에 있어서 화면을 그릴 수 없다). 아니면 서명 화면에 이 동의서의 준비 기록만 넘긴다.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const id = consentIdOf(token)
  if (!id) return <ConsentNotice kind="closed" />
  let record: ConsentRecord | undefined
  try {
    record = (await loadConsents()).get(id)
  } catch {
    return <ConsentNotice kind="error" />
  }
  if (!record || record.cancelled) return <ConsentNotice kind="closed" />
  if (record.signed) return <ConsentNotice kind="signed" />
  return <ConsentFlow token={token} prepared={record.prepared} device={await isDevice()} />
}
