import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, clearSession, loadDraft, loadSession, markSurveySent, saveDraft, saveSession, sentSurveyId } from '../lib/draft'
import type { ApplySession, Draft } from '../lib/draft'

const draft: Draft = {
  answers: {
    guardian_name: '김하나',
    pet_name: '보리',
    services: ['Grooming 미용', 'Daycare 데이케어'],
    wish1_date: '2026-10-28',
  },
  groupIndex: 2,
  submissionId: 'Ab3dE5gH7j',
  key: 'Kk3dE5gH7j',
}

const session: ApplySession = {
  submissionId: 'Ab3dE5gH7j',
  guardianName: '김하나',
  guardianPhone: '01012345678',
  petName: '보리',
  services: ['Grooming 미용', '교육미용 / 미용 트레이닝 상담'],
  wish: '2026-10-28 오전',
  training: true,
}

/** 객체에서 키 하나를 뺀 사본. */
const omit = (o: object, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key))

const boom = () => {
  throw new Error('nope')
}

/** 객체가 아니라서 어느 쪽 저장소에서도 거절돼야 하는 최상위 값. */
const notObjects: [string, unknown][] = [
  ['최상위가 배열이면', []],
  ['최상위가 null 이면', null],
  ['최상위가 문자열이면', '보리'],
  ['최상위가 숫자이면', 3],
]

/** 초안과 세션이 같은 약속을 지키는지 한 벌의 테스트로 본다. */
interface Store {
  name: string
  key: string
  value: unknown
  /** 0·빈 문자열·빈 배열·false 처럼 비어 보여도 올바른 값. */
  edge: unknown
  load(): unknown
  save(): void
  clear(): void
  /** 올바른 값에서 한 군데만 틀리게 만든 값들. */
  broken: [string, unknown][]
}

const stores: Store[] = [
  {
    name: '초안',
    key: 'hh.draft.apply',
    value: draft,
    edge: { answers: { pet_name: '', services: [] }, groupIndex: 0, submissionId: draft.submissionId, key: draft.key },
    load: () => loadDraft('apply'),
    save: () => saveDraft('apply', draft),
    clear: () => clearDraft('apply'),
    broken: [
      ['groupIndex 가 문자열이면', { ...draft, groupIndex: '1' }],
      ['groupIndex 가 음수이면', { ...draft, groupIndex: -1 }],
      ['groupIndex 가 정수가 아니면', { ...draft, groupIndex: 1.5 }],
      ['groupIndex 가 없으면', omit(draft, 'groupIndex')],
      ['answers 가 배열이면', { ...draft, answers: ['보리'] }],
      ['answers 가 없으면', omit(draft, 'answers')],
      ['answers 에 숫자 값이 있으면', { ...draft, answers: { ...draft.answers, pet_age: 3 } }],
      ['answers 에 null 값이 있으면', { ...draft, answers: { ...draft.answers, pet_name: null } }],
      ['answers 에 객체 값이 있으면', { ...draft, answers: { ...draft.answers, pet_name: { a: 1 } } }],
      ['answers 의 배열에 문자열이 아닌 것이 섞이면', { ...draft, answers: { ...draft.answers, services: ['a', 2] } }],
      ['answers 에 중첩 배열 값이 있으면', { ...draft, answers: { ...draft.answers, services: [['Grooming 미용']] } }],
      ['submissionId 가 10자가 아니면', { ...draft, submissionId: 'Ab3dE5gH7' }],
      ['submissionId 에 영숫자가 아닌 글자가 있으면', { ...draft, submissionId: 'Ab3dE5gH7!' }],
      ['submissionId 가 없으면', omit(draft, 'submissionId')],
      // 열쇠가 없는 초안은 열쇠를 도입하기 전에 저장된 것이다. 방문 기록 칸의 주인을 가릴 수 없으니 버린다.
      ['key 가 없으면', omit(draft, 'key')],
      ['key 가 10자가 아니면', { ...draft, key: 'Kk3dE5gH7' }],
      ['key 에 영숫자가 아닌 글자가 있으면', { ...draft, key: 'Kk3dE5gH7!' }],
      ['key 가 숫자이면', { ...draft, key: 1234567890 }],
      ['applyId 가 10자가 아니면', { ...draft, applyId: 'Ab3dE5gH7' }],
      ['applyId 가 null 이면', { ...draft, applyId: null }],
      ['applyId 가 숫자이면', { ...draft, applyId: 1234567890 }],
      ...notObjects,
    ],
  },
  {
    name: '세션',
    key: 'hh.session',
    value: session,
    edge: {
      submissionId: session.submissionId,
      guardianName: '',
      guardianPhone: '',
      petName: '',
      services: [],
      wish: '',
      training: false,
    },
    load: loadSession,
    save: () => saveSession(session),
    clear: clearSession,
    broken: [
      ['submissionId 가 형식에 안 맞으면', { ...session, submissionId: 'abc' }],
      ['submissionId 가 없으면', omit(session, 'submissionId')],
      ['guardianName 이 숫자이면', { ...session, guardianName: 3 }],
      ['guardianPhone 이 없으면', omit(session, 'guardianPhone')],
      ['petName 이 null 이면', { ...session, petName: null }],
      ['wish 가 배열이면', { ...session, wish: ['2026-10-28'] }],
      ['services 가 문자열이면', { ...session, services: 'Grooming 미용' }],
      ['services 에 문자열이 아닌 것이 섞이면', { ...session, services: ['Grooming 미용', 2] }],
      ['services 가 없으면', omit(session, 'services')],
      ['training 이 문자열이면', { ...session, training: 'true' }],
      ['training 이 없으면', omit(session, 'training')],
      ...notObjects,
    ],
  },
]

