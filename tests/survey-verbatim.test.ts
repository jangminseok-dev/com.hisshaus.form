import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allQuestions } from '../forms/rules'
import { surveyForm } from '../forms/survey'
import type { Question, QuestionType } from '../forms/types'

// 검사지 정의(forms/survey.ts)를 구글폼 원본 덤프(tests/survey-original.txt)와 98문항 모두 글자 단위로 대조한다.
// 덤프는 원본 양식(FB_PUBLIC_LOAD_DATA_)에서 질문·안내문·선택지만 뽑은 것이라 개인정보가 없다. 한 문항은 이렇게 생겼다:
//   === [유형] '번호. 질문*\n안내문'     유형 0 단답 · 1 장문 · 2 라디오 · 4 체크박스 · 6 섹션 제목
//      - '선택지'                        '' (기타 입력) 이면 기타 선택지
//      required: 0                      덤프의 이 값은 늘 0 이다. 필수는 질문 끝의 * 로 표시돼 있다.
// 원문과 달리 둔 곳은 판정으로 정한 RULINGS·SHORT_KIND, 사장님 결정(2026-10-24)으로 고친 FIXES, 그리고 구글폼에서만 필요했던
// 선택 안내(INSTRUCTION_HINT) 삭제뿐이다(설계 문서 5절). 그 밖의 차이는 모두 실패다.

interface Original {
  code: number
  number: number
  label: string
  hint: string | undefined
  required: boolean
  options: string[]
  other: boolean
}

const QUESTION_TYPE: Record<number, QuestionType> = { 0: 'short', 1: 'long', 2: 'single', 4: 'multi' }
const SECTION = 6

/** 판정으로 원문과 달리 둔 곳. */
const RULINGS: Record<string, Partial<Pick<Question, 'required' | 'type'>>> = {
  // 원문은 필수 표시가 없는 체크박스다. 동의 없이 개인정보를 받지 않으려고 필수·하나만 고르기로 둔다(blockIf 와 함께).
  q2: { required: true, type: 'single' },
  // 원문은 라디오지만 안내문이 a·b 에서 하나씩 고르라고 한다.
  q21: { type: 'multi' },
}

/**
 * 사장님 결정(2026-10-24)으로 원문과 달리 적은 글. 원문의 오타·틀린 숫자·잘못 복사된 설명·어긋난 나이 선택지, 그리고
 * 답을 지어내게 하던 필수 표시(q24~q26). 값은 화면의 것이고, 테스트가 원문과 정말 다른지도 함께 본다.
 */
const FIXES: Record<string, Partial<Pick<Question, 'label' | 'hint' | 'required'>>> = {
  q21: { hint: 'a에서 1개, b에서 1개 골라주세요 (a : 빈도, b : 정도)' },
  q24: { required: false },
  q25: { required: false },
  q26: { required: false },
  // 아래 셋은 같은 뜻의 선택지·안내를 다수 꼴(네/아니오, '없다면 없음 이라고', '예)')에 맞춘 것이다.
  q15: { hint: '예) 생후 3개월 령 / 안아서 다녔고 주 2회 정도 나가보았음, 주로 실내공간 위주로 다님.' },
  q17: {
    hint: [
      '예)',
      '1) 상황 설명 :',
      '목욕을 하려고 할때 뒷다리로 손이 닿으면,',
      '빗질을 할 때 얼굴 눈앞으로 빗이 닿자마자 ...',
      '',
      '2) 반려견 행동 묘사 (관찰이 가능한 행동으로 묘사해주세요)',
      '스트레스 받아합니다, 싫어합니다, 예민합니다, 삐진 것 같습니다 (x)',
      '으르렁거립니다, 짖습니다, 무는 시늉을 합니다 (o)',
      '',
      '3) 반려인의 대처 :',
      '안돼 라고 말하고 밀어냅니다, 계속해서 빗질을 시도합니다.',
    ].join('\n'),
  },
  q43: { label: '영양제를 급여하고 있습니까?' },
  q76: { hint: '없다면 없음 이라고 적어주세요!' },
  q51: { label: '반려견은 밤에 어디에서 잡니까?' },
  q56: { label: '반려견이 하루 평균 야외에서 보내는 시간은 얼마나 됩니까?' },
  q63: { label: '화장실 이외의 장소에서 배변활동을 하기도 합니까?' },
  q68: { label: '의뢰인의 주거 형태는 어느 곳에 가깝습니까?' },
  q69: { label: '집에서 현재 하고 계신 관리를 골라주세요 (중복 선택 가능)' },
  q79: { label: '반려견이 할 수 있는 개인기가 있다면? (중복 선택 가능)' },
  q90: { label: '피가 나지 않아도 문 적이 있다면 몇 번 정도 입니까?' },
}

