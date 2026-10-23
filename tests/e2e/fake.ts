import { expect, type APIRequestContext } from '@playwright/test'

import type { SlackMessage } from '../../lib/slack-blocks'

// e2e 전용 포트. 개발 서버(3020)와 겹치지 않게 따로 쓴다.
export const WEB_PORT = 3030
export const FAKE_PORT = 3031
export const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`

/** 가짜 시트가 받은 append 한 번. */
export interface SheetCall {
  id: string
  /** 디코드한 범위. 예: '예약신청'!A1 */
  range: string
  query: Record<string, string>
  authorization: string | undefined
  values: string[][]
}

export interface FakeState {
  slack: SlackMessage[]
  sheets: SheetCall[]
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
