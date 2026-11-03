// e2e 전용 가짜 슬랙·시트 서비스. 진짜 서비스를 부르지 않고 받은 것을 메모리에 쌓는다.
// Node 내장 http 만 쓰고, 로그는 찍지 않는다(본문에 보호자 정보가 있다).
//
//   POST /slack                                     슬랙 웹훅. JSON 본문을 쌓고 200
//   POST /v4/spreadsheets/:id/values/:range:append  시트 append. 행을 쌓고 200
//   GET  /v4/spreadsheets/:id/values/'탭'!X:Y        시트 읽기. 그 탭에 쌓인 행들의 X..Y열을 { values: [[값, …], …] } 로(머리글 줄 없음)
//   GET  /v4/spreadsheets/:id/values/'탭'!X<n>       한 칸. 그 탭에 쌓인 n 번째(1부터) 행의 X열을 { values: [[값]] } 로
//   POST /mail                                      메일. JSON { from, to, subject, text, attachment? } 을 쌓고 200
//   GET  /__state                                   쌓인 것을 { slack, sheets, mail } 로
//   POST /__reset                                   비운다
//   그 밖은 404
//
// 사용: node tests/e2e/fake-services.mjs [포트]   (기본 3031, 127.0.0.1 에서만 듣는다)
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3031)

const state = { slack: [], sheets: [], mail: [] }

const APPEND = /^\/v4\/spreadsheets\/([^/]+)\/values\/(.+):append$/
const READ = /^\/v4\/spreadsheets\/[^/]+\/values\/([^/]+)$/
/** '탭'!X:Y(열 범위, X:X 는 한 열) 또는 '탭'!X<n>(한 칸) 꼴의 범위. */
const RANGE = /^'(.+)'!([A-Z])(?::([A-Z])|(\d+))$/

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(res, status, body = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) })
  res.end(text)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://fake')
  try {
    if (req.method === 'GET' && url.pathname === '/__state') return send(res, 200, state)
    if (req.method === 'POST' && url.pathname === '/__reset') {
      state.slack = []
      state.sheets = []
      state.mail = []
      return send(res, 200)
    }
    if (req.method === 'POST' && url.pathname === '/mail') {
      state.mail.push(JSON.parse(await readBody(req)))
      return send(res, 200)
    }
    if (req.method === 'POST' && url.pathname === '/slack') {
      state.slack.push(JSON.parse(await readBody(req)))
      return send(res, 200)
    }
    const append = req.method === 'POST' ? APPEND.exec(url.pathname) : null
    if (append) {
      const { values } = JSON.parse(await readBody(req))
      state.sheets.push({
        id: decodeURIComponent(append[1]),
        range: decodeURIComponent(append[2]),
        query: Object.fromEntries(url.searchParams),
        authorization: req.headers.authorization,
        values,
      })
      return send(res, 200)
    }
    const read = req.method === 'GET' ? READ.exec(url.pathname) : null
    const target = read ? RANGE.exec(decodeURIComponent(read[1])) : null
    if (target) {
      const [, tab, from, to, cell] = target
      const col = (letter) => letter.charCodeAt(0) - 'A'.charCodeAt(0)
      const rows = state.sheets.filter((s) => s.range.startsWith(`'${tab}'!`)).flatMap((s) => s.values)
      if (cell) {
        // 한 칸: 그 탭에 쌓인 줄의 n 번째(1부터, 가짜에는 머리글 줄이 없다). 없거나 빈 칸이면 values 가 없다.
        const value = rows[Number(cell) - 1]?.[col(from)]
        return send(res, 200, value ? { values: [[value]] } : {})
      }
      const [a, b] = [col(from), col(to)]
      return send(res, 200, { values: rows.map((row) => Array.from({ length: b - a + 1 }, (_, i) => row[a + i] ?? '')) })
    }
    send(res, 404)
  } catch {
    // 본문이 JSON 이 아니다. 내용은 찍지 않는다.
    send(res, 400)
  }
})

server.listen(port, '127.0.0.1')
