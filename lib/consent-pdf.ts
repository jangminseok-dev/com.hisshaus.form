// 서명한 동의서 PDF: 고른 장을 원본에서 복사해 칸 값·체크·사인을 찍고, 맨 끝에 '서명 기록' 페이지를 붙인다.
// 이 PDF 가 보관 메일과 보호자 사본에 붙는 증거다. 같은 값이면 같은 바이트가 나와서(만든 날짜·글꼴 이름 고정)
// 메일 다시 보내기로 다시 만들어도 고유값이 그대로다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

import * as fontkit from 'fontkit'
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import { bundleOf, LAYOUT, PAGE_SIZE, PAGES, type BundleId, type FieldBox, type FieldKey } from './consent-docs'
import { formatKoreanPhone } from './phone'
import { decodeSignature, SIG_H, SIG_W, type Stroke } from './signature'

export interface ConsentPdfInput {
  bundle: BundleId
  consentId: string
  applyId: string // 신청서 없으면 ''
  guardian: { guardianName: string; phone: string; petName: string; breed: string; email: string }
  owner: { programName: string; goal: string; classTime: string; groomingParts: string[] }
  signature: string
  signedAt: string // 'YYYY-MM-DD HH:mm:ss' 한국 시각
  device: string
  agreed: string[] // 기록 페이지에 그대로 찍는 동의 문구
  changes: string[] // 보호자가 고친 값('견종 말티 → 말티즈')
}

const INK = rgb(0x3d / 255, 0x2e / 255, 0x1f / 255) // 짙은 갈색: 칸 값·체크·사인
const GRAY = rgb(0.45, 0.45, 0.45)
const LINE = 1.2 // 줄 간격(글자 크기의 배수)
const MIN_SIZE = 7
const SIG_STROKE = 1.2

// 원본 PDF 와 글꼴은 처음 쓸 때 한 번 읽어 둔다. 경로는 글자 그대로 적어야 빌드(Turbopack)가 이 파일들만 추적한다(변수로 넘기면
// 프로젝트 전체를 배포 묶음에 넣는다). 배포 묶음에 들어가게 next.config.ts 의 outputFileTracingIncludes 에도 같은 셋을 적는다.
// Buffer 를 그대로 넘기면 테스트(jsdom)에서 pdf-lib 의 Uint8Array 검사에 걸려서 Uint8Array 로 옮긴다.
let cache: { agreement: Uint8Array; guidelines: Uint8Array; font: Uint8Array } | undefined
const read = (file: string) => new Uint8Array(readFileSync(file))
function files() {
  cache ??= {
    agreement: read(path.join(process.cwd(), 'content', 'consent-agreement.pdf')),
    guidelines: read(path.join(process.cwd(), 'content', 'consent-guidelines.pdf')),
    font: read(path.join(process.cwd(), 'node_modules', 'pretendard', 'dist', 'public', 'static', 'Pretendard-Regular.otf')),
  }
  return cache
}

// pdf-lib 1.17 은 글꼴을 부분 넣기할 때 옛 fontkit 의 subset.encodeStream() 을 부른다. @pdf-lib/fontkit 은 Pretendard OTF 를
// 부분 넣기하지 못해서('Not a CFF Font') 원본 fontkit 2 를 쓰고, fontkit 2 에는 encode() 만 있어서 그 사이를 잇는다.
const fontkitForPdfLib = {
  create(bytes: Uint8Array) {
    const font = fontkit.create(Buffer.from(bytes)) as fontkit.Font
    const createSubset = font.createSubset.bind(font)
    font.createSubset = () => {
      const subset = createSubset()
      return Object.assign(subset, { encodeStream: () => Readable.from([subset.encode()]) })
    }
    return font
  },
} as unknown as Parameters<PDFDocument['registerFontkit']>[0]

