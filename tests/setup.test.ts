import { describe, expect, it, vi } from 'vitest'
import { loadDraft, loadSession, saveDraft, saveSession, type ApplySession, type Draft } from '../lib/draft'

// tests/setup.ts 의 afterEach 가 lib/draft.ts 의 같은 탭 메모리를 비우는지 본다. 두 테스트는 이 순서로 돈다.
// 메모리는 저장소를 읽을 수 없을 때만 읽히므로, 앞 테스트가 막힌 저장소에 쓴 값이 새면 뒤 테스트의 막힌 저장소에서 보인다.

const session: ApplySession = {
  submissionId: 'Ab3dE5gH7j',
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용'],
  wish1: '10월 28일 (수) 오전',
  training: false,
  surveyDone: false,
}
const draft: Draft = { answers: { q3: '김하나' }, groupIndex: 1, submissionId: 'Ab3dE5gH7j', key: 'Kk3dE5gH7j' }

const block = () =>
  vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('blocked')
  })

describe('테스트 사이의 같은 탭 메모리', () => {
  it('앞 테스트: 저장소가 막힌 채 세션과 초안을 쓰면 같은 탭에서는 읽힌다', () => {
    block()
    saveSession(session)
    saveDraft('survey', draft)
    expect(loadSession()).toEqual(session)
    expect(loadDraft('survey')).toEqual(draft)
  })

  it('뒤 테스트: 앞 테스트가 메모리에 쓴 값은 남아 있지 않다', () => {
    block()
    expect(loadSession()).toBeNull()
    expect(loadDraft('survey')).toBeNull()
  })
})