beforeEach(() => {
  localStorage.clear()
  // 같은 탭 메모리는 모듈 안에 있어 테스트 사이에 남는다. clear* 가 메모리도 지우므로 그걸로 비운다.
  clearDraft('apply')
  clearDraft('survey')
  clearSession()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(stores)('$name', ({ key, value, edge, load, save, clear, broken }) => {
  it('저장한 값을 그대로 읽는다', () => {
    save()
    expect(load()).toEqual(value)
  })

  it('정해진 키에 JSON 으로 저장하고 거기서 읽는다', () => {
    save()
    expect(JSON.parse(localStorage.getItem(key) ?? 'null')).toEqual(value)

    localStorage.clear()
    localStorage.setItem(key, JSON.stringify(value))
    expect(load()).toEqual(value)
  })

  it('없으면 null', () => {
    expect(load()).toBeNull()
  })

  it('지우면 null', () => {
    save()
    clear()
    expect(load()).toBeNull()
  })

  it.each([
    ['깨진 JSON 이면 null', '{깨진'],
    ['잘린 JSON 이면 null', '{"submissionId": "Ab3dE5gH7j", '],
    ['빈 문자열이면 null', ''],
  ])('%s', (_name, raw) => {
    localStorage.setItem(key, raw)
    expect(load()).toBeNull()
  })

  it.each(broken)('모양이 틀린 값이면 null 이다 — %s', (_name, raw) => {
    localStorage.setItem(key, JSON.stringify(raw))
    expect(load()).toBeNull()
  })

  it('0·빈 문자열·빈 배열·false 도 올바른 값으로 읽는다', () => {
    localStorage.setItem(key, JSON.stringify(edge))
    expect(load()).toEqual(edge)
  })

  describe('저장소를 쓸 수 없을 때', () => {
    it('쓰기만 던져도 예외가 새지 않는다. 읽기는 멀쩡한 저장소를 믿는다', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
      expect(save).not.toThrow()
      // 저장소를 읽을 수 있으면 저장소가 정본이다. 메모리는 저장소에 닿지 못할 때만 읽는다.
      expect(load()).toBeNull()
    })

    it('getItem 이 던져도 저장한 적이 없으면 null 이다', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
      expect(load()).toBeNull()
    })

    it('removeItem 이 던져도 예외가 새지 않는다', () => {
      save()
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
      expect(clear).not.toThrow()
    })

    it('localStorage 가 없어도(서버 렌더링) 예외 없이 읽고 쓰고 지운다', () => {
      vi.stubGlobal('localStorage', undefined)
      expect(load()).toBeNull()
      expect(save).not.toThrow()
      expect(clear).not.toThrow()
      expect(load()).toBeNull()
    })

    it('localStorage 에 닿는 것부터 던져도(저장소 차단) 예외 없이 읽고 쓰고 지운다', () => {
      vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(boom)
      expect(load()).toBeNull()
      expect(save).not.toThrow()
      // 저장소에는 못 썼지만 같은 탭에서는 방금 저장한 값을 읽는다.
      expect(load()).toEqual(value)
      expect(clear).not.toThrow()
      expect(load()).toBeNull()
    })

    it('오류를 콘솔에 찍지 않는다', () => {
      const printed = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {}),
      )
      save()
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)

      save()
      load()
      clear()

      for (const spy of printed) expect(spy).not.toHaveBeenCalled()
    })
  })
})

