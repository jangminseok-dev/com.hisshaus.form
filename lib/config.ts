// 설정은 서버에서만 읽는다. process.env 를 읽는 곳은 이 파일 하나다.

function required(name: string): string {
  const value = process.env[name]
  // 값은 메시지에 넣지 않는다. 변수 이름만 담는다.
  if (!value) throw new Error(`환경 변수 ${name} 이 없다.`)
  return value
}

/** 슬랙 수신 웹훅 주소. */
export function slackWebhookUrl(): string {
  return required('SLACK_WEBHOOK_URL')
}

/** 신청을 쌓을 구글 시트 ID. */
export function sheetId(): string {
  return required('GOOGLE_SHEET_ID')
}

/** base64 로 인코딩된 서비스 계정 JSON 에서 이메일과 개인키를 꺼낸다. */
export function serviceAccount(): { clientEmail: string; privateKey: string } {
  const name = 'GOOGLE_SERVICE_ACCOUNT_JSON'
  const raw = required(name)
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    if (!parsed.client_email || !parsed.private_key) throw new Error()
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key }
  } catch {
    // 내용은 메시지에 넣지 않는다.
    throw new Error(`환경 변수 ${name} 을 읽을 수 없다.`)
  }
}
