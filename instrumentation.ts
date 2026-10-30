import { serviceAccount, sheetId, slackWebhookUrl, surveyLinkSecret } from './lib/config'

// 서버가 뜰 때 설정이 빠졌는지 바로 드러나게 한다.
export function register() {
  slackWebhookUrl()
  sheetId()
  serviceAccount()
  // 없으면 교육미용 신청의 슬랙 알림이 링크를 만들다 통째로 빠지고 검사지 링크가 500 이다. 조용히 새지 않게 뜰 때 막는다.
  surveyLinkSecret()
}
