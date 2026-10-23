import { JWT } from 'google-auth-library'
import { serviceAccount, sheetId } from './config'

export type SheetTab = '예약신청' | '검사지'

export interface SheetsDeps {
  fetch?: typeof fetch
  token?: () => Promise<string>
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TIMEOUT_MS = 10_000

let jwt: JWT | undefined

/** 서비스 계정의 접근 토큰. JWT 는 처음 쓸 때 한 번만 만들고, 토큰은 라이브러리가 만료 전까지 보관한다. */
async function accessToken(): Promise<string> {
  if (!jwt) {
    const { clientEmail, privateKey } = serviceAccount()
    jwt = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [SCOPE],
      // 토큰 요청에도 시트 POST 와 같은 제한을 건다(라이브러리 기본은 제한 없음).
      // 한 시도마다의 제한이다: gaxios 가 시간 초과를 두 번 더 재시도해서 최악은 약 3배다.
      transporterOptions: { timeout: TIMEOUT_MS },
    })
  }
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('토큰이 비어 있다')
  return token
}

/**
 * 탭 맨 아래에 한 줄을 붙인다. 실패하면 `Error('sheets')` 만 던진다.
 * 토큰·네트워크·응답 오류는 모두 버린다: 오류 안에 키나 주소가 들어 있을 수 있다.
 */
export async function appendRow(tab: SheetTab, row: string[], deps: SheetsDeps = {}): Promise<void> {
  const post = deps.fetch ?? fetch
  const getToken = deps.token ?? accessToken
  let ok = false
  try {
    const token = await getToken()
    const range = encodeURIComponent(`'${tab}'!A1`)
    // RAW: 보호자가 =IMPORTXML(...) 같은 걸 적어도 수식이 아니라 글자로 저장된다. USER_ENTERED 로 바꾸지 않는다.
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
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
