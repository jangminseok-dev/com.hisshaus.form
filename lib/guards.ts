import type { Answers } from '../forms/types'

// 값의 모양을 따지는 순수 함수 모음이다. 서버 의존이 없어서 서버(lib/submit.ts)와 브라우저(lib/draft.ts)가
// 함께 쓴다. 초안의 answers 는 나중에 그대로 서버로 가서 같은 규칙으로 판정되므로, 두 쪽이 어긋나지 않게 한 곳에 둔다.

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export const isText = (v: unknown): v is string => typeof v === 'string'

export const isTextList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText)

/** 값이 전부 문자열이거나 문자열 배열인 객체. 그 밖의 값은 검증기가 다루지 못한다. */
export function isAnswers(v: unknown): v is Answers {
  return isObject(v) && Object.values(v).every((x) => isText(x) || isTextList(x))
}
