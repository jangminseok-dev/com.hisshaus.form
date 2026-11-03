import { bundleOf, GROOMING_PARTS } from './consent-docs'
import { cancelRow, type GuardianInfo, parseConsents, type Prepared, preparedRow } from './consent-store'
import { consentUrl, newConsentId } from './consent-link'
import { nowKst } from './format'
import { appendRow as sheetAppend, readRange as sheetRead } from './sheets'

// 사장님이 동의서를 만들고 취소하는 규칙. 시트에는 준비·취소 줄을 덧붙이기만 한다.

export interface CreateInput {
  applyId: string
  bundle: string
  programName: string
  goal: string
  classTime: string
  groomingParts: string[]
  /** 보호자에게 미리 채워 보여 줄 값(사장님이 고친 값). 없으면 null. */
  shown: GuardianInfo | null
}

/** 칸마다 글자 수 상한: PDF 칸에 들어갈 만큼만. */
export const MAX = { programName: 30, goal: 60, classTime: 30, guardian: 50 } as const

const GUARDIAN_LABEL: Record<keyof GuardianInfo, string> = {
  guardianName: '성함',
  phone: '연락처',
  petName: '반려견 이름',
  breed: '견종',
}

export function validateCreate(input: CreateInput): Record<string, string> {
  const bundle = bundleOf(input.bundle)
  if (!bundle) return { bundle: '문서 묶음을 골라 주세요' }
  const errors: Record<string, string> = {}
  const text = (key: 'programName' | 'goal' | 'classTime') => {
    if (!bundle.ownerFields.includes(key)) return
    const v = input[key].trim()
    if (!v) errors[key] = '적어 주세요'
    else if (v.length > MAX[key]) errors[key] = `${MAX[key]}자 이내로 적어 주세요`
  }
  text('programName')
  text('goal')
  text('classTime')
  if (bundle.ownerFields.includes('groomingParts')) {
    const parts = input.groomingParts
    if (parts.length === 0 || !parts.every((p) => GROOMING_PARTS.includes(p))) {
      errors.groomingParts = '미용할 부위를 하나 이상 골라 주세요'
    }
  }
  if (input.shown) {
    for (const key of Object.keys(GUARDIAN_LABEL) as (keyof GuardianInfo)[]) {
      if (input.shown[key].trim().length > MAX.guardian) errors[key] = `${MAX.guardian}자 이내로 적어 주세요`
    }
  }
  return errors
}

interface Deps {
  /** 정해 주면 이 ID 로 만든다(실패 로그에 같은 ID 를 남기려고 부르는 쪽이 먼저 뽑는다). */
  id?: string
  appendRow?: typeof sheetAppend
  now?: () => string
}

/** 준비 줄을 붙이고 링크를 돌려준다. 시트 실패는 `Error('sheets')` 로 던진다. */
export async function createConsent(
  input: CreateInput,
  deps: Deps = {},
): Promise<{ id: string; url: string } | { errors: Record<string, string> }> {
  const errors = validateCreate(input)
  if (Object.keys(errors).length > 0) return { errors }
  const bundle = bundleOf(input.bundle)!
  const has = (f: (typeof bundle.ownerFields)[number]) => bundle.ownerFields.includes(f)
  const g = input.shown
  const shown =
    g && Object.values(g).some((v) => v.trim() !== '')
      ? {
          guardianName: g.guardianName.trim(),
          phone: g.phone.trim(),
          petName: g.petName.trim(),
          breed: g.breed.trim(),
        }
      : null
  const id = deps.id ?? newConsentId()
  const prepared: Prepared = {
    id,
    applyId: input.applyId,
    bundle: bundle.id,
    programName: has('programName') ? input.programName.trim() : '',
    goal: has('goal') ? input.goal.trim() : '',
    classTime: has('classTime') ? input.classTime.trim() : '',
    groomingParts: has('groomingParts') ? GROOMING_PARTS.filter((p) => input.groomingParts.includes(p)) : [],
    shown,
    createdAt: (deps.now ?? nowKst)(),
  }
  await (deps.appendRow ?? sheetAppend)('동의서', preparedRow(prepared))
  return { id, url: consentUrl(id) }
}

/** 서명 전의 동의서에 취소 줄을 붙인다. 이미 취소했으면 줄을 또 붙이지 않는다. */
export async function cancelConsent(
  id: string,
  deps: Deps & { readRange?: typeof sheetRead } = {},
): Promise<'ok' | 'not-found' | 'signed'> {
  const rows = await (deps.readRange ?? sheetRead)("'동의서'!A:S")
  const record = parseConsents(rows).get(id)
  if (!record) return 'not-found'
  if (record.signed) return 'signed'
  if (record.cancelled) return 'ok'
  await (deps.appendRow ?? sheetAppend)('동의서', cancelRow(id, (deps.now ?? nowKst)()))
  return 'ok'
}
