import type { Answers } from '../forms/types'
import { isAnswers, isObject, isText, isTextList } from './guards'
import { isSubmissionId } from './id'

// 보호자가 창을 닫아도 같은 기기에서 이어 쓰게 하는 저장 층이다(브라우저 쪽에서 부른다).
// localStorage 는 못 쓰는 경우가 여럿이다. 서버 렌더링 중에는 없거나 메서드가 없고
// (Node 25 는 전역에 두지만 getItem 이 함수가 아니다), 브라우저가 저장소를 막으면 닿기만 해도
// 던지고, 가득 차면 setItem 이 던진다. `typeof localStorage` 확인으로는 다 걸러지지 않으므로
// 모든 접근을 try/catch 로 감싸 조용히 null/무시한다. 이어 쓰기만 안 될 뿐이다.
// 답변·연락처가 든 값을 다루므로 오류 객체는 어디에도 찍지 않는다.
//
// 같은 탭 메모리: 저장소가 막힌 브라우저에서도 제출이 성공하면 완료 화면이 방금 저장한 세션을 읽어야 한다.
// 못 읽으면 첫 화면으로 튕기고, 보호자는 접수된 줄 모르고 다시 제출한다. 그래서 쓸 때마다 이 탭의 메모리에도
// 같이 적고, 저장소에 닿는 것 자체가 던질 때만 거기서 읽는다. 저장소를 읽을 수 있으면 저장소가 정본이다
// (다른 탭이 지우거나 고친 값을 메모리가 되살리지 않는다). 메모리는 탭을 새로 고치면 사라진다.

/**
 * 쓰던 묶음의 위치와 지금까지의 답. 신청서와 검사지가 각각 하나씩 가진다.
 *
 * `key` 는 초안을 새로 만들 때마다 만드는 무작위 열쇠다(신청 ID 와 별개, 복원된 초안은 같은 열쇠를 유지한다). 방문 기록 칸이
 * 어느 초안의 것인지 가리는 데 쓴다. 검사지는 신청서의 신청 ID 를 그대로 쓰므로, 신청 ID 로는 지난 검사지가 남긴 칸과 새로
 * 연 검사지를 가릴 수 없다.
 */
export interface Draft {
  answers: Answers
  groupIndex: number
  submissionId: string
  key: string
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

/** 이 탭 메모리의 사본. 값은 JSON 글로 둬서 호출한 쪽의 객체와 이어지지 않는다. */
const memory = new Map<string, string>()

/** 저장된 JSON 을 읽는다. 없거나 깨졌으면 null. 저장소에 닿지 못하면 이 탭 메모리에서 읽는다. */
function read(key: string): unknown {
  let raw: string | null
  try {
    raw = globalThis.localStorage.getItem(key)
  } catch {
    raw = memory.get(key) ?? null
  }
  try {
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    const raw = JSON.stringify(value)
    memory.set(key, raw)
    globalThis.localStorage.setItem(key, raw)
  } catch {
    // 저장소가 없거나 막혔거나 가득 찼다. 이어 쓰기만 안 될 뿐이라 넘어간다.
  }
}

function remove(key: string): void {
  memory.delete(key)
  try {
    globalThis.localStorage.removeItem(key)
  } catch {
    // 위와 같다.
  }
}

// 저장된 값은 믿지 않는다. 옛 버전이 쓴 값이거나 손으로 고친 값이면 모양이 다를 수 있다.
function isDraft(v: unknown): v is Draft {
  return (
    isObject(v) &&
    isAnswers(v.answers) &&
    typeof v.groupIndex === 'number' &&
    Number.isInteger(v.groupIndex) &&
    v.groupIndex >= 0 &&
    isSubmissionId(v.submissionId) &&
    isSubmissionId(v.key)
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
