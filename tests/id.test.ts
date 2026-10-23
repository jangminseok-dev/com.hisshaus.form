import { describe, expect, it } from 'vitest'
import { isSubmissionId, newSubmissionId } from '../lib/id'

describe('신청 ID', () => {
  it('영숫자 10자를 만든다', () => {
    const id = newSubmissionId()
    expect(id).toMatch(/^[A-Za-z0-9]{10}$/)
    expect(isSubmissionId(id)).toBe(true)
  })

  it('형식이 다르면 거짓', () => {
    expect(isSubmissionId('abc')).toBe(false)
    expect(isSubmissionId('abcdefghij!')).toBe(false)
    expect(isSubmissionId(123)).toBe(false)
  })
})
