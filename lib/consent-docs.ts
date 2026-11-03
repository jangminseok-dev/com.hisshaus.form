// 동의서 문서 정의: 묶음(사장님이 고르는 것)·장(원본 PDF 의 한 쪽)·칸 좌표와 칸에 들어갈 값.
// PDF 만들기(lib/consent-pdf.ts)와 보호자 화면이 모두 이것을 읽는다. 칸 좌표가 단일 출처다.
// 보호자 화면의 JS 에 실리므로 서버 전용 모듈을 불러오지 않는다.
import { BASE_PATH } from './base-path'
import { formatKoreanPhone } from './phone'

export type PageId =
  | 'agreement'
  | 'behavior'
  | 'trust'
  | 'groomingTraining'
  | 'unfinishedGrooming'
  | 'generalGrooming'
  | 'guidelines'

export type BundleId = 'behavior' | 'trust' | 'groomingTraining' | 'unfinishedGrooming' | 'generalGrooming'

// 사장님이 링크를 만들 때 채우는 칸
export type OwnerField = 'programName' | 'goal' | 'classTime' | 'groomingParts'

export interface Bundle {
  id: BundleId
  label: string
  pages: PageId[]
  ownerFields: OwnerField[]
}

// 사장님 결정(2026-11-03): 고른 묶음의 장이 이 순서로 간다. 안내사항은 끝이다.
export const BUNDLES: Bundle[] = [
  { id: 'behavior', label: '행동수정 트레이닝', pages: ['agreement', 'behavior', 'guidelines'], ownerFields: ['programName', 'goal'] },
  { id: 'trust', label: '신뢰쌓기', pages: ['agreement', 'trust', 'guidelines'], ownerFields: ['classTime'] },
  { id: 'groomingTraining', label: '그루밍 트레이닝', pages: ['agreement', 'groomingTraining', 'guidelines'], ownerFields: [] },
  { id: 'unfinishedGrooming', label: '교육 중단 미용 동의서', pages: ['unfinishedGrooming'], ownerFields: ['groomingParts'] },
  { id: 'generalGrooming', label: '일반 미용', pages: ['generalGrooming'], ownerFields: ['groomingParts'] },
]

export function bundleOf(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id)
}

export interface DocPage {
  id: PageId
  title: string
  source: 'agreement' | 'guidelines' // content/consent-agreement.pdf · content/consent-guidelines.pdf
  index: number // 그 PDF 안의 0부터 센 쪽 번호
  signed: boolean
  agreeLabel: '읽고 동의해요' | '확인했어요'
  image: string
}

// 장 그림은 scripts/consent-pages.mjs 가 원본에서 만든다. 그림을 바꾸면 v2 로 이름을 바꾼다(카톡·브라우저가 주소별로 저장).
function page(id: PageId, title: string, source: DocPage['source'], index: number): DocPage {
  const signed = source === 'agreement'
  return {
    id,
    title,
    source,
    index,
    signed,
    agreeLabel: signed ? '읽고 동의해요' : '확인했어요',
    image: `${BASE_PATH}/consent-v1-${id}.png`,
  }
}

// 제목은 PDF 에 인쇄된 그대로다.
export const PAGES: Record<PageId, DocPage> = {
  agreement: page('agreement', '반려견 교육 서약서', 'agreement', 0),
  behavior: page('behavior', '히스하우스 행동수정 프로그램 계약서', 'agreement', 1),
  trust: page('trust', '신뢰쌓기 프로그램 계약서', 'agreement', 2),
  groomingTraining: page('groomingTraining', '히스하우스 그루밍 트레이닝 프로그램 계약서', 'agreement', 3),
  unfinishedGrooming: page('unfinishedGrooming', '교육을 마치지 않은 상태의 반려견의 미용 동의서', 'agreement', 4),
  generalGrooming: page('generalGrooming', '교육을 하지 않은 상태의 반려견의 미용 동의서', 'agreement', 5),
  guidelines: page('guidelines', '교육미용 안내사항', 'guidelines', 0),
}

/** 서명 화면의 전자 서명 동의 체크 문구. 기록 페이지의 동의 문구 끝에도 그대로 찍힌다. */
export const ESIGN_LABEL = '전자 방식으로 서명하는 데 동의해요'

