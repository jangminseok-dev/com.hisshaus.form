import type { Answers } from '../forms/types'
import { isSubmissionId } from './id'

// 보호자가 창을 닫아도 같은 기기에서 이어 쓰게 하는 저장 층이다(브라우저 쪽에서 부른다).
// localStorage 는 못 쓰는 경우가 여럿이다. 서버 렌더링 중에는 없거나 메서드가 없고
// (Node 25 는 전역에 두지만 getItem 이 함수가 아니다), 브라우저가 저장소를 막으면 닿기만 해도
// 던지고, 가득 차면 setItem 이 던진다. `typeof localStorage` 확인으로는 다 걸러지지 않으므로
// 모든 접근을 try/catch 로 감싸 조용히 null/무시한다. 이어 쓰기만 안 될 뿐이다.
// 답변·연락처가 든 값을 다루므로 오류 객체는 어디에도 찍지 않는다.

/** 쓰던 묶음의 위치와 지금까지의 답. 신청서와 검사지가 각각 하나씩 가진다. */
export interface Draft {
  answers: Answers
  groupIndex: number
  submissionId: string
}

/** 신청이 접수된 뒤 검사지 안내·완료 화면이 이어 받는 정보. */
export interface ApplySession {
  submissionId: string
  guardianName: string
  guardianPhone: string
  petName: string
  services: string[]
  wish1: string
  training: boolean
  surveyDone: boolean
}

const SESSION_KEY = 'hh.session'
const draftKey = (formId: 'apply' | 'survey') => `hh.draft.${formId}`

/** 저장된 JSON 을 읽는다. 없거나 깨졌거나 저장소를 못 쓰면 null. */
function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장소가 없거나 막혔거나 가득 찼다. 이어 쓰기만 안 될 뿐이라 넘어간다.
  }
}

function remove(key: string): void {
  try {
    globalThis.localStorage.removeItem(key)
  } catch {
    // 위와 같다.
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const isText = (v: unknown): v is string => typeof v === 'string'

const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText)

// 저장된 값은 믿지 않는다. 옛 버전이 쓴 값이거나 손으로 고친 값이면 모양이 다를 수 있다.
function isDraft(v: unknown): v is Draft {
  return (
    isObject(v) &&
    isObject(v.answers) &&
    Object.values(v.answers).every((a) => isText(a) || isTextList(a)) &&
    typeof v.groupIndex === 'number' &&
    Number.isInteger(v.groupIndex) &&
    v.groupIndex >= 0 &&
    isSubmissionId(v.submissionId)
  )
}

function isApplySession(v: unknown): v is ApplySession {
  return (
    isObject(v) &&
    isSubmissionId(v.submissionId) &&
    isText(v.guardianName) &&
    isText(v.guardianPhone) &&
    isText(v.petName) &&
    isTextList(v.services) &&
    isText(v.wish1) &&
    typeof v.training === 'boolean' &&
    typeof v.surveyDone === 'boolean'
  )
}

export function loadDraft(formId: 'apply' | 'survey'): Draft | null {
  const v = read(draftKey(formId))
  return isDraft(v) ? v : null
}

export function saveDraft(formId: 'apply' | 'survey', d: Draft): void {
  write(draftKey(formId), d)
}

export function clearDraft(formId: 'apply' | 'survey'): void {
  remove(draftKey(formId))
}

export function loadSession(): ApplySession | null {
  const v = read(SESSION_KEY)
  return isApplySession(v) ? v : null
}

export function saveSession(s: ApplySession): void {
  write(SESSION_KEY, s)
}

export function clearSession(): void {
  remove(SESSION_KEY)
}
