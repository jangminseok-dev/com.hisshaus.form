import { describe, expect, it } from 'vitest'
import { formatKoreanPhone } from '../lib/phone'

describe('연락처 하이픈', () => {
  it('적는 대로 하이픈을 넣는다 — 휴대폰 3-4-4, 10자리는 3-3-4, 02 는 2자리 지역번호', () => {
    expect(formatKoreanPhone('010')).toBe('010')
    expect(formatKoreanPhone('0101')).toBe('010-1')
    expect(formatKoreanPhone('0101234')).toBe('010-1234')
    expect(formatKoreanPhone('01012345')).toBe('010-123-45')
    expect(formatKoreanPhone('0101234567')).toBe('010-123-4567')
    expect(formatKoreanPhone('01012345678')).toBe('010-1234-5678')
    expect(formatKoreanPhone('0212345678')).toBe('02-1234-5678')
    expect(formatKoreanPhone('0311234567')).toBe('031-123-4567')
  })

  it('이미 하이픈이 있어도 다시 맞추고, 국가 번호·글자가 섞이면 손대지 않는다', () => {
    expect(formatKoreanPhone('010-1234-5678')).toBe('010-1234-5678')
    expect(formatKoreanPhone('010-12345678')).toBe('010-1234-5678')
    expect(formatKoreanPhone('+82 10-1234-5678')).toBe('+82 10-1234-5678')
    expect(formatKoreanPhone('010 1234 5678')).toBe('010 1234 5678')
    expect(formatKoreanPhone('')).toBe('')
  })

  it('11자리를 넘는 숫자는 잘라 11자리까지만 둔다', () => {
    expect(formatKoreanPhone('010123456789')).toBe('010-1234-5678')
  })
})
