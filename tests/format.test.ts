import { describe, expect, it } from 'vitest'
import { answerText, dateKo, maskPhone, nowKst, todayKst } from '../lib/format'
import type { Question } from '../forms/types'

const q = (type: Question['type']): Question => ({ id: 'x', label: 'X', type, required: false })

describe('표시 형식', () => {
  it('dateKo 는 월·일·요일로 보여 준다', () => {
    expect(dateKo('2026-10-28')).toBe('10월 28일 (수)')
    expect(dateKo('2026-10-25')).toBe('10월 25일 (일)')
  })

  it('maskPhone 은 가운데를 가린다', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678')
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678')
    expect(maskPhone('0101235678')).toBe('010-***-5678')
  })

  it('maskPhone 은 국가 번호 +82 꼴을 국내 꼴(0…)로 바꿔 같은 규칙으로 가린다', () => {
    expect(maskPhone('+82 10-1234-5678')).toBe('010-****-5678')
    expect(maskPhone('+82 2-1234-5678')).toBe(maskPhone('02-1234-5678'))
  })

  it('answerText 는 배열을 쉼표로 잇고 날짜를 한국어로 보여 준다', () => {
    expect(answerText(q('multi'), { x: ['a', 'b'] })).toBe('a, b')
    expect(answerText(q('date'), { x: '2026-10-28' })).toBe('10월 28일 (수)')
    expect(answerText(q('date'), { x: '2026-10-28' }, { dateStyle: 'raw' })).toBe('2026-10-28')
    expect(answerText(q('short'), {})).toBe('')
  })

  it('nowKst 와 todayKst 는 한국 시각으로 만든다', () => {
    const d = new Date('2026-10-23T16:30:05Z')
    expect(nowKst(d)).toBe('2026-10-24 01:30:05')
    expect(todayKst(d)).toBe('2026-10-24')
  })
})
