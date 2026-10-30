import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SurveyFlow } from '../../../components/SurveyFlow'
import { SurveyNotice } from '../../../components/SurveyNotice'
import { BASE_PATH } from '../../../lib/base-path'
import { surveySubmitted } from '../../../lib/sheets'
import { applyIdOf } from '../../../lib/survey-link'

const title = '히스하우스 심층 행동 분석 검사지'
const description = '교육미용 상담을 위해 반려견에 대해 알려 주세요.'

// 사장님이 카카오톡으로 검사지 링크를 보낼 때 보이는 미리보기다. 정하지 않으면 첫 화면(app/layout.tsx)의 것을 물려받는다.
// Next 는 openGraph 를 통째로 덮으므로 그림(public/og-shop.jpg)도 다시 적는다. 그림 주소에는 basePath 를 직접 붙인다.
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [`${BASE_PATH}/og-shop.jpg`] },
}

// 이미 냈는지는 열 때마다 다르다. 미리 그려 두지 않는다.
export const dynamic = 'force-dynamic'

/**
 * 검사지 링크(`/survey/{신청 ID}-{서명}`). 링크가 틀리면 검사지 화면을 그리지 않고 `/survey`(안내)로 보낸다: 이 응답에 검사지 화면의
 * JS 가 실리지 않게 하려는 것이다. 이미 냈으면 닫힌 안내, 아니면 검사지. 냈는지 시트를 못 읽으면 검사지를 연다(제출 때 다시 본다).
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const applyId = applyIdOf(token)
  if (!applyId) redirect('/survey')
  let closed = false
  try {
    closed = await surveySubmitted(applyId)
  } catch {
    // 시트 장애. 보호자를 막지 않는다.
  }
  return closed ? <SurveyNotice kind="closed" /> : <SurveyFlow applyId={applyId} token={token} />
}
