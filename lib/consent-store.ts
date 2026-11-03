// 시트 '동의서' 탭: 덧붙이기만 하는 기록. 준비·취소·서명·메일 줄이 쌓이고, 읽을 때 동의서 ID 마다 한 기록으로 합친다.
import { type BundleId, bundleOf } from './consent-docs'
import { readRange, type SheetsDeps } from './sheets'

// 열 순서는 고정이다. 사인(T)은 길어서 맨 끝에 두고, 목록은 A:S 만 읽는다.
export const CONSENT_HEADER = [
  '기록 시각',
  '종류',
  '동의서 ID',
  '신청 ID',
  '묶음',
  '프로그램 명',
  '수업 목표',
  '수업 시간',
  '미용 부위',
  '보호자 성함',
  '연락처',
  '반려견 이름',
  '견종',
  '이메일',
  '보호자가 고친 값',
  '서명 기기',
  '메일 결과',
  '서명 내용 고유값',
  'PDF 고유값',
  '사인',
]

export type ConsentKind = '준비' | '취소' | '서명' | '메일'

export interface GuardianInfo {
  guardianName: string
  phone: string
  petName: string
  breed: string
}

export interface Prepared {
  id: string
  applyId: string
  bundle: BundleId
  programName: string
  goal: string
  classTime: string
  groomingParts: string[]
  /** 보호자에게 미리 채워 보여 줄 값. 신청서 없이 만들면 null. */
  shown: GuardianInfo | null
  createdAt: string
}

export interface Signed {
  /** 서명 줄의 기록 시각(A열). PDF 를 만들 때 쓴 signedAt 과 같은 값이다. */
  signedAt: string
  guardian: GuardianInfo & { email: string }
  changes: string[]
  device: string
  docHash: string
  fileHash: string
  /** 시트 줄 번호(1부터). 사인 칸(T)을 따로 읽을 때 쓴다. */
  row: number
}

export interface ConsentRecord {
  prepared: Prepared
  cancelled: boolean
  signed: Signed | null
  mail: { archive: boolean; guardian: boolean } | null
}

// 열 번호
const C = {
  at: 0,
  kind: 1,
  id: 2,
  applyId: 3,
  bundle: 4,
  programName: 5,
  goal: 6,
  classTime: 7,
  parts: 8,
  guardianName: 9,
  phone: 10,
  petName: 11,
  breed: 12,
  email: 13,
  changes: 14,
  device: 15,
  mail: 16,
  docHash: 17,
  fileHash: 18,
  signature: 19,
}

function blank(kind: ConsentKind, at: string, id: string): string[] {
  const row = Array<string>(CONSENT_HEADER.length).fill('')
  row[C.at] = at
  row[C.kind] = kind
  row[C.id] = id
  return row
}

/** 준비·서명 줄이 함께 적는 묶음 칸. 묶음은 label 이 아니라 BundleId 로 적어 읽을 때 정확히 되돌린다. */
function fillPrepared(row: string[], p: Prepared) {
  row[C.applyId] = p.applyId
  row[C.bundle] = p.bundle
  row[C.programName] = p.programName
  row[C.goal] = p.goal
  row[C.classTime] = p.classTime
  row[C.parts] = p.groomingParts.join(', ')
}

export function preparedRow(p: Prepared): string[] {
  const row = blank('준비', p.createdAt, p.id)
  fillPrepared(row, p)
  if (p.shown) {
    row[C.guardianName] = p.shown.guardianName
    row[C.phone] = p.shown.phone
    row[C.petName] = p.shown.petName
    row[C.breed] = p.shown.breed
  }
  return row
}

export function cancelRow(id: string, at: string): string[] {
  return blank('취소', at, id)
}

