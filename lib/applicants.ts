import { applyForm } from '../forms/apply'
import { allQuestions } from '../forms/rules'
import { isSubmissionId } from './id'
import { readRange, type SheetsDeps } from './sheets'
import { sheetHeader } from './sheet-row'

// 사장님 화면에서 동의서를 만들 신청을 고르려고 시트 '예약신청' 탭을 읽는다. 열 위치는 헤더(문항 정의)에서 찾는다.

export interface Applicant {
  applyId: string
  receivedAt: string
  guardianName: string
  phone: string
  petName: string
  breed: string
}

const header = sheetHeader(applyForm)
const col = (label: string) => header.indexOf(label)

function columnOf(id: string): number {
  const label = allQuestions(applyForm).find((q) => q.id === id)?.label
  const i = label === undefined ? -1 : col(label)
  if (i < 0) throw new Error(`신청서 문항이 없다: ${id}`)
  return i
}

const COLS = {
  guardianName: columnOf('guardian_name'),
  phone: columnOf('guardian_phone'),
  petName: columnOf('pet_name'),
  breed: columnOf('pet_breed'),
}
const LAST = Math.max(1, ...Object.values(COLS))

/** 0부터 센 열 번호 → A1 열 글자(0 → A, 26 → AA). */
function letters(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** 최신이 먼저. 신청 ID 칸이 ID 모양이 아닌 줄(머리글·빈 줄)은 건너뛴다. */
export function parseApplicants(rows: string[][]): Applicant[] {
  const out: Applicant[] = []
  for (const r of rows) {
    if (!isSubmissionId(r[1])) continue
    out.push({
      applyId: r[1],
      receivedAt: r[0] ?? '',
      guardianName: r[COLS.guardianName] ?? '',
      phone: r[COLS.phone] ?? '',
      petName: r[COLS.petName] ?? '',
      breed: r[COLS.breed] ?? '',
    })
  }
  return out.reverse()
}

/** 실패하면 `Error('sheets')` 를 던진다. */
export async function loadApplicants(deps: SheetsDeps = {}): Promise<Applicant[]> {
  return parseApplicants(await readRange(`'예약신청'!A:${letters(LAST)}`, deps))
}
