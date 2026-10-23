import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom 에는 화면을 움직이는 메서드가 없다(scrollIntoView 는 아예 없고 scrollTo 는 "Not implemented" 를 찍는다).
// 테스트마다 새 가짜를 두어 호출만 센다.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
})

afterEach(cleanup)