/**
 * 기록 페이지에 찍는 동의 문구: 묶음의 장마다 '{제목} — {체크 문구}', 끝에 전자 서명 동의(통제자 결정 R1·R8).
 * 제출 검증이 모든 장의 동의를 요구하므로 묶음마다 하나로 정해져 시트에 따로 적지 않는다. 메일 다시 보내기도 이것을 쓴다.
 * 서명 내용 고유값(v1)에 들어가므로 문구 규칙을 바꾸면 옛 서명의 고유값을 다시 계산할 수 없다.
 */
export function agreedSentences(bundle: BundleId): string[] {
  const pages = bundleOf(bundle)!.pages
  return [...pages.map((id) => `${PAGES[id].title} — ${PAGES[id].agreeLabel}`), ESIGN_LABEL]
}

// '금일 진행하는 미용' 15칸, PDF 순서(왼쪽에서 오른쪽, 위에서 아래)
export const GROOMING_PARTS: string[] = [
  '등', '배', '앞다리', '뒷다리',
  '발톱깎기', '발바닥털정리', '항문낭압출', '귀청소',
  '목욕&드라이', '얼굴컷트', '눈앞컷트', '귀바깥털',
  '발등', '생식기털', '항문털',
]

export type FieldKey =
  | 'guardianName'
  | 'phoneMid'
  | 'phoneLast'
  | 'petName'
  | 'breed'
  | 'yearSuffix'
  | 'month'
  | 'day'
  | 'manager'
  | 'signerName'
  | 'signature'
  | 'programName'
  | 'goal'
  | 'classTime'
  | `part:${string}`

// PDF 포인트, 왼쪽 아래가 원점. x·y 는 상자의 왼쪽 아래 모서리. size 는 그 칸에 쓸 기본 글자 크기(pt).
export interface FieldBox {
  key: FieldKey
  x: number
  y: number
  w: number
  h: number
  size: number
}

export const PAGE_SIZE = { w: 595.276, h: 841.89 }

// 미용 부위 네모(□) 15칸: 4열 격자, 마지막 줄은 3칸. 인쇄된 네모 그대로 한 변 6pt.
function partBoxes(cols: number[], rows: number[]): FieldBox[] {
  return GROOMING_PARTS.map((part, i) => ({
    key: `part:${part}` as const,
    x: cols[i % 4],
    y: rows[Math.floor(i / 4)],
    w: 6,
    h: 6,
    size: 9.2,
  }))
}

