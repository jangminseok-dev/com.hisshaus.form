// 보호자의 동의서 서명 제출(서버). 이 기록이 증거라서 순서와 로그를 지킨다.
// 순서: 허니팟 → 링크 → 기록 읽기 → 취소·모름·이미 서명 → 검증 → 고친 값 → PDF → 시트(서명 줄) → 메일 두 통 → 시트(메일 줄) → 슬랙.
// 서명 줄이 남은 뒤의 실패(메일·메일 줄·슬랙)는 성공으로 답한다. 기록이 시트에 있고 사장님 화면에서 메일을 다시 보낼 수 있다.
// 로그에는 "무엇이 실패했나 + 동의서 ID" 만 남긴다. 오류 객체·요청 본문·보호자 값·주소는 찍지 않는다.
import { consentInfoGroup } from '../forms/consent'
import { mailAddress } from './config'
import { agreedSentences, bundleOf, consentFilename, type PageId } from './consent-docs'
import { GUARDIAN_KEYS, normalizeConsentInfo, validateConsentInfo, type ConsentInfo } from './consent-info'
import { consentIdOf } from './consent-link'
import { buildConsentPdf } from './consent-pdf'
import { loadConsents as defaultLoadConsents, mailRow, signedRow, type ConsentRecord, type GuardianInfo } from './consent-store'
import { nowKst, todayKst } from './format'
import { isObject } from './guards'
import { sendMail as defaultSendMail, type Mail } from './mail'
import { formatKoreanPhone } from './phone'
import { appendRow as defaultAppendRow } from './sheets'
import { decodeSignature } from './signature'
import { sendSlack as defaultSendSlack } from './slack'
import { consentMessages } from './slack-blocks'
import type { FieldError } from './validate'

export type ConsentResult =
  | { status: 'ok'; pdf?: string; mailed: boolean } // pdf 는 base64. 이미 서명된 재시도면 pdf 없음
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'closed' } // 모르는 ID·취소됨
  | { status: 'failed' }

export interface ConsentDeps {
  loadConsents?: typeof defaultLoadConsents
  appendRow?: typeof defaultAppendRow
  sendMail?: typeof defaultSendMail
  sendSlack?: typeof defaultSendSlack
  buildPdf?: typeof buildConsentPdf
  /** 기록 시각 `YYYY-MM-DD HH:mm:ss` (KST). 기본은 지금. */
  now?: () => string
  /** 오늘 `YYYY-MM-DD` (KST). 기본은 오늘. */
  today?: () => string
  /** 링크 비밀값. 기본은 환경 변수(테스트만 넘긴다). */
  secret?: string
}

/** 서명 기기(User-Agent)는 이 길이에서 자른다(통제자 결정 R10: 시트 칸·기록 페이지를 지나치게 키우지 않게). */
const DEVICE_MAX = 300

const labelOf = (id: string) => consentInfoGroup.questions.find((q) => q.id === id)!.label

/** 칸마다 오류 하나. 보호자 정보(서명 화면과 같은 규칙) 다음에 동의·전자 서명 동의·사인을 본다. */
function validate(info: ConsentInfo, body: Record<string, unknown>, pages: PageId[], today: string): FieldError[] {
  const errors = validateConsentInfo(info, today)
  const add = (questionId: string, message: string) => {
    if (!errors.some((e) => e.questionId === questionId)) errors.push({ questionId, message })
  }
  // 묶음의 장과 정확히 같은 집합이어야 한다(빠뜨림·더함·겹침 모두 거부). 순서는 보지 않는다.
  const agreed = body.agreed
  const allPages =
    Array.isArray(agreed) &&
    agreed.length === pages.length &&
    new Set(agreed).size === pages.length &&
    pages.every((p) => agreed.includes(p))
  if (!allPages) add('agreed', '모든 문서에 동의해 주세요')
  if (body.esign !== true) add('esign', '전자 방식 서명에 동의해 주세요')
  if (!decodeSignature(body.signature)) add('signature', '사인해 주세요')
  return errors
}

/** 미리 보여 준 값과 달라진 칸만 '견종 말티 → 말티즈' 꼴로. 미리 보여 준 값도 같은 규칙(공백·연락처 꼴)으로 맞춰 견준다. */
function changesOf(shown: GuardianInfo | null, info: ConsentInfo): string[] {
  if (!shown) return []
  return GUARDIAN_KEYS.flatMap((key) => {
    const before = key === 'phone' ? formatKoreanPhone(shown[key].trim()) : shown[key].trim()
    return before === info[key] ? [] : [`${labelOf(key)} ${before} → ${info[key]}`]
  })
}

/**
 * [보관용, 보호자 사본]. 메일 다시 보내기도 이것을 써서 제목·첨부 이름이 제출 때와 같다.
 * 첨부 이름은 완료 화면의 내려받기와 같은 꼴이다(consentFilename). 제목은 제출 검증이 제어문자를 막는다.
 */
export function consentMails(r: {
  bundleLabel: string
  guardianName: string
  petName: string
  email: string
  signedAt: string
  pdf: Uint8Array
}): [Mail, Mail] {
  const date = r.signedAt.slice(0, 10)
  const attachment = { filename: consentFilename(r.bundleLabel, r.petName, date), content: r.pdf }
  return [
    {
      to: mailAddress(),
      subject: `[동의서] ${r.guardianName} · ${r.petName} · ${r.bundleLabel} · ${date}`,
      text: '서명된 동의서를 첨부해요.',
      attachment,
    },
    {
      to: r.email,
      subject: `히스하우스 동의서 사본이에요 (${r.bundleLabel})`,
      text: '서명해 주셔서 고마워요. 서명한 동의서를 첨부해 드려요. 궁금한 점은 카카오톡 채널로 알려 주세요.',
      attachment,
    },
  ]
}

