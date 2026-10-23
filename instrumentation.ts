import { serviceAccount, sheetId, slackWebhookUrl } from './lib/config'

// 서버가 뜰 때 설정이 빠졌는지 바로 드러나게 한다.
export function register() {
  slackWebhookUrl()
  sheetId()
  serviceAccount()
}