describe('저장 위치', () => {
  it('apply 와 survey 초안은 서로 섞이지 않는다', () => {
    const surveyDraft: Draft = { answers: { q3: '김하나' }, groupIndex: 0, submissionId: 'Zz9Yy8Xx7W', key: 'Qq3dE5gH7j' }
    saveDraft('apply', draft)
    saveDraft('survey', surveyDraft)

    expect(loadDraft('apply')).toEqual(draft)
    expect(loadDraft('survey')).toEqual(surveyDraft)
    expect(Object.keys(localStorage).sort()).toEqual(['hh.draft.apply', 'hh.draft.survey'])

    clearDraft('apply')
    expect(loadDraft('apply')).toBeNull()
    expect(loadDraft('survey')).toEqual(surveyDraft)
  })

  it('초안과 세션은 따로 지워진다', () => {
    saveDraft('survey', draft)
    saveSession(session)

    clearSession()
    expect(loadSession()).toBeNull()
    expect(loadDraft('survey')).toEqual(draft)

    saveSession(session)
    clearDraft('survey')
    expect(loadDraft('survey')).toBeNull()
    expect(loadSession()).toEqual(session)
  })
})

describe('같은 탭 메모리 대체', () => {
  // 저장소가 막힌 브라우저(쿠키·사이트 데이터 차단)에서는 localStorage 에 닿기만 해도 던진다.
  const block = () => vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(boom)

  it('저장소가 막혀도 같은 탭에서는 방금 저장한 세션을 읽는다', () => {
    block()
    saveSession(session)
    expect(loadSession()).toEqual(session)
  })

  it('저장소가 막혀도 같은 탭에서는 방금 저장한 초안을 읽는다', () => {
    block()
    saveDraft('survey', draft)
    expect(loadDraft('survey')).toEqual(draft)
    // 신청서 초안과 섞이지 않는다.
    expect(loadDraft('apply')).toBeNull()
  })

  it('getItem 이 던질 때도 방금 저장한 값을 메모리에서 읽는다', () => {
    saveSession(session)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    expect(loadSession()).toEqual(session)
  })

  it('다시 저장하면 마지막으로 저장한 값을 읽는다', () => {
    block()
    saveSession(session)
    saveSession({ ...session, petName: '초코' })
    expect(loadSession()).toEqual({ ...session, petName: '초코' })
  })

  it('지우면 메모리에서도 지워진다', () => {
    block()
    saveSession(session)
    saveDraft('apply', draft)
    clearSession()
    clearDraft('apply')
    expect(loadSession()).toBeNull()
    expect(loadDraft('apply')).toBeNull()
  })

  it('메모리에 둔 값이 호출한 쪽의 객체와 이어져 있지 않다', () => {
    block()
    const mine: ApplySession = { ...session, services: [...session.services] }
    saveSession(mine)
    mine.petName = '바뀜'
    mine.services.push('바뀜')
    expect(loadSession()).toEqual(session)
  })

  it('저장소를 읽을 수 있으면 저장소가 정본이다 — 다른 탭이 지운 값을 메모리에서 되살리지 않는다', () => {
    saveSession(session)
    saveDraft('survey', draft)
    // 다른 탭이 지웠다고 치자.
    localStorage.clear()
    expect(loadSession()).toBeNull()
    expect(loadDraft('survey')).toBeNull()
  })

  it('저장소에 있는 값이 메모리보다 우선한다 — 다른 탭이 고친 값을 읽는다', () => {
    saveSession(session)
    localStorage.setItem('hh.session', JSON.stringify({ ...session, petName: '초코' }))
    expect(loadSession()).toEqual({ ...session, petName: '초코' })
  })

  it('메모리로 읽을 때도 모양을 검사한다', () => {
    // 저장 쪽 타입을 우회해 모양이 틀린 값을 넣는다(옛 버전이 쓴 값처럼).
    block()
    saveSession({ ...session, services: 'Grooming 미용' } as unknown as ApplySession)
    expect(loadSession()).toBeNull()
  })
})