// 칸 좌표는 원본 PDF(숫자삭제 판)에서 쟀다: 표의 칸선은 288dpi 그림의 선 색 픽셀로, 인쇄된 글자('20'·'년'·'-'·'(인)' 등)는
// pdftotext -bbox 로 찾았다(bbox 는 위가 0 이라 y = 841.89 - yMax). 글자 칸은 칸선 안쪽의 빈 곳이고, 왼쪽 끝은 같은 열에
// 인쇄된 글자의 여백에 맞췄다(값을 왼쪽 정렬로 쓰면 위아래 글자와 줄이 맞는다). 연락처는 '010 - -' 의 두 '-' 사이와 뒤,
// 작성일은 '20 년 월 일' 의 '20' 바로 뒤(두 자리)·'년'과 '월' 사이·'월'과 '일' 사이다. 연락처 칸은 '8888' 이 들어가게 8pt.
// 서명 칸은 '(인)' 바로 오른쪽, 사인 그림(600×200)과 같은 3:1 비율로 90×30pt 다. 행 윗선 바로 아래에서 시작하고
// 아래로는 표 밖으로 넘친다(손 사인처럼 표 선에 걸친다. 행 높이에 맞추면 50×16pt 로 너무 작다). 원본 칸 위치가 바뀌면 다시 잰다.
// tests/consent-docs.test.ts 가 칸을 원본 글자 상자(tests/consent-words.json)와 견준다.
export const LAYOUT: Record<PageId, FieldBox[]> = {
  agreement: [
    { key: 'yearSuffix', x: 139.17, y: 85.67, w: 14.45, h: 15.74, size: 8.5 },
    { key: 'month', x: 162.97, y: 85.67, w: 11.41, h: 15.74, size: 8.5 },
    { key: 'day', x: 183.74, y: 85.67, w: 11.41, h: 15.74, size: 8.5 },
    { key: 'signerName', x: 129.13, y: 67.68, w: 167.01, h: 15.49, size: 8.5 },
    { key: 'signature', x: 405.51, y: 53.67, w: 90, h: 30, size: 8.5 },
  ],
  behavior: [
    { key: 'guardianName', x: 126.53, y: 672.2, w: 169.61, h: 11.25, size: 9 },
    { key: 'phoneMid', x: 409.65, y: 672.2, w: 20, h: 11.25, size: 8 },
    { key: 'phoneLast', x: 434.84, y: 672.2, w: 122.7, h: 11.25, size: 8 },
    { key: 'petName', x: 126.53, y: 659.21, w: 169.61, h: 11.5, size: 9 },
    { key: 'breed', x: 387.93, y: 659.21, w: 169.61, h: 11.5, size: 9 },
    { key: 'programName', x: 143.24, y: 628.72, w: 413.8, h: 11.25, size: 9 },
    { key: 'goal', x: 143.24, y: 589.98, w: 413.8, h: 11.5, size: 9 },
    { key: 'yearSuffix', x: 139.17, y: 84.93, w: 14.45, h: 15.74, size: 8.5 },
    { key: 'month', x: 162.97, y: 84.93, w: 11.41, h: 15.74, size: 8.5 },
    { key: 'day', x: 183.74, y: 84.93, w: 11.41, h: 15.74, size: 8.5 },
    { key: 'manager', x: 390.77, y: 84.93, w: 166.77, h: 15.74, size: 8.5 },
    { key: 'signerName', x: 129.13, y: 66.93, w: 167.01, h: 15.49, size: 8.5 },
    { key: 'signature', x: 405.51, y: 52.92, w: 90, h: 30, size: 8.5 },
  ],
  trust: [
    { key: 'guardianName', x: 126.03, y: 666.46, w: 169.61, h: 11.25, size: 9 },
    { key: 'phoneMid', x: 409.15, y: 666.46, w: 20, h: 11.25, size: 8 },
    { key: 'phoneLast', x: 434.34, y: 666.46, w: 122.7, h: 11.25, size: 8 },
    { key: 'petName', x: 126.03, y: 653.46, w: 169.61, h: 11.5, size: 9 },
    { key: 'breed', x: 387.43, y: 653.46, w: 169.61, h: 11.5, size: 9 },
    { key: 'classTime', x: 146.57, y: 609.48, w: 410.97, h: 27.74, size: 9 },
    { key: 'yearSuffix', x: 138.17, y: 109.92, w: 14.45, h: 15.49, size: 8.5 },
    { key: 'month', x: 161.97, y: 109.92, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'day', x: 182.74, y: 109.92, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'manager', x: 389.77, y: 109.92, w: 166.77, h: 15.49, size: 8.5 },
    { key: 'signerName', x: 128.13, y: 91.67, w: 167.01, h: 15.74, size: 8.5 },
    { key: 'signature', x: 404.51, y: 77.91, w: 90, h: 30, size: 8.5 },
  ],
  groomingTraining: [
    { key: 'guardianName', x: 126.03, y: 664.96, w: 169.61, h: 11.5, size: 9 },
    { key: 'phoneMid', x: 409.15, y: 664.96, w: 20, h: 11.5, size: 8 },
    { key: 'phoneLast', x: 434.34, y: 664.96, w: 122.7, h: 11.5, size: 8 },
    { key: 'petName', x: 126.03, y: 652.21, w: 169.61, h: 11.25, size: 9 },
    { key: 'breed', x: 387.43, y: 652.21, w: 169.61, h: 11.25, size: 9 },
    { key: 'yearSuffix', x: 138.67, y: 94.17, w: 14.45, h: 15.49, size: 8.5 },
    { key: 'month', x: 162.47, y: 94.17, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'day', x: 183.24, y: 94.17, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'signerName', x: 128.63, y: 75.93, w: 167.01, h: 15.74, size: 8.5 },
    { key: 'signature', x: 405.01, y: 62.17, w: 90, h: 30, size: 8.5 },
  ],
  unfinishedGrooming: [
    { key: 'guardianName', x: 126.03, y: 654.71, w: 169.61, h: 11.25, size: 9 },
    { key: 'phoneMid', x: 409.15, y: 654.71, w: 20, h: 11.25, size: 8 },
    { key: 'phoneLast', x: 434.34, y: 654.71, w: 122.7, h: 11.25, size: 8 },
    { key: 'petName', x: 126.03, y: 641.72, w: 169.61, h: 11.5, size: 9 },
    { key: 'breed', x: 387.43, y: 641.72, w: 169.61, h: 11.5, size: 9 },
    { key: 'yearSuffix', x: 138.67, y: 117.66, w: 14.45, h: 15.49, size: 8.5 },
    { key: 'month', x: 162.47, y: 117.66, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'day', x: 183.24, y: 117.66, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'manager', x: 390.27, y: 117.66, w: 166.77, h: 15.49, size: 8.5 },
    { key: 'signerName', x: 128.63, y: 99.42, w: 167.01, h: 15.74, size: 8.5 },
    { key: 'signature', x: 405.01, y: 85.66, w: 90, h: 30, size: 8.5 },
    ...partBoxes([42.37, 172.76, 303.16, 433.55], [455.78, 437.09, 418.39, 399.7]),
  ],
  generalGrooming: [
    { key: 'guardianName', x: 127.03, y: 643.71, w: 169.61, h: 11.25, size: 9 },
    { key: 'phoneMid', x: 410.15, y: 643.71, w: 20, h: 11.25, size: 8 },
    { key: 'phoneLast', x: 435.34, y: 643.71, w: 122.7, h: 11.25, size: 8 },
    { key: 'petName', x: 127.03, y: 630.72, w: 169.61, h: 11.5, size: 9 },
    { key: 'breed', x: 388.43, y: 630.72, w: 169.61, h: 11.5, size: 9 },
    { key: 'yearSuffix', x: 139.67, y: 106.67, w: 14.45, h: 15.49, size: 8.5 },
    { key: 'month', x: 163.47, y: 106.67, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'day', x: 184.24, y: 106.67, w: 11.41, h: 15.49, size: 8.5 },
    { key: 'manager', x: 391.27, y: 106.67, w: 166.77, h: 15.49, size: 8.5 },
    { key: 'signerName', x: 129.63, y: 88.42, w: 167.01, h: 15.74, size: 8.5 },
    { key: 'signature', x: 406.01, y: 74.66, w: 90, h: 30, size: 8.5 },
    ...partBoxes([43.37, 173.76, 304.16, 434.55], [444.68, 425.99, 407.29, 388.6]),
  ],
  guidelines: [],
}

