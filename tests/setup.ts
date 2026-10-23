import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { clearDraft, clearSession } from '../lib/draft'

// jsdom 에는 화면을 움직이는 메서드가 없다(scrollIntoView 는 아예 없고 scrollTo 는 "Not implemented" 를 찍는다).
// 테스트마다 새 가짜를 두어 호출만 센다.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
})

afterEach(() => {
  cleanup()
  // lib/draft.ts 의 같은 탭 메모리는 모듈 안에 있어서 테스트 사이에 남는다. 저장소가 막힌 테스트가 쓴 값이 다음 테스트로 새지 않게
  // clear* 로 메모리까지 비운다.
  clearDraft('apply')
  clearDraft('survey')
  clearSession()
})