describe('옛 세션', () => {
  it('옛 버전이 남긴 surveyDone 이 있어도 세션을 읽는다', () => {
    localStorage.setItem('hh.session', JSON.stringify({ ...session, surveyDone: true }))
    expect(loadSession()).toMatchObject(session)
  })
})

describe('낸 검사지 표시', () => {
  it('없으면 null, 표시하면 그 신청 ID 를 읽는다', () => {
    expect(sentSurveyId()).toBeNull()
    markSurveySent('Ab3dE5gH7j')
    expect(sentSurveyId()).toBe('Ab3dE5gH7j')
    expect(localStorage.getItem('hh.survey.sent')).toBe('"Ab3dE5gH7j"')
  })

  it('저장된 값이 신청 ID 꼴이 아니면 null', () => {
    localStorage.setItem('hh.survey.sent', '"abc"')
    expect(sentSurveyId()).toBeNull()
    localStorage.setItem('hh.survey.sent', '{')
    expect(sentSurveyId()).toBeNull()
  })

  it('저장소가 막혀도 같은 탭에서는 읽는다', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(boom)
    markSurveySent('Ab3dE5gH7j')
    expect(sentSurveyId()).toBe('Ab3dE5gH7j')
  })
})

describe('검사지 초안의 신청 ID(applyId)', () => {
  it('applyId 가 있는 초안을 그대로 저장하고 읽는다', () => {
    const bound: Draft = { ...draft, applyId: 'Zz9Yy8Xx7W' }
    saveDraft('survey', bound)
    expect(loadDraft('survey')).toEqual(bound)
  })

  it('applyId 가 없는 초안도 읽는다(세션 없이 쓰기 시작한 검사지·신청서)', () => {
    saveDraft('survey', draft)
    expect(loadDraft('survey')).toEqual(draft)
    expect(loadDraft('survey')).not.toHaveProperty('applyId')
  })
})

describe('초안의 열쇠', () => {
  it('열쇠를 그대로 저장하고 읽는다 — 같은 신청 ID 의 다른 초안과 가려지도록 신청 ID 와 별개다', () => {
    const sameApply: Draft = { ...draft, key: 'Qq3dE5gH7j' }
    saveDraft('survey', draft)
    expect(loadDraft('survey')?.key).toBe(draft.key)
    saveDraft('survey', sameApply)
    expect(loadDraft('survey')).toEqual(sameApply)
    expect(loadDraft('survey')?.submissionId).toBe(draft.submissionId)
    expect(loadDraft('survey')?.key).not.toBe(draft.key)
  })
})
