// 두 폼의 시트 헤더를 탭 구분으로 출력한다. 시트 첫 줄에 붙여 넣는다.
import { applyForm } from '../forms/apply'
import { surveyForm } from '../forms/survey'
import { sheetHeader } from '../lib/sheet-row'

for (const [tab, form] of [['예약신청', applyForm], ['검사지', surveyForm]]) {
  console.log(tab)
  console.log(sheetHeader(form).join('\t'))
}
