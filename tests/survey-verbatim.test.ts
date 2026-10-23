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
// 원문과 달리 둔 곳은 판정으로 정한 RULINGS 와 SHORT_KIND 뿐이다(설계 문서 5절). 그 밖의 차이는 모두 실패다.

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
const questions = allQuestions(surveyForm)

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
        hint: original.hint,
        required: original.required,
        type: SHORT_KIND[id] ?? QUESTION_TYPE[original.code],
        options: original.options,
        other: original.other,
        ...RULINGS[id],
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
  })
})
