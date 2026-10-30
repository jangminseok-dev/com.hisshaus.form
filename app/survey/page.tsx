import type { Metadata } from 'next'

import { SurveyNotice } from '../../components/SurveyNotice'

export const metadata: Metadata = { title: '히스하우스 심층 행동 분석 검사지' }

// 검사지는 사장님이 보낸 링크(app/survey/[token])로만 열린다. 이 주소는 안내만 보인다(문항 정의를 불러오지 않는다).
export default function Page() {
  return <SurveyNotice kind="locked" />
}
