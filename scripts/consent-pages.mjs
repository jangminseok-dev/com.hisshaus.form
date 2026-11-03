// 동의서 원본 PDF 에서 보호자 화면에 쓸 장 그림(public/consent-v1-<장>.png)과 장별 글(content/consent-text.ts)을 만든다.
//   pnpm exec tsx scripts/consent-pages.mjs
// poppler 의 pdftoppm·pdftotext 가 있어야 한다(brew install poppler). 만든 파일은 커밋한다.
// 그림이 바뀌면 lib/consent-docs.ts 의 그림 이름을 v2 로 올린다(카톡·브라우저가 주소별로 저장). 파일 이름은 PAGES[].image 를 따른다.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { PAGES } from '../lib/consent-docs'

const pdfOf = (page) => `content/consent-${page.source}.pdf`

const text = {}
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
