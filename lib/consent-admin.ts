import { agreedSentences, bundleOf, GROOMING_PARTS, GUARDIAN_TEXT_MAX, OWNER_TEXT_MAX } from './consent-docs'
import { buildConsentPdf } from './consent-pdf'
import {
  cancelRow,
  type GuardianInfo,
  loadConsents as storeLoadConsents,
  loadSignature as storeLoadSignature,
  mailRow,
  parseConsents,
  type Prepared,
  preparedRow,
} from './consent-store'
import { deliverConsentMails } from './consent-submit'
import { consentUrl, newConsentId } from './consent-link'
import { nowKst } from './format'
import type { sendMail as defaultSendMail } from './mail'
import { appendRow as sheetAppend, readRange as sheetRead } from './sheets'

// 사장님이 동의서를 만들고 취소하고 메일을 다시 보내는 규칙. 시트에는 준비·취소·메일 줄을 덧붙이기만 한다.

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
    else if (v.length > OWNER_TEXT_MAX[key]) errors[key] = `${OWNER_TEXT_MAX[key]}자 이내로 적어 주세요`
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
      if (input.shown[key].trim().length > GUARDIAN_TEXT_MAX) errors[key] = `${GUARDIAN_TEXT_MAX}자 이내로 적어 주세요`
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
  // 링크를 먼저 만든다: 만들 수 없는데(비밀값 없음 등) 준비 줄만 남는 일이 없게.
  const url = consentUrl(id)
  await (deps.appendRow ?? sheetAppend)('동의서', preparedRow(prepared))
  return { id, url }
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

interface ResendDeps {
  loadConsents?: typeof storeLoadConsents
  loadSignature?: typeof storeLoadSignature
  buildPdf?: typeof buildConsentPdf
  sendMail?: typeof defaultSendMail
  appendRow?: typeof sheetAppend
  now?: () => string
}

/**
 * 서명된 동의서의 PDF 를 시트 기록으로 다시 만들어 실패한 통만 다시 보내고(메일 줄이 없으면 두 통), 합친 결과로 '메일' 줄을 붙인다.
 * 두 통 다 이미 보냈으면 아무것도 하지 않고 'already-sent'(다른 화면에서 먼저 다시 보낸 경우).
 * 입력은 제출 때와 같다(묶음·사장님 칸·신청 ID 는 기록, 보호자 값·서명 시각·기기·고친 값은 서명 줄, 사인은 T칸).
 * 그래서 서명 내용 고유값이 시트에 남은 값과 같다. 기록·사인 읽기 실패는 `Error('sheets')` 로, PDF 실패는 `Error('pdf')` 로 던진다.
 */
export async function resendConsentMail(
  id: string,
  deps: ResendDeps = {},
): Promise<{ archive: boolean; guardian: boolean } | 'not-signed' | 'already-sent'> {
  const record = (await (deps.loadConsents ?? storeLoadConsents)()).get(id)
  if (!record?.signed) return 'not-signed'
  // 메일 줄이 없으면 보냈는지 모르니 두 통 다, 있으면 실패한 통만 보낸다.
  const already = record.mail ?? { archive: false, guardian: false }
  if (already.archive && already.guardian) return 'already-sent'
  const { prepared, signed } = record
  const signature = await (deps.loadSignature ?? storeLoadSignature)(signed.row)
  const bundle = bundleOf(prepared.bundle)!
  let pdf: Awaited<ReturnType<typeof buildConsentPdf>>
  try {
    pdf = await (deps.buildPdf ?? buildConsentPdf)({
      bundle: bundle.id,
      consentId: id,
      applyId: prepared.applyId,
      guardian: signed.guardian,
      owner: {
        programName: prepared.programName,
        goal: prepared.goal,
        classTime: prepared.classTime,
        groomingParts: prepared.groomingParts,
      },
      signature,
      signedAt: signed.signedAt,
      device: signed.device,
      agreed: agreedSentences(bundle.id),
      changes: signed.changes,
    })
  } catch {
    // 오류 객체에는 배포 경로 등이 들어 있을 수 있어서 버리고, 무엇이 실패했는지만 남긴다.
    console.error('PDF 만들기 실패', id)
    throw new Error('pdf')
  }

  // 제출과 같은 메일(제목·첨부 이름)을 같은 방식(통마다 따로, 실패마다 로그)으로 보낸다. 이미 보낸 통은 보낸 것으로 합친다.
  const mail = await deliverConsentMails(
    {
      bundleLabel: bundle.label,
      guardianName: signed.guardian.guardianName,
      petName: signed.guardian.petName,
      email: signed.guardian.email,
      signedAt: signed.signedAt,
      pdf: pdf.bytes,
    },
    id,
    deps.sendMail,
    already,
  )
  try {
    await (deps.appendRow ?? sheetAppend)('동의서', mailRow(id, (deps.now ?? nowKst)(), mail))
  } catch {
    // 메일 줄을 못 붙여도 결과는 사장님 화면에 바로 보인다. 목록에는 다시 보내기가 남아 있다.
  }
  return mail
}
