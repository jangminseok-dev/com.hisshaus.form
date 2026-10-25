export type QuestionType = 'short' | 'long' | 'email' | 'phone' | 'single' | 'multi' | 'date' | 'time' | 'consent'

/** 앞 문항의 답이 equals(문자열이면 그 값, 배열이면 그중 하나)일 때 */
export interface ShowIf {
  questionId: string
  equals: string | string[]
}

export interface Question {
  id: string
  label: string
  type: QuestionType
  required: boolean
  /** short 유형: 브라우저 자동 완성 종류(name·street-address 등) */
  autoComplete?: string
  /** 질문 아래 안내문(원문 그대로) */
  hint?: string
  /** single·multi 의 선택지 */
  options?: string[]
  /** "기타: (직접 입력)" 선택지가 있다 */
  other?: boolean
  /** 앞 문항이 이 값(들 중 하나)일 때만 보인다. 조건을 여럿 주면 하나라도 맞으면 보인다. */
  showIf?: ShowIf | ShowIf[]
  /** 앞 문항이 그 값만 골랐으면 필수가 풀리고 숨는다 */
  optionalIfOnly?: { questionId: string; value: string }
  /** 그 문항에 답이 있으면 required 가 거짓이어도 필수가 된다(예: 2순위 날짜를 골랐으면 2순위 시간대) */
  requiredIf?: { questionId: string }
  /** 이 값이면 진행을 막는다(해요체 안내) */
  blockIf?: { value: string; message: string }
  /** time 유형: 이 날짜 문항의 요일에 맞는 영업시간 안의 시간만 고를 수 있다 */
  dateId?: string
  /** multi 유형: 'list' 면 칩을 한 줄에 하나씩 세로로 둔다(선택지가 많을 때 훑기 쉽게) */
  layout?: 'list'
  /** multi 유형(list): 선택지 글 → 그 선택지 앞에 둘 소제목. 선택지를 뜻 단위로 묶어 보여 준다(원문에는 없는 화면 장치) */
  headings?: Record<string, string>
  /** multi 유형: 이 선택지는 다른 선택지와 같이 고를 수 없다(예: '없음'). 고르면 나머지가 풀리고, 다른 것을 고르면 이것이 풀린다 */
  exclusive?: string
  /** multi 유형: 접두마다 하나씩만 고른다(예: ['a.', 'b.'] — a 에서 하나, b 에서 하나) */
  onePer?: string[]
  /** consent 유형의 본문 */
  consentText?: string
}

export interface Group {
  id: string
  title: string
  note?: string
  /** 앞 묶음의 복수 선택 문항에서 이 값을 골랐을 때만 보인다(이용 서비스별 묶음) */
  showIf?: { questionId: string; includes: string }
  questions: Question[]
}

export interface FormDef {
  id: 'apply' | 'survey'
  title: string
  /** 출처 표기. 첫 묶음 제목 아래와 완료 화면 끝에 보인다(검사지: 어글리독) */
  credit?: string
  groups: Group[]
}

/** multi 답은 string[], 그 밖은 string. */
export type Answer = string | string[]
export type Answers = Record<string, Answer>
