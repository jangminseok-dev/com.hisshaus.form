import { describe, expect, it } from 'vitest'
import { applyForm, TRAINING_SERVICE } from '../forms/apply'
import { allQuestions } from '../forms/rules'

describe('신청서 정의', () => {
  it('신청서는 묶음 셋이고 문항 id 가 겹치지 않는다', () => {
    expect(applyForm.groups.map((g) => g.id)).toEqual(['guardian', 'pet', 'visit'])
    const ids = allQuestions(applyForm).map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('희망 날짜 1순위와 시간대는 필수고 2순위는 선택이다', () => {
    const q = (id: string) => allQuestions(applyForm).find((x) => x.id === id)!
    expect(q('wish1_date').required).toBe(true)
    expect(q('wish1_slot').required).toBe(true)
    expect(q('wish2_date').required).toBe(false)
    expect(q('wish2_slot').required).toBe(false)
  })

  it('서비스 선택지에 교육미용 상담이 있다', () => {
    const services = allQuestions(applyForm).find((x) => x.id === 'services')!
    expect(services.options).toContain(TRAINING_SERVICE)
  })
})