/** 선택지 고침: 원문 선택지 → 화면 선택지. 원문에 그 선택지가 정말 있어야 한다. */
const OPTION_FIXES: Record<string, [string, string][]> = {
  q19: [['생후 6개월형 미만', '생후 6개월령 미만']],
  q20: [['생후 6개월형 미만', '생후 6개월령 미만']],
  q30: [
    ['파괴행동 (집안의 물건을 부수건나 씹는 등의 행동)', '파괴행동 (집안의 물건을 부수거나 씹는 등의 행동)'],
    // 원문은 바로 위 분리불안 설명이 그대로 복사돼 있었다. 사장님이 준 설명으로.
    ['요구적인 행동 (보호자와 헤어지면 먹이 먹지 못함, 하울링, 낑낑거림, 짖음, 물건 파괴 등...)', '요구적인 행동 (관심을 끌려고 짖거나 앞발로 긁음 등)'],
  ],
  // 나이 선택지를 q19·q20 과 같게.
  q31: [
    ['6개월~1세령', '6개월 ~ 1세령'],
    ['2세 이상', '2세령 이상'],
  ],
  q43: [
    ['그렇다.', '네'],
    ['아니다', '아니오'],
  ],
  q49: [['예', '네']],
  q37: [['제한 급식 (3분 이내에 다 밥을 다 먹거나, 남길 시 밥그릇을 치운다.)', '제한 급식 (3분 이내에 밥을 다 먹거나, 남길 시 밥그릇을 치운다.)']],
  q71: [['훈현소를 다녀봤고 수료했다.', '훈련소를 다녀봤고 수료했다.']],
  q83: [['반려견 목욖을 한다', '반려견 목욕을 한다']],
  q86: [['갑작스런 공격 행동이 일어나기 때문에 이중견격이라고 느낀다', '갑작스런 공격 행동이 일어나기 때문에 이중인격이라고 느낀다']],
  q96: [
    [
      '문제 행동이 삼각하긴 하나, 눈꼽을 떼거나, 발을 씻기거나, 목욕을 하는 등의 위생관리도 중요해서 안할 수는 없을 것 같음',
      '문제 행동이 심각하긴 하나, 눈꼽을 떼거나, 발을 씻기거나, 목욕을 하는 등의 위생관리도 중요해서 안할 수는 없을 것 같음',
    ],
    [
      '문제 행동은 꽤 심각하므로 꼮 수정하고 싶고, 멘탈 케어가 최우선이므로 교육 중 반려견에게서 거부 반응이 관찰되는 모든 행위를 중단할 각오가 되어있음(목욕, 발 씻기, 눈꼽 떼주기 등...)',
      '문제 행동은 꽤 심각하므로 꼭 수정하고 싶고, 멘탈 케어가 최우선이므로 교육 중 반려견에게서 거부 반응이 관찰되는 모든 행위를 중단할 각오가 되어있음(목욕, 발 씻기, 눈꼽 떼주기 등...)',
    ],
  ],
}

/**
 * 뺀 선택지(2026-10-24 사장님 결정). q83 '없음' 은 앞의 공격성 질문(q83_has)이 대신한다. 나머지는 같은 뜻이 둘이던 것 중 덜 쉬운 쪽.
 */
const OPTION_REMOVALS: Record<string, string[]> = {
  q69: ['이 닦이기'], // '양치질' 과 같다
  q83: ['소파나 침대에 올라가 있는 반려견을 내리려고 한다', '없음'], // 앞 것은 '반려견을 소파나 침대에서 내리려고 한다' 와 같다
}

/** 원문 선택지에 고침·삭제를 적용한다. 고칠·뺄 선택지가 원문에 없으면 멈춘다(엉뚱한 곳을 고치지 않게). */
function fixedOptions(id: string, options: string[]): string[] {
  let out = options
  for (const [from, to] of OPTION_FIXES[id] ?? []) {
    if (!out.includes(from)) throw new Error(`${id} 원문에 없는 선택지를 고치려 한다: ${from}`)
    out = out.map((o) => (o === from ? to : o))
  }
  for (const gone of OPTION_REMOVALS[id] ?? []) {
    if (!out.includes(gone)) throw new Error(`${id} 원문에 없는 선택지를 빼려 한다: ${gone}`)
    out = out.filter((o) => o !== gone)
  }
  return out
}

/** 구글폼에서만 필요했던 선택 안내. 화면의 칩이 하나/여러 개를 알아서 제한하므로 뺐다. 원문 안내문이 이 꼴이면 화면에는 없다. */
const INSTRUCTION_HINT = /^(한 개(의 항목)?만 선택해주세요\.?|해당 ?사항에 모두 (표시|선택)(해주세요|하세요)\.?)$/