/** 'YYYY-MM-DD HH:mm:ss'(한국 시각)를 나눈다. 꼴이 틀리면 던진다. */
export function parseSignedAt(signedAt: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(signedAt)
  if (!m) throw new Error('서명 시각 꼴이 틀렸어요')
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`)
  if (Number.isNaN(date.getTime())) throw new Error('서명 시각 꼴이 틀렸어요')
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])), date }
}

/**
 * 글자 칸(사인·체크 칸 말고)에 쓸 값. 연락처는 인쇄된 '010 - -' 뒤의 두 칸, 작성일은 서명한 날이다.
 * PDF 와 보호자 화면의 미리보기가 같이 쓴다(화면은 지금 시각을 넘긴다).
 */
export function fieldValues(input: {
  guardian: { guardianName: string; phone: string; petName: string; breed: string }
  owner: { programName: string; goal: string; classTime: string }
  signedAt: string
}): Partial<Record<FieldKey, string>> {
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

// 파일 이름에 쓸 수 없는 글자(윈도우 기준)와 제어문자
const FILENAME_FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/g

/**
 * 서명한 PDF 의 파일 이름(메일 첨부·완료 화면 내려받기). date 는 'YYYY-MM-DD'.
 * 금지 문자·제어문자는 `_` 로 바꾼다(반려견 이름의 '/' 등).
 */
export function consentFilename(bundleLabel: string, petName: string, date: string): string {
  return `히스하우스_동의서_${bundleLabel}_${petName}_${date.replace(/-/g, '')}.pdf`.replace(FILENAME_FORBIDDEN, '_')
}

// 사장님이 적는 글의 글자 수 상한: PDF 칸에 들어갈 만큼만. 화면(maxLength·세는 글자)과 검증이 같이 쓴다.
export const OWNER_TEXT_MAX = { programName: 30, goal: 60, classTime: 30 } as const
/** 보호자 정보 칸(성함·연락처·반려견 이름·견종) 상한 */
export const GUARDIAN_TEXT_MAX = 50
