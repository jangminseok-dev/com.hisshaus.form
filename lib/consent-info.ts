// 동의서 서명 첫 단계(보호자 정보)의 정리·검증. 서버 제출(lib/consent-submit.ts)과 서명 화면(components/ConsentFlow.tsx)이
// 같은 규칙을 쓰려고 여기 둔다. 화면의 JS 에 실리므로 서버 전용 모듈(PDF·메일·시트)을 불러오지 않는다.
import { consentInfoGroup } from '../forms/consent'
import { GUARDIAN_TEXT_MAX } from './consent-docs'
import { isObject } from './guards'
import { formatKoreanPhone } from './phone'
import { validateGroup, type FieldError } from './validate'

export type ConsentInfo = { guardianName: string; phone: string; petName: string; breed: string; email: string }

/** 미리 보여 주고 보호자가 고칠 수 있는 칸. 이메일은 미리 보여 주지 않는다. */
export const GUARDIAN_KEYS = ['guardianName', 'phone', 'petName', 'breed'] as const

const MOBILE = /^010-\d{4}-\d{4}$/
// 개행·탭 같은 제어문자. 보호자 칸 값은 메일 제목·첨부 이름·PDF 칸에 들어가므로 받지 않는다.
const CONTROL = /[\u0000-\u001f\u007f]/
const RECHECK: Record<(typeof GUARDIAN_KEYS)[number], string> = {
  guardianName: '보호자 성함을 다시 확인해 주세요',
  phone: '연락처를 다시 확인해 주세요',
  petName: '반려견 이름을 다시 확인해 주세요',
  breed: '견종을 다시 확인해 주세요',
}
// 이메일 주소에 쓰이면 주소가 여럿이 되거나(쉼표·세미콜론·공백·개행) 이름·주소 꼴(꺾쇠·따옴표)로 읽히는 글자
const EMAIL_FORBIDDEN = /[\s,;<>"'\u0000-\u001f\u007f]/

/**
 * 메일 `to` 에 그대로 들어가므로 주소 하나만 받는다(lib/validate.ts 의 공용 규칙은 `@` 만 본다).
 * 금지 글자가 없고, `@` 가 정확히 하나, 그 앞이 비지 않고, 도메인에 점이 있어야 한다.
 */
function isSingleEmail(v: string): boolean {
  const parts = v.split('@')
  return !EMAIL_FORBIDDEN.test(v) && parts.length === 2 && parts[0] !== '' && parts[1].includes('.')
}

/** 보호자 정보 다섯 칸: 글이 아니면 빈칸, 앞뒤 공백을 지우고 연락처는 010-0000-0000 꼴로 바꾼다. */
export function normalizeConsentInfo(raw: unknown): ConsentInfo {
  const r = isObject(raw) ? raw : {}
  const text = (key: keyof ConsentInfo) => {
    const v = r[key]
    return typeof v === 'string' ? v.trim() : ''
  }
  return {
    guardianName: text('guardianName'),
    phone: formatKoreanPhone(text('phone')),
    petName: text('petName'),
    breed: text('breed'),
    email: text('email'),
  }
}

/** 칸마다 오류 하나. 문항 검증(빈칸·모양)이 먼저고, 그 칸에 오류가 없을 때만 제어문자·길이·휴대폰·이메일 꼴을 본다. */
export function validateConsentInfo(info: ConsentInfo, today: string): FieldError[] {
  const errors = validateGroup(consentInfoGroup, info, today)
  const add = (questionId: string, message: string) => {
    if (!errors.some((e) => e.questionId === questionId)) errors.push({ questionId, message })
  }
  for (const key of GUARDIAN_KEYS) {
    if (CONTROL.test(info[key])) add(key, RECHECK[key])
    if (info[key].length > GUARDIAN_TEXT_MAX) add(key, `${GUARDIAN_TEXT_MAX}자까지 적을 수 있어요`)
  }
  if (!MOBILE.test(info.phone)) add('phone', '휴대폰 번호(010)로 적어 주세요')
  if (!isSingleEmail(info.email)) add('email', '이메일을 다시 확인해 주세요')
  return errors
}
