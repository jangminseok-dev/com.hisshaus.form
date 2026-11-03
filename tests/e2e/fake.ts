import { expect, type APIRequestContext } from '@playwright/test'

import { newSubmissionId } from '../../lib/id'
import type { SlackMessage } from '../../lib/slack-blocks'
import { surveyToken } from '../../lib/survey-link'

// e2e 전용 포트. 개발 서버(3020)와 겹치지 않게 따로 쓴다.
export const WEB_PORT = 3030
export const FAKE_PORT = 3031
export const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`
/** e2e 서버의 검사지 링크 비밀값(진짜가 아니다). 테스트가 같은 값으로 링크를 만든다. */
export const E2E_SURVEY_SECRET = 'e2e-survey-link-secret-not-real-0123456789'

/** e2e 서버의 사장님 비밀번호·아이패드 PIN(진짜가 아니다). */
export const E2E_ADMIN_PASSWORD = 'e2e-admin-password'
export const E2E_ADMIN_PIN = '1234'

/** 그 신청(기본은 새 신청 ID)의 검사지 링크 경로. 사장님이 슬랙에서 받아 보내는 주소의 경로 부분이다. */
export function surveyPath(applyId: string = newSubmissionId()): string {
  return `/hisshaus/survey/${surveyToken(applyId, E2E_SURVEY_SECRET)}`
}

/** 그 신청 ID 에 남의 서명을 붙인 링크 경로(위조). */
export function forgedSurveyPath(applyId: string): string {
  const path = `/hisshaus/survey/${applyId}-${'0'.repeat(32)}`
  expect(path).not.toBe(surveyPath(applyId))
  return path
}

/** 가짜 시트가 받은 append 한 번. */
export interface SheetCall {
  id: string
  /** 디코드한 범위. 예: '예약신청'!A1 */
  range: string
  query: Record<string, string>
  authorization: string | undefined
  values: string[][]
}

/** 가짜 메일 서비스가 받은 메일 한 통. 첨부는 base64. */
export interface FakeMail {
  from: string
  to: string
  subject: string
  text: string
  attachment?: { filename: string; base64: string }
}

export interface FakeState {
  slack: SlackMessage[]
  sheets: SheetCall[]
  mail: FakeMail[]
}

/** 가짜 서비스가 받은 것을 모두 비운다. 테스트마다 시작 전에 부른다. */
export async function resetFake(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${FAKE_URL}/__reset`)
  expect(res.ok()).toBe(true)
}

/** 가짜 서비스가 지금까지 받은 슬랙 통과 시트 호출. */
export async function fakeState(request: APIRequestContext): Promise<FakeState> {
  const res = await request.get(`${FAKE_URL}/__state`)
  expect(res.ok()).toBe(true)
  return (await res.json()) as FakeState
}
