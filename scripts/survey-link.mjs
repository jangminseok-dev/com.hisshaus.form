// 검사지 링크를 출력한다. 슬랙 알림에 링크가 없는 신청(이 기능 전에 들어온 교육미용 신청, 카톡으로만 예약한 손님)에 쓴다.
//   pnpm survey:link Ab3dE5gH7j   그 신청 ID 의 링크
//   pnpm survey:link              새 신청 ID 를 만들어 링크(예약신청 탭에는 없는 ID 다)
// 비밀값은 .env.local 의 SURVEY_LINK_SECRET 을 읽는다. 운영(Vercel)과 같은 값이어야 운영에서 열린다. 비밀값은 찍지 않는다.
import { isSubmissionId, newSubmissionId } from '../lib/id'
import { surveyUrl } from '../lib/survey-link'

const given = process.argv[2]
if (given !== undefined && !isSubmissionId(given)) {
  console.error('신청 ID 는 영숫자 10자다(시트의 신청 ID 칸).')
  process.exit(1)
}
const applyId = given ?? newSubmissionId()
if (given === undefined) console.log(`신청 ID ${applyId}`)
console.log(surveyUrl(applyId))