/**
 * "있습니까? 있다면 적어주세요" 한 칸을 네/아니오 칩 + 짝 글 문항(id 뒤 _detail)으로 나눈 것(2026-10-24). 원문 문항은 질문의 앞부분만
 * 남고 single 이 되며 안내문이 없어진다. 짝 문항의 질문은 원문 뒷부분이고, 원문 안내문의 '없다면 …' 꼬리는 뺀다.
 */
const SPLIT: Record<string, { label: string; detail: { label: string; hint?: string } }> = {
  q66: { label: '타동물이 있습니까?', detail: { label: '있다면 어떤 관계인지 자세히 적어주세요', hint: '예) 동거묘가 있다. 3살 수컷 서로 모르는 척 한다. 등' } },
  q76: { label: '반려견이 당신의 요청을 따르지 않는 순간이 있습니까?', detail: { label: '있다면 어떤 상황인지 구체적으로 적어주세요.' } },
  q77: { label: '반려견이 당신에게 짖는 순간이 있습니까?', detail: { label: '있다면 어떤 때인지 적어주세요' } },
}

/** 단답(유형 0)을 화면에서 이메일·전화 입력으로 받는 문항. 글자와 필수 여부는 원문 그대로다. */
const SHORT_KIND: Record<string, QuestionType> = { q1: 'email', q4: 'phone' }

/** 덤프의 작은따옴표 문자열을 푼다. 덤프에 있는 이스케이프는 \n 뿐이다. 다른 것이 나오면 대조가 틀리지 않게 멈춘다. */
function unquote(raw: string): string {
  const m = /^'(.*)'$/.exec(raw)
  if (!m) throw new Error(`따옴표 문자열이 아니다: ${raw}`)
  if (/\\(?!n)/.test(m[1])) throw new Error(`모르는 이스케이프: ${raw}`)
  return m[1].replace(/\\n/g, '\n')
}

/**
 * 덤프의 문항들. 첫 줄이 질문이고 나머지가 안내문이다(사이의 빈 줄은 화면이 문단으로 띄우므로 세지 않는다).
 * q18 은 덤프에서 질문 끝 * 뒤에 공백이 하나 더 있다(덤프 끝 공백). 보이지 않는 글자라 떼고 본다.
 */
function parse(dump: string): Original[] {
  const items: Original[] = []
  let current: Original | null = null
  for (const line of dump.split('\n')) {
    const head = /^=== \[(\d+)\] (.*)$/.exec(line)
    if (head) {
      const code = Number(head[1])
      if (code === SECTION) {
        current = null
        continue
      }
      if (!(code in QUESTION_TYPE)) throw new Error(`모르는 유형: ${line}`)
      const text = unquote(head[2])
      const nl = text.indexOf('\n')
      const first = (nl < 0 ? text : text.slice(0, nl)).trimEnd()
      const numbered = /^(\d+)\.\s?(.*)$/.exec(first)
      if (!numbered) throw new Error(`번호가 없는 문항: ${line}`)
      const required = numbered[2].endsWith('*')
      current = {
        code,
        number: Number(numbered[1]),
        label: required ? numbered[2].slice(0, -1) : numbered[2],
        hint: nl < 0 ? undefined : text.slice(nl + 1).replace(/^\n+/, ''),
        required,
        options: [],
        other: false,
      }
      items.push(current)
      continue
    }
    const option = /^ {3}- (.*)$/.exec(line)
    if (option) {
      if (!current) throw new Error(`문항 밖의 선택지: ${line}`)
      if (option[1] === "'' (기타 입력)") current.other = true
      else current.options.push(unquote(option[1]))
    }
  }
  return items
}

const originals = parse(readFileSync(join(import.meta.dirname, 'survey-original.txt'), 'utf8'))
/** 원문 번호가 있는 문항만 대조한다. 짝 글 문항(_detail)과 새로 넣은 질문(q83_has)은 원문에 없다. */
const questions = allQuestions(surveyForm).filter((q) => /^q\d+$/.test(q.id))
const details = allQuestions(surveyForm).filter((q) => q.id.endsWith('_detail'))

/** 비교할 칸만. 기타가 없거나 선택지가 없는 것은 원문 쪽 모양(false·[])에 맞춘다. */
function shape(q: Pick<Question, 'label' | 'hint' | 'required' | 'type' | 'options' | 'other'>) {
  return { label: q.label, hint: q.hint, required: q.required, type: q.type, options: q.options ?? [], other: !!q.other }
}