/** 서명 줄은 PDF 를 다시 만들 수 있게 준비 기록의 값을 되풀이해 적는다. A열은 PDF 에 찍은 signedAt 그대로다. */
export function signedRow(p: Prepared, s: Omit<Signed, 'row'>, signature: string): string[] {
  const row = blank('서명', s.signedAt, p.id)
  fillPrepared(row, p)
  row[C.guardianName] = s.guardian.guardianName
  row[C.phone] = s.guardian.phone
  row[C.petName] = s.guardian.petName
  row[C.breed] = s.guardian.breed
  row[C.email] = s.guardian.email
  row[C.changes] = s.changes.join('\n')
  row[C.device] = s.device
  row[C.docHash] = s.docHash
  row[C.fileHash] = s.fileHash
  row[C.signature] = signature
  return row
}

const sent = (ok: boolean) => (ok ? '보냄' : '실패')

export function mailRow(id: string, at: string, r: { archive: boolean; guardian: boolean }): string[] {
  const row = blank('메일', at, id)
  row[C.mail] = `보관 ${sent(r.archive)} · 사본 ${sent(r.guardian)}`
  return row
}

function parseMail(text: string): { archive: boolean; guardian: boolean } {
  const m = /^보관 (보냄|실패) · 사본 (보냄|실패)$/.exec(text)
  return { archive: m?.[1] === '보냄', guardian: m?.[2] === '보냄' }
}

/**
 * 줄들을 동의서 ID 마다 한 기록으로 합친다. 준비 줄이 있는 ID 만 기록이 되고(없는 ID 의 줄은 버린다),
 * 같은 ID 는 나중 줄이 이긴다. 머리글·모르는 종류의 줄은 건너뛴다. `rows` 의 index + 1 이 시트 줄 번호다.
 */
export function parseConsents(rows: string[][]): Map<string, ConsentRecord> {
  const out = new Map<string, ConsentRecord>()
  rows.forEach((raw, index) => {
    const r = Array.from({ length: CONSENT_HEADER.length }, (_, i) => raw[i] ?? '')
    const id = r[C.id]
    if (r[C.kind] === '준비') {
      const bundle = bundleOf(r[C.bundle])
      if (!bundle) return
      const guardian = [r[C.guardianName], r[C.phone], r[C.petName], r[C.breed]]
      out.set(id, {
        prepared: {
          id,
          applyId: r[C.applyId],
          bundle: bundle.id,
          programName: r[C.programName],
          goal: r[C.goal],
          classTime: r[C.classTime],
          groomingParts: r[C.parts] ? r[C.parts].split(', ') : [],
          shown: guardian.every((v) => v === '')
            ? null
            : { guardianName: r[C.guardianName], phone: r[C.phone], petName: r[C.petName], breed: r[C.breed] },
          createdAt: r[C.at],
        },
        cancelled: false,
        signed: null,
        mail: null,
      })
      return
    }
    const rec = out.get(id)
    if (!rec) return
    if (r[C.kind] === '취소') rec.cancelled = true
    else if (r[C.kind] === '서명')
      rec.signed = {
        signedAt: r[C.at],
        guardian: {
          guardianName: r[C.guardianName],
          phone: r[C.phone],
          petName: r[C.petName],
          breed: r[C.breed],
          email: r[C.email],
        },
        changes: r[C.changes] ? r[C.changes].split('\n') : [],
        device: r[C.device],
        docHash: r[C.docHash],
        fileHash: r[C.fileHash],
        row: index + 1,
      }
    else if (r[C.kind] === '메일') rec.mail = parseMail(r[C.mail])
  })
  return out
}

export async function loadConsents(deps: SheetsDeps = {}): Promise<Map<string, ConsentRecord>> {
  return parseConsents(await readRange("'동의서'!A:S", deps))
}

/** 서명 줄의 사인 칸(T) 하나. 메일을 다시 보낼 때만 읽는다. */
export async function loadSignature(row: number, deps: SheetsDeps = {}): Promise<string> {
  const values = await readRange(`'동의서'!T${row}`, deps)
  return values[0]?.[0] ?? ''
}
