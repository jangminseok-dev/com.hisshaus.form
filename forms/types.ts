export type QuestionType = 'short' | 'long' | 'email' | 'phone' | 'single' | 'multi' | 'date' | 'consent'

export interface Question {
  id: string
  label: string
  type: QuestionType
  required: boolean
  /** 질문 아래 안내문(원문 그대로) */
  hint?: string
  /** single·multi 의 선택지 */
  options?: string[]
  /** "기타: (직접 입력)" 선택지가 있다 */
  other?: boolean
  /** 앞 문항이 이 값일 때만 보인다 */
  showIf?: { questionId: string; equals: string }
  /** 앞 문항이 그 값만 골랐으면 필수가 풀리고 숨는다 */
  optionalIfOnly?: { questionId: string; value: string }
  /** 이 값이면 진행을 막는다(해요체 안내) */
  blockIf?: { value: string; message: string }
  /** consent 유형의 본문 */
  consentText?: string
}

export interface Group {
  id: string
  title: string
  note?: string
  questions: Question[]
}

export interface FormDef {
  id: 'apply' | 'survey'
  title: string
  groups: Group[]
}

/** multi 답은 string[], 그 밖은 string. */
export type Answer = string | string[]
export type Answers = Record<string, Answer>
