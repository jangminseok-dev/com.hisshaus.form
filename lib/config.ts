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

/** 검사지 링크의 서명 비밀값(lib/survey-link.ts). 짧으면 추측당할 수 있어 32자 이상만 받는다. */
export function surveyLinkSecret(): string {
  const name = 'SURVEY_LINK_SECRET'
  const value = required(name)
  // 값은 메시지에 넣지 않는다.
  if (value.length < 32) throw new Error(`환경 변수 ${name} 이 너무 짧다.`)
  return value
}

/**
 * 알림 첫 줄에 붙일 멘션. 없으면 멘션 없이 보낸다. 값: `channel` · `here` · 슬랙 멤버 ID(U… / W…), 쉼표로 여러 개.
 * 멘션이 있어야 휴대폰 슬랙이 기본 설정(다이렉트 메시지·멘션만 알림)에서도 울린다.
 */
export function slackMention(): string | undefined {
  return process.env.SLACK_MENTION || undefined
}

// 아래 둘은 e2e 가 진짜 시트 대신 가짜 서비스를 부를 때만 쓰는 테스트용 선택 변수다. 없어도 던지지 않는다.
// 운영(NODE_ENV=production)에서는 있어도 읽지 않는다: 운영 환경 변수에 잘못 남아도 보호자 정보가 다른 주소로 가지 않게 한다.
function testOnly(name: string): string | undefined {
  if (process.env.NODE_ENV === 'production') return undefined
  return process.env[name] || undefined
}

/** 구글 시트 API 주소의 앞부분(끝에 / 없이). 테스트용 SHEETS_BASE_URL 이 있으면 그것. */
export function sheetsBaseUrl(): string {
  return testOnly('SHEETS_BASE_URL') ?? 'https://sheets.googleapis.com'
}

/** 서비스 계정 JWT 대신 쓸 고정 토큰. 테스트용 SHEETS_FAKE_TOKEN 이 있을 때만 값이 있다. */
export function sheetsFakeToken(): string | undefined {
  return testOnly('SHEETS_FAKE_TOKEN')
}
