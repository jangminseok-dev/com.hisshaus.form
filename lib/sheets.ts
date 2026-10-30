import { JWT } from 'google-auth-library'
import { serviceAccount, sheetId, sheetsBaseUrl, sheetsFakeToken } from './config'

export type SheetTab = '예약신청' | '검사지'

export interface SheetsDeps {
  fetch?: typeof fetch
  token?: () => Promise<string>
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TIMEOUT_MS = 10_000
/** 토큰 요청은 시트 POST 보다 짧게 둔다: 토큰 + 시트 + 슬랙이 함수 한도 30초 안에 들어와야 한다. */
const TOKEN_TIMEOUT_MS = 5_000

let jwt: JWT | undefined

/** 서비스 계정의 접근 토큰. JWT 는 처음 쓸 때 한 번만 만들고, 토큰은 라이브러리가 만료 전까지 보관한다. */
async function accessToken(): Promise<string> {
  if (!jwt) {
    const { clientEmail, privateKey } = serviceAccount()
    jwt = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [SCOPE],
      // 토큰 요청: 한 시도 5초(라이브러리 기본은 제한 없음). 응답 없음은 재시도하지 않고,
      // 5xx 는 라이브러리 기본 재시도를 쓴다(구글 토큰 엔드포인트의 일시 오류에 쓸모가 있다).
      transporterOptions: { timeout: TOKEN_TIMEOUT_MS, retryConfig: { noResponseRetries: 0 } },
    })
  }
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('토큰이 비어 있다')
  return token
}

/** 토큰 함수. 테스트용 고정 토큰이 있으면 JWT 를 만들지 않는다(운영에서는 config 가 항상 없다고 답한다). */
function tokenOf(deps: SheetsDeps): () => Promise<string> {
  const fakeToken = sheetsFakeToken()
  return deps.token ?? (fakeToken ? async () => fakeToken : accessToken)
}

/**
 * 탭 맨 아래에 한 줄을 붙인다. 실패하면 `Error('sheets')` 만 던진다.
 * 토큰·네트워크·응답 오류는 모두 버린다: 오류 안에 키나 주소가 들어 있을 수 있다.
 */
export async function appendRow(tab: SheetTab, row: string[], deps: SheetsDeps = {}): Promise<void> {
  const post = deps.fetch ?? fetch
  const getToken = tokenOf(deps)
  let ok = false
  try {
    const token = await getToken()
    const range = encodeURIComponent(`'${tab}'!A1`)
    // RAW: 보호자가 =IMPORTXML(...) 같은 걸 적어도 수식이 아니라 글자로 저장된다. USER_ENTERED 로 바꾸지 않는다.
    const url = `${sheetsBaseUrl()}/v4/spreadsheets/${sheetId()}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
    const res = await post(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    ok = res.ok
  } catch {
    // 토큰·설정·네트워크·타임아웃 오류는 버린다.
  }
  if (!ok) throw new Error('sheets')
}

/**
 * 이 신청 ID 로 낸 검사지가 이미 있나. 검사지 탭의 B열(신청 ID)을 읽는다. 검사지 링크를 열 때와 제출할 때 부른다.
 * 실패하면 appendRow 와 같이 `Error('sheets')` 만 던진다.
 */
export async function surveySubmitted(applyId: string, deps: SheetsDeps = {}): Promise<boolean> {
  const get = deps.fetch ?? fetch
  const getToken = tokenOf(deps)
  let values: unknown
  try {
    const token = await getToken()
    const range = encodeURIComponent("'검사지'!B:B")
    const res = await get(`${sheetsBaseUrl()}/v4/spreadsheets/${sheetId()}/values/${range}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) values = ((await res.json()) as { values?: unknown }).values ?? []
  } catch {
    // 토큰·설정·네트워크·타임아웃·깨진 응답은 버린다.
  }
  if (!Array.isArray(values)) throw new Error('sheets')
  return values.some((row) => Array.isArray(row) && row[0] === applyId)
}
