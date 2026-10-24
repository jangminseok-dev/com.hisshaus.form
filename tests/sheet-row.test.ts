import { describe, expect, it } from 'vitest'
import { applyForm } from '../forms/apply'
import { allQuestions } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import { sheetHeader, sheetRow } from '../lib/sheet-row'

const meta = { submissionId: 'abcDEF1234', receivedAt: '2026-10-23 10:00:00' }

describe('시트 행', () => {
  it('헤더는 접수 시각·신청 ID 뒤에 문항 라벨 순서다', () => {
    const h = sheetHeader(applyForm)
    const qs = allQuestions(applyForm)
    expect(h).toHaveLength(2 + qs.length)
    expect(h.slice(0, 2)).toEqual(['접수 시각', '신청 ID'])
    expect(h.slice(2)).toEqual(qs.map((q) => q.label))
  })

  it('행은 헤더와 길이가 같고 빈 답은 빈 칸이다', () => {
    const qs = allQuestions(applyForm)
    const dateQ = qs.find((q) => q.type === 'date')
    const answers: Record<string, string> = { [qs[0].id]: '홍길동' }
    if (dateQ) answers[dateQ.id] = '2026-10-28'
    const row = sheetRow(applyForm, answers, meta)
    expect(row).toHaveLength(sheetHeader(applyForm).length)
    expect(row.slice(0, 3)).toEqual([meta.receivedAt, meta.submissionId, '홍길동'])
    expect(row[3]).toBe('')
    if (dateQ) expect(row[2 + qs.indexOf(dateQ)]).toBe('2026-10-28')
  })

  it('동의는 동의 문자열로, 복수 선택은 쉼표로 잇는다', () => {
    const qs = allQuestions(applyForm)
    const consent = qs.find((q) => q.type === 'consent')!
    const multi = allQuestions(surveyForm).find((q) => q.type === 'multi')
    expect(sheetRow(applyForm, { [consent.id]: '동의' }, meta)[2 + qs.indexOf(consent)]).toBe('동의')
    if (multi) {
      const sq = allQuestions(surveyForm)
      expect(sheetRow(surveyForm, { [multi.id]: ['가', '나'] }, meta)[2 + sq.indexOf(multi)]).toBe('가, 나')
    }
  })

  it('예약신청 헤더에 같은 이름의 칸이 없다', () => {
    const h = sheetHeader(applyForm)
    expect(new Set(h).size).toBe(h.length)
    // 서비스별 묶음의 비슷한 문항이 묶음 이름 없이도 가려진다.
    expect(h).toContain('희망 예약 날짜')
    expect(h).toContain('희망 이용 날짜')
    expect(h).toContain('교육미용 희망 날짜')
    expect(h).toContain('희망 시간대')
    expect(h).toContain('교육미용 희망 시간대')
  })

  it('검사지 행도 100칸이다', () => {
    expect(sheetHeader(surveyForm)).toHaveLength(100)
    expect(sheetRow(surveyForm, {}, meta)).toHaveLength(100)
  })
})