/**
 * 보관용·보호자 사본 두 통을 따로 보낸다: 한 통이 실패해도 다른 통은 간다. 메일 꼴 만들기(보관 주소 설정 읽기)가 실패해도
 * 그 통의 실패로 친다. 실패마다 '메일 전송 실패' 와 동의서 ID 만 남긴다. 메일 다시 보내기도 이것을 쓴다:
 * `already` 에 이미 보낸 통을 넘기면 그 통은 보내지 않고 보냄(true)으로 친다(돌려주는 값이 곧 합친 결과다).
 */
export async function deliverConsentMails(
  input: Parameters<typeof consentMails>[0],
  id: string,
  sendMail: typeof defaultSendMail = defaultSendMail,
  already: { archive: boolean; guardian: boolean } = { archive: false, guardian: false },
): Promise<{ archive: boolean; guardian: boolean }> {
  const deliver = async (pick: (mails: [Mail, Mail]) => Mail): Promise<boolean> => {
    try {
      await sendMail(pick(consentMails(input)))
      return true
    } catch {
      console.error('메일 전송 실패', id)
      return false
    }
  }
  return {
    archive: already.archive || (await deliver(([archive]) => archive)),
    guardian: already.guardian || (await deliver(([, copy]) => copy)),
  }
}

/** 본문: `{ token, info: { guardianName, phone, petName, breed, email }, agreed: PageId[], esign: true, signature, website? }`. */
export async function submitConsent(body: unknown, userAgent: string, deps: ConsentDeps = {}): Promise<ConsentResult> {
  if (!isObject(body)) return { status: 'invalid', errors: [] }
  // 허니팟: 사람 눈에 안 보이는 칸이다. 값이 있으면 봇이니 아무것도 읽지도 쓰지도 않고 성공한 척 끝낸다.
  if (body.website) return { status: 'ok', mailed: false }
  // 동의서 ID 는 링크(token)에서만 꺼낸다.
  const id = consentIdOf(body.token, deps.secret)
  if (id === null) return { status: 'closed' }

  let record: ConsentRecord | undefined
  try {
    record = (await (deps.loadConsents ?? defaultLoadConsents)()).get(id)
  } catch {
    // 읽기 실패도 시트 실패다(검사지와 같다).
    console.error('시트 저장 실패', id)
    return { status: 'failed' }
  }
  if (!record || record.cancelled) return { status: 'closed' }
  // 이미 서명됐으면 대개 응답을 못 받은 재시도다. 쓰지도 보내지도 않고 성공으로 답한다(기록·메일은 한 번).
  if (record.signed) return { status: 'ok', mailed: false }

  const { prepared } = record
  const bundle = bundleOf(prepared.bundle)!
  const info = normalizeConsentInfo(body.info)
  const errors = validate(info, body, bundle.pages, (deps.today ?? todayKst)())
  if (errors.length > 0) return { status: 'invalid', errors }

  const now = deps.now ?? nowKst
  const signature = body.signature as string // 검증에서 decodeSignature 를 통과했다
  const changes = changesOf(prepared.shown, info)
  const device = userAgent.slice(0, DEVICE_MAX)
  // 서명 시각은 한 번만 정한다: PDF 에 찍는 값과 서명 줄 A열이 같아야 서명 내용 고유값을 다시 계산할 수 있다.
  const signedAt = now()
  let pdf: Awaited<ReturnType<typeof buildConsentPdf>>
  try {
    pdf = await (deps.buildPdf ?? buildConsentPdf)({
      bundle: bundle.id,
      consentId: id,
      applyId: prepared.applyId,
      guardian: info,
      owner: {
        programName: prepared.programName,
        goal: prepared.goal,
        classTime: prepared.classTime,
        groomingParts: prepared.groomingParts,
      },
      signature,
      signedAt,
      device,
      agreed: agreedSentences(bundle.id),
      changes,
    })
  } catch {
    // 배포 묶음에 원본 PDF·글꼴이 빠진 경우 등. 아무것도 남기지 않았으니 실패로 답하고 보호자가 다시 누른다.
    console.error('PDF 만들기 실패', id)
    return { status: 'failed' }
  }

  const appendRow = deps.appendRow ?? defaultAppendRow
  try {
    const signed = { signedAt, guardian: info, changes, device, docHash: pdf.docHash, fileHash: pdf.fileHash }
    await appendRow('동의서', signedRow(prepared, signed, signature))
  } catch {
    console.error('시트 저장 실패', id)
    return { status: 'failed' }
  }

  const mail = await deliverConsentMails(
    {
      bundleLabel: bundle.label,
      guardianName: info.guardianName,
      petName: info.petName,
      email: info.email,
      signedAt,
      pdf: pdf.bytes,
    },
    id,
    deps.sendMail,
  )

  try {
    await appendRow('동의서', mailRow(id, now(), mail))
  } catch {
    // 로그를 남기지 않는다: '시트 저장 실패' 로 찍으면 서명 줄이 안 남은 것과 구별되지 않는다. 메일 결과는 아래 슬랙에 실린다.
  }

  const sendSlack = deps.sendSlack ?? defaultSendSlack
  try {
    await sendSlack(
      consentMessages({
        bundleLabel: bundle.label,
        guardianName: info.guardianName,
        petName: info.petName,
        changes,
        mail,
        consentId: id,
        applyId: prepared.applyId,
      }),
    )
  } catch {
    // 기록은 시트에 남았다. 사장님은 시트·사장님 화면에서 보면 되니 보호자에게는 성공으로 답한다.
    console.error('슬랙 전송 실패', id)
  }
  return { status: 'ok', pdf: Buffer.from(pdf.bytes).toString('base64'), mailed: mail.guardian }
}
