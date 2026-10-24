import type { Metadata } from 'next'

import { SurveyFlow } from '../../components/SurveyFlow'
import { BASE_PATH } from '../../lib/base-path'

const title = '히스하우스 심층 행동 분석 검사지'
const description = '교육미용 상담을 위해 반려견에 대해 알려 주세요.'

// 사장님이 카카오톡으로 이 주소만 보낼 때 보이는 미리보기다. 정하지 않으면 첫 화면(app/layout.tsx)의 것을 물려받는다.
// Next 는 openGraph 를 통째로 덮으므로 그림(public/og.jpg)도 다시 적는다. 그림 주소에는 basePath 를 직접 붙인다.
export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, images: [`${BASE_PATH}/og.jpg`] },
}

export default function Page() {
  return <SurveyFlow />
}