describe('검사지 원문 대조', () => {
  it('덤프에서 98문항을 번호 순서대로 읽는다', () => {
    expect(originals.map((o) => o.number)).toEqual(Array.from({ length: 98 }, (_, i) => i + 1))
    expect(questions.map((q) => q.id)).toEqual(originals.map((o) => `q${o.number}`))
  })

  it.each(originals.map((o) => [`q${o.number}`, o] as const))(
    '%s 의 질문·안내문·선택지·기타·필수·유형이 원문 그대로다',
    (id, original) => {
      const q = questions.find((x) => x.id === id)!
      const expected = shape({
        label: original.label,
        hint: original.hint !== undefined && INSTRUCTION_HINT.test(original.hint) ? undefined : original.hint,
        required: original.required,
        type: SHORT_KIND[id] ?? QUESTION_TYPE[original.code],
        options: fixedOptions(id, original.options),
        other: original.other,
        ...RULINGS[id],
        ...FIXES[id],
        ...(SPLIT[id] ? { label: SPLIT[id].label, hint: undefined, type: 'single' as const, options: ['네', '아니오'] } : {}),
      })
      expect(shape(q)).toEqual(expected)
    },
  )

  it('예외는 실제로 원문과 다른 곳에만 둔다', () => {
    for (const [id, ruled] of Object.entries(RULINGS)) {
      const original = originals.find((o) => `q${o.number}` === id)!
      if (ruled.required !== undefined) expect(original.required).not.toBe(ruled.required)
      if (ruled.type !== undefined) expect(QUESTION_TYPE[original.code]).not.toBe(ruled.type)
    }
    for (const id of Object.keys(SHORT_KIND)) {
      expect(QUESTION_TYPE[originals.find((o) => `q${o.number}` === id)!.code]).toBe('short')
    }
    for (const [id, fix] of Object.entries(FIXES)) {
      const original = originals.find((o) => `q${o.number}` === id)!
      if (fix.label !== undefined) expect(original.label).not.toBe(fix.label)
      if (fix.hint !== undefined) expect(original.hint).not.toBe(fix.hint)
      if (fix.required !== undefined) expect(original.required).not.toBe(fix.required)
    }
    for (const [id, pairs] of Object.entries(OPTION_FIXES)) {
      const original = originals.find((o) => `q${o.number}` === id)!
      for (const [from, to] of pairs) {
        expect(original.options).toContain(from)
        expect(from).not.toBe(to)
      }
    }
  })

  it('공격성 질문(q83_has)은 공격행동 묶음 맨 앞에 있고, 그 묶음의 원문 문항은 전부 네일 때만 보인다', () => {
    const k = surveyForm.groups.find((g) => g.id === 'k')!
    expect(k.questions[0]).toMatchObject({ id: 'q83_has', type: 'single', required: true, options: ['네', '아니오'] })
    for (const q of k.questions.slice(1)) {
      const conds = Array.isArray(q.showIf) ? q.showIf : [q.showIf]
      // q88·q89 는 q87(출혈) 조건이고, q87 자체가 공격성 조건이라 결국 같다.
      expect(conds.some((c) => c && (c.questionId === 'q83_has' || c.questionId === 'q87'))).toBe(true)
    }
    expect(k.note).toBeUndefined()
  })

  it('나눈 문항의 짝 글 문항은 원문 질문의 뒷부분이고, 원문 문항이 네일 때만 보이며, 원문 바로 뒤에 선다', () => {
    expect(details.map((d) => d.id)).toEqual(Object.keys(SPLIT).map((id) => `${id}_detail`))
    for (const [id, split] of Object.entries(SPLIT)) {
      const original = originals.find((o) => `q${o.number}` === id)!
      // 원문 질문 = 앞부분 + ' ' + 뒷부분.
      expect(original.label).toBe(`${split.label} ${split.detail.label}`)
      const detail = details.find((d) => d.id === `${id}_detail`)!
      expect(detail).toMatchObject({ label: split.detail.label, type: 'long', required: true, showIf: { questionId: id, equals: '네' } })
      expect(detail.hint).toBe(split.detail.hint)
      const all = allQuestions(surveyForm)
      expect(all.indexOf(detail)).toBe(all.indexOf(all.find((q) => q.id === id)!) + 1)
    }
  })

  it('선택 안내 삭제는 원문 안내문이 그 한 줄뿐인 문항에만 적용된다(다른 안내가 섞인 문항은 그대로다)', () => {
    for (const o of originals) {
      if (o.hint === undefined || FIXES[`q${o.number}`]?.hint !== undefined || SPLIT[`q${o.number}`]) continue
      const q = questions.find((x) => x.id === `q${o.number}`)!
      expect(q.hint === undefined).toBe(INSTRUCTION_HINT.test(o.hint))
    }
  })
})
