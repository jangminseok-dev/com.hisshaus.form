import { describe, expect, it } from 'vitest'
import { GROOMING_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE } from '../forms/apply'
import { depositOf } from '../lib/deposit'

describe('예약금', () => {
  it('교육미용 상담이 들어 있으면 50,000원, 아니면 10,000원이다', () => {
    expect(depositOf([GROOMING_SERVICE])).toBe('10,000원')
    expect(depositOf([GROOMING_SERVICE, HOTEL_SERVICE])).toBe('10,000원')
    expect(depositOf([TRAINING_SERVICE])).toBe('50,000원')
    expect(depositOf([GROOMING_SERVICE, TRAINING_SERVICE])).toBe('50,000원')
    expect(depositOf([])).toBe('10,000원')
  })
})
