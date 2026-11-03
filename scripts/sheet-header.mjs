// 세 탭의 시트 헤더를 탭 구분으로 출력한다. 시트 첫 줄에 붙여 넣는다.
import { applyForm } from '../forms/apply'
import { surveyForm } from '../forms/survey'
import { CONSENT_HEADER } from '../lib/consent-store'
import { sheetHeader } from '../lib/sheet-row'

for (const [tab, header] of [
  ['예약신청', sheetHeader(applyForm)],
  ['검사지', sheetHeader(surveyForm)],
  ['동의서', CONSENT_HEADER],
]) {
  console.log(tab)
  console.log(header.join('\t'))
}