/** Pretendard 를 쓰는 글자만 넣는다. tag 는 대문자 여섯 자(부분 글꼴 이름 앞머리). 이름을 고정해야 바이트가 같게 나온다. */
export async function embedKoreanFont(doc: PDFDocument, tag: string): Promise<PDFFont> {
  doc.registerFontkit(fontkitForPdfLib)
  return doc.embedFont(files().font, { subset: true, customName: `${tag}+Pretendard-Regular` })
}

/** 'YYYY-MM-DD HH:mm:ss'(한국 시각)를 나눈다. 꼴이 틀리면 던진다. */
function parseSignedAt(signedAt: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(signedAt)
  if (!m) throw new Error('서명 시각 꼴이 틀렸어요')
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`)
  if (Number.isNaN(date.getTime())) throw new Error('서명 시각 꼴이 틀렸어요')
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])), date }
}

/** 글자 칸(사인·체크 칸 말고)에 쓸 값. 연락처는 인쇄된 '010 - -' 뒤의 두 칸, 작성일은 서명한 날이다. */
export function fieldValues(input: ConsentPdfInput): Partial<Record<FieldKey, string>> {
  const { guardian, owner } = input
  const parts = formatKoreanPhone(guardian.phone.trim()).split('-')
  const [phoneMid, phoneLast] = parts.length === 3 ? [parts[1], parts[2]] : ['', guardian.phone]
  const { year, month, day } = parseSignedAt(input.signedAt)
  return {
    guardianName: guardian.guardianName,
    phoneMid,
    phoneLast,
    petName: guardian.petName,
    breed: guardian.breed,
    yearSuffix: year.slice(2),
    month,
    day,
    manager: '히스하우스',
    signerName: guardian.guardianName,
    programName: owner.programName,
    goal: owner.goal,
    classTime: owner.classTime,
  }
}

// 칸 폭에서 띄어쓰기마다 줄을 바꾼다. 한 낱말이 줄보다 길면 글자 단위로 자른다.
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const joined = line ? `${line} ${word}` : word
    if (fits(joined)) {
      line = joined
      continue
    }
    if (line) lines.push(line)
    line = ''
    for (const ch of word) {
      if (line && !fits(line + ch)) {
        lines.push(line)
        line = ''
      }
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

// 앞 maxLines 줄만 남기고, 마지막 줄은 '…' 가 칸 폭에 들어가게 줄인다.
function clip(lines: string[], maxLines: number, font: PDFFont, size: number, width: number): string[] {
  const kept = lines.slice(0, maxLines)
  let last = Array.from(kept[kept.length - 1] ?? '')
  while (last.length > 0 && font.widthOfTextAtSize(`${last.join('').trimEnd()}…`, size) > width) last = last.slice(0, -1)
  kept[kept.length - 1] = `${last.join('').trimEnd()}…`
  return kept
}

/**
 * 칸에 글을 맞춘다: 칸 폭에서 줄을 바꾸고, 칸 높이를 넘으면 0.5pt 씩 줄여 7pt 까지, 그래도 넘치면 마지막 줄 끝을 '…' 로.
 * 공백·줄바꿈은 띄어쓰기 하나로 모은다.
 */
export function fitText(
  text: string,
  box: Pick<FieldBox, 'w' | 'h' | 'size'>,
  font: PDFFont,
): { lines: string[]; size: number; truncated: boolean } {
  const clean = text.replace(/\s+/g, ' ').trim()
  for (let size = box.size; ; size -= 0.5) {
    const lines = wrap(clean, font, size, box.w)
    const maxLines = Math.max(1, Math.floor(box.h / (size * LINE)))
    if (lines.length <= maxLines) return { lines, size, truncated: false }
    if (size - 0.5 < MIN_SIZE) return { lines: clip(lines, maxLines, font, size, box.w), size, truncated: true }
  }
}

// 한글·숫자의 눈에 보이는 가운데는 글자 크기의 약 0.36 배 높이(Pretendard)다. 여러 줄이면 묶음째 칸 가운데에 둔다.
// 글은 왼쪽 정렬(위아래 인쇄 글자와 줄이 맞는다)이고, '년 월 일' 사이의 월·일만 가운데 정렬이다('월3 일' 이 되지 않게).
function drawFieldText(page: PDFPage, text: string, box: FieldBox, font: PDFFont) {
  const { lines, size } = fitText(text, box, font)
  const center = box.y + box.h / 2
  const centered = box.key === 'month' || box.key === 'day'
  lines.forEach((line, i) => {
    const x = centered ? box.x + (box.w - font.widthOfTextAtSize(line, size)) / 2 : box.x
    const y = center + ((lines.length - 1) / 2 - i) * size * LINE - size * 0.36
    page.drawText(line, { x, y, size, font, color: INK })
  })
}

// 인쇄된 네모(6pt) 안의 체크 표시. 오른쪽 끝은 네모 위로 조금 넘친다.
function drawCheck(page: PDFPage, box: FieldBox) {
  page.drawSvgPath('M 0.8 3.2 L 2.6 5.2 L 6.8 -0.8', {
    x: box.x,
    y: box.y + box.h,
    borderColor: INK,
    borderWidth: SIG_STROKE,
    borderLineCap: LineCapStyle.Round,
  })
}

// 사인 캔버스(600×200, 위가 0)를 칸에 비율 맞춰 가운데 둔다. SVG 경로는 위가 0 이라 그대로 쓰고, 선 두께는 배율로 나눈다.
function drawSignature(page: PDFPage, strokes: Stroke[], box: FieldBox) {
  const scale = Math.min(box.w / SIG_W, box.h / SIG_H)
  const d = strokes.map((s) => s.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')).join(' ')
  page.drawSvgPath(d, {
    x: box.x + (box.w - SIG_W * scale) / 2,
    y: box.y + (box.h + SIG_H * scale) / 2,
    scale,
    borderColor: INK,
    borderWidth: SIG_STROKE / scale,
    borderLineCap: LineCapStyle.Round,
  })
}

/** 기록 페이지의 줄들. 마지막 줄은 앞 장들의 고유값이다(이 페이지는 자기 고유값을 담을 수 없다). */
export function recordRows(input: ConsentPdfInput, docHash: string): { label: string; values: string[] }[] {
  const bundle = bundleOf(input.bundle)
  if (!bundle) throw new Error('모르는 묶음이에요')
  return [
    { label: '묶음', values: [bundle.label] },
    { label: '들어간 장', values: bundle.pages.map((id, i) => `${i + 1}. ${PAGES[id].title}`) },
    { label: '보호자 성함', values: [input.guardian.guardianName] },
    { label: '연락처', values: [input.guardian.phone] },
    { label: '이메일', values: [input.guardian.email] },
    { label: '반려견 이름', values: [input.guardian.petName] },
    { label: '서명 시각', values: [`${input.signedAt} (한국 시각)`] },
    { label: '서명 기기', values: [input.device] },
    { label: '동의서 ID', values: [input.consentId] },
    { label: '신청 ID', values: [input.applyId || '없음'] },
    { label: '동의한 내용', values: input.agreed.length > 0 ? input.agreed : ['없음'] },
    { label: '보호자가 고친 값', values: input.changes.length > 0 ? input.changes : ['없음'] },
    { label: '', values: [`문서 고유값(SHA-256, 이 페이지 앞 장들): ${docHash}`] },
  ]
}

// 출처 문구 'ⓒ 어글리독 All rights reserved'(사용자 결정 2026-11-01). 기록 페이지 맨 아래에만 찍고 사장님 문서 장에는 찍지 않는다.
// Pretendard 에 'ⓒ'(U+24D2) 글자가 없어서 동그라미와 'c' 로 그린다.
function drawCredit(page: PDFPage, font: PDFFont) {
  const size = 8
  const rest = ' 어글리독 All rights reserved'
  const mark = size * 0.9 // 동그라미 지름
  const width = mark + font.widthOfTextAtSize(rest, size)
  const x = (PAGE_SIZE.w - width) / 2
  const y = 40
  const r = mark / 2
  page.drawCircle({ x: x + r, y: y + size * 0.36, size: r, borderColor: GRAY, borderWidth: 0.5 })
  const c = size * 0.7
  page.drawText('c', { x: x + r - font.widthOfTextAtSize('c', c) / 2, y: y + size * 0.36 - c * 0.26, size: c, font, color: GRAY })
  page.drawText(rest, { x: x + mark, y, size, font, color: GRAY })
}

function drawRecordPage(doc: PDFDocument, font: PDFFont, rows: { label: string; values: string[] }[]) {
  const page = doc.addPage([PAGE_SIZE.w, PAGE_SIZE.h])
  const left = 56
  const valueX = 150
  const right = PAGE_SIZE.w - 56
  const size = 9.5
  const pitch = size * 1.5
  let y = PAGE_SIZE.h - 80
  page.drawText('서명 기록', { x: left, y, size: 18, font, color: INK })
  y -= 40
  for (const { label, values } of rows) {
    const x = label ? valueX : left
    if (label) page.drawText(label, { x: left, y, size, font, color: GRAY })
    else y -= pitch / 2
    for (const value of values) {
      // 한 값은 최대 넉 줄(서명 기기 글이 아주 길어도 출처 문구를 덮지 않게)
      const lines = wrap(value.replace(/\s+/g, ' ').trim(), font, size, right - x)
      for (const line of lines.length > 4 ? clip(lines, 4, font, size, right - x) : lines) {
        page.drawText(line, { x, y, size, font, color: INK })
        y -= pitch
      }
    }
    y -= pitch / 2
  }
  drawCredit(page, font)
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export async function buildConsentPdf(input: ConsentPdfInput): Promise<{ bytes: Uint8Array; docHash: string; fileHash: string }> {
  const bundle = bundleOf(input.bundle)
  if (!bundle) throw new Error('모르는 묶음이에요')
  const strokes = decodeSignature(input.signature)
  if (!strokes) throw new Error('사인이 올바르지 않아요')
  const { date } = parseSignedAt(input.signedAt)
  const values = fieldValues(input)
  const parts = new Set(input.owner.groomingParts)

  const doc = await PDFDocument.create()
  doc.setCreationDate(date)
  doc.setModificationDate(date)
  const font = await embedKoreanFont(doc, 'HHDOCA')
  const sources = {
    agreement: await PDFDocument.load(files().agreement),
    guidelines: await PDFDocument.load(files().guidelines),
  }
  for (const id of bundle.pages) {
    const { source, index } = PAGES[id]
    const [page] = await doc.copyPages(sources[source], [index])
    doc.addPage(page)
    for (const box of LAYOUT[id]) {
      if (box.key === 'signature') drawSignature(page, strokes, box)
      else if (box.key.startsWith('part:')) {
        if (parts.has(box.key.slice('part:'.length))) drawCheck(page, box)
      } else {
        const text = values[box.key]
        if (text) drawFieldText(page, text, box, font)
      }
    }
  }
  const docHash = sha256(await doc.save())

  // 앞 장들의 부분 글꼴은 첫 저장 때 이미 들어갔다. 같은 글꼴에 글자를 더하면 다음 저장 때 부분 글꼴을 새로 만들어 넣고
  // 앞 것은 쓰이지 않은 채 파일에 남으므로, 기록 페이지는 같은 글꼴을 따로 부분 넣기한다.
  const recordFont = await embedKoreanFont(doc, 'HHDOCB')
  drawRecordPage(doc, recordFont, recordRows(input, docHash))
  const bytes = await doc.save()
  return { bytes, docHash, fileHash: sha256(bytes) }
}
