// 동의서 원본 PDF 에서 보호자 화면에 쓸 장 그림(public/consent-v1-<장>.png)과 장별 글(content/consent-text.ts)을 만든다.
// 장마다 인쇄된 글자 상자(tests/consent-words.json)도 뽑는다. 테스트가 칸 좌표를 원본 글자와 견준다.
//   pnpm exec tsx scripts/consent-pages.mjs
// poppler 의 pdftoppm·pdftotext 가 있어야 한다(brew install poppler). 만든 파일은 커밋한다.
// 그림이 바뀌면 lib/consent-docs.ts 의 그림 이름을 v2 로 올린다(카톡·브라우저가 주소별로 저장). 파일 이름은 PAGES[].image 를 따른다.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { PAGES } from '../lib/consent-docs'

const pdfOf = (page) => `content/consent-${page.source}.pdf`
const round = (v) => Math.round(v * 100) / 100
const unescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

const text = {}
const words = {}
for (const page of Object.values(PAGES)) {
  const n = String(page.index + 1)
  const png = `public/${page.image.split('/').pop()}`
  execFileSync('pdftoppm', ['-png', '-scale-to-x', '1240', '-scale-to-y', '-1', '-f', n, '-l', n, '-singlefile', pdfOf(page), png.replace(/\.png$/, '')])
  const raw = execFileSync('pdftotext', ['-layout', '-f', n, '-l', n, pdfOf(page), '-'], { encoding: 'utf8' })
  // 줄 끝 공백과 쪽 나눔 문자를 지우고, 빈 줄이 여럿이면 하나로 줄인다
  text[page.id] = raw
    .replace(/\f/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // 글자 상자: pdftotext 는 위가 0 이라 PDF 좌표(왼쪽 아래 원점)로 뒤집는다
  const bbox = execFileSync('pdftotext', ['-bbox', '-f', n, '-l', n, pdfOf(page), '-'], { encoding: 'utf8' })
  const height = Number(/<page width="[\d.]+" height="([\d.]+)"/.exec(bbox)[1])
  words[page.id] = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
    ([, x0, y0, x1, y1, t]) => ({ text: unescape(t), x: round(+x0), y: round(height - y1), w: round(x1 - x0), h: round(y1 - y0) }),
  )
  console.log(`${page.id}: ${png}`)
}

const body = Object.entries(text)
  .map(([id, t]) => `  ${id}: ${JSON.stringify(t)},`)
  .join('\n')
writeFileSync(
  'content/consent-text.ts',
  `// scripts/consent-pages.mjs 가 원본 PDF 에서 뽑은 장별 글이다(pdftotext -layout). 손으로 고치지 말고 스크립트를 다시 돌린다.
// 화면 읽기 프로그램용으로 장 그림 아래 '글로 읽기' 에 보여 준다.
import type { PageId } from '../lib/consent-docs'

export const CONSENT_TEXT: Record<PageId, string> = {
${body}
}
`,
)
console.log('content/consent-text.ts')

// 글자 하나에 한 줄씩 써서 원본이 바뀌었을 때 차이가 보이게 한다
const wordsJson = Object.entries(words)
  .map(([id, ws]) => `  ${JSON.stringify(id)}: [\n${ws.map((w) => `    ${JSON.stringify(w)}`).join(',\n')}\n  ]`)
  .join(',\n')
writeFileSync('tests/consent-words.json', `{\n${wordsJson}\n}\n`)
console.log('tests/consent-words.json')
