# 히스하우스 예약 신청서 웹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 히스하우스 구글폼 두 개(예약 신청서 14문항·행동 분석 검사지 98문항)를 폰에서 한 묶음씩 넘기는 웹폼으로 옮기고, 제출되면 구글 시트에 한 줄 쌓고 슬랙으로 답변 전체를 보낸다.

**Architecture:** Next.js App Router 하나. 문항은 TypeScript 데이터(`forms/`)로 정의하고 화면·검증·시트 행·슬랙 블록이 모두 그 정의를 읽는다. 브라우저는 이 웹의 `/api/*` 경로에만 보내고, 서버가 구글 시트(REST + 서비스 계정 토큰)와 슬랙(수신 웹훅)을 부른다. 입력 초안은 브라우저 localStorage에 둔다.

**Tech Stack:** Next.js 16.3.6 · React 19.3.0 · TypeScript · pnpm · CSS Modules · pretendard 1.3.9(npm, `next/font/local`) · google-auth-library(JWT 토큰) · Vitest 5 + jsdom + Testing Library · Playwright 1.63

**Spec:** `docs/superpowers/specs/2026-10-23-hisshaus-form-design.md` (설계) · `docs/superpowers/specs/2026-10-23-hisshaus-form-questions.md` (문항 원문)

## Global Constraints

- 화면 문구는 **전부 해요체**. "~입니다/~됩니다/~십시오" 금지. 단, 검사지(제2부) 질문·선택지·안내문은 **오타까지 원문 그대로**.
- 화면 어디에도 **소요 시간·전체 문항 수**("98문항", "약 3분")를 적지 않는다. 묶음 진행 표시(`2 / 4`)는 된다.
- 외부 스크립트·외부 글꼴·분석 도구·`NEXT_PUBLIC_` 변수 없음. 브라우저가 부르는 곳은 이 웹뿐.
- `process.env` 는 `lib/config.ts` 에서만 읽는다. 환경변수 셋: `SLACK_WEBHOOK_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`(base64), `GOOGLE_SHEET_ID`.
- 웹훅 주소·키·답변 내용·요청 본문을 `console.*` 에 넣지 않는다. 로그에는 "슬랙 전송 실패" + 신청 ID 만.
- 폴더는 `app` · `components` · `forms` · `content` · `lib` · `public` · `tests` · `scripts` · `docs` 만.
- 주석·테스트 이름·커밋 메시지는 한국어. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 를 붙인다.
- 답변 글자 수 상한: 짧은 답(`short`·`email`·`phone`·기타 입력) 200자, 긴 답(`long`) 3,000자. 서버가 검증한다.
- 신청 ID: 브라우저가 만든 영숫자 10자(`^[A-Za-z0-9]{10}$`). 서버는 형식만 본다.
- 시트 탭 이름 `예약신청` · `검사지`. 맨 앞 두 열은 `접수 시각`(KST, `YYYY-MM-DD HH:mm:ss`) · `신청 ID`.

## Review Focus

1. 희망 날짜가 오늘 이전이거나 `YYYY-MM-DD` 형식이 아닌 값이 서버에 오면 거부해야 한다 — Task 2 `validate` 테스트.
2. 긴 답 하나가 슬랙 섹션 한도(3,000자)에 가까워 질문 제목과 합치면 넘칠 때 잘리지 않고 다음 블록으로 넘어가야 한다 — Task 5 테스트.
3. localStorage 를 쓸 수 없는 브라우저(사파리 프라이빗·저장소 차단)에서도 폼이 동작하고 예외가 새지 않아야 한다 — Task 8 테스트.
4. 제출 버튼을 빠르게 두 번 누르면 요청이 한 번만 나가야 한다 — Task 9 테스트.
5. 한글 탭 이름(`예약신청`)이 든 A1 범위를 URL 에 넣을 때 따옴표·인코딩이 맞아야 한다(틀리면 400) — Task 6 테스트.

---

## 파일 구조

```
app/
  layout.tsx            Pretendard·메타데이터·viewport
  globals.css           색·간격 토큰, 바탕
  page.tsx              [0 첫 화면] (서버 컴포넌트)
  apply/page.tsx        신청서 단계 화면 (클라이언트 StepForm 감쌈)
  apply/training/page.tsx  [4 검사지 안내]
  apply/done/page.tsx   [5 완료]
  survey/page.tsx       검사지 단계 화면
  survey/done/page.tsx  검사지 완료
  api/apply/route.ts    POST 신청서 제출
  api/apply/cancel-training/route.ts  POST 교육미용 취소 알림
  api/survey/route.ts   POST 검사지 제출
content/shop.ts         매장 정보·OG 문구 (자리 표시)
forms/types.ts          Question·Group·FormDef·Answers 형
forms/apply.ts          신청서 정의
forms/survey.ts         검사지 정의 (98문항 원문)
forms/rules.ts          isVisible·isRequired·blockedBy
lib/config.ts           환경변수
lib/id.ts               신청 ID 생성·검증
lib/validate.ts         답변 검증
lib/format.ts           날짜·시각·연락처 가림 표시
lib/sheet-row.ts        FormDef+답변 → 시트 행·헤더
lib/slack-blocks.ts     FormDef+답변 → 슬랙 메시지(분할·이스케이프)
lib/slack.ts            웹훅 전송(순차·1초 간격)
lib/sheets.ts           시트 append (서비스 계정 토큰 + REST)
lib/submit.ts           검증 → 시트 → 슬랙 순서
lib/draft.ts            초안·세션 localStorage
components/StepForm.tsx      묶음 넘기기·진행·고정 버튼·오류 스크롤
components/fields/*.tsx      ShortField·LongField·SingleChoice·MultiChoice·DateField·ConsentField
components/Landing.tsx · TrainingIntro.tsx · Done.tsx · SurveyDone.tsx
scripts/sheet-header.mjs     두 탭의 헤더 행 출력
tests/*.test.ts(x)           Vitest
tests/e2e/*.spec.ts · tests/e2e/fake-services.mjs   Playwright + 가짜 슬랙·시트
README.md                    설정·운영 안내
```

---

### Task 1: 프로젝트 뼈대와 설정 모듈

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.mts`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`(임시), `content/shop.ts`, `lib/config.ts`, `instrumentation.ts`, `tests/setup.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `lib/config.ts` — `slackWebhookUrl(): string`, `sheetId(): string`, `serviceAccount(): { clientEmail: string; privateKey: string }`(base64 JSON 을 풀어 `client_email`·`private_key` 를 꺼냄). 없거나 비면 변수 **이름**만 담아 `Error`.
- Produces: `content/shop.ts` — `export const shop = { name: 'Hiss Haus', nameKo: '히스하우스', address: string, hours: string, deposit: '10,000원 입금 시 확정', heroImage: '/hero.jpg', ogTitle: '히스하우스 예약 신청', ogDescription: string, privacyRetention: '1년' }` (주소·영업시간은 자리 표시 문자열).
- Produces: CSS 토큰 `--ink`, `--mute`, `--line`, `--accent`, `--accent-ink`, `--bg`, `--radius`.

- [ ] **Step 1: 저장소 첫 커밋** — 설계·문항·계획 문서만 `git add docs && git commit -m "docs: 히스하우스 예약 신청서 웹 설계·문항·계획"`.
- [ ] **Step 2: `pnpm init` 뒤 의존성 설치** — `pnpm add next@16.3.6 react@19.3.0 react-dom@19.3.0 pretendard@1.3.9 google-auth-library` 와 `pnpm add -D typescript vitest@5.0.2 jsdom@30.1.1 @vitejs/plugin-react@6.1.1 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/dom @types/node @types/react @types/react-dom @playwright/test@1.63.0`. `package.json` 의 `scripts`: `dev`(`next dev -p 3020`), `build`, `start`(`-p 3020`), `test`(`vitest run`), `e2e`(`playwright test`), `sheet:header`(`node scripts/sheet-header.mjs`). google-auth-library 는 설치된 정확한 버전으로 고정한다.
- [ ] **Step 3: `tsconfig.json`·`next.config.ts`·`vitest.config.mts`·`.gitignore`·`.env.example` 작성** — tsconfig 는 차곡노트 웹과 같은 strict 설정. `next.config.ts`: `poweredByHeader: false`, `agentRules: false`, `logging: { incomingRequests: false }`, `headers()` 로 `/apply/:path*`·`/survey/:path*`·`/api/:path*` 에 `Cache-Control: private, no-store`. vitest: jsdom, `tests/**/*.test.{ts,tsx}`, `setupFiles: ['tests/setup.ts']`. `.gitignore`: `node_modules`, `.next`, `.env*`, `!.env.example`, `test-results`, `.superpowers/`. `.env.example` 에 변수 셋 이름과 한 줄 설명(값 없음).
- [ ] **Step 4: 실패 테스트 작성** `tests/config.test.ts`
  - `SLACK_WEBHOOK_URL 을 읽는다`, `GOOGLE_SHEET_ID 를 읽는다`
  - `GOOGLE_SERVICE_ACCOUNT_JSON 의 base64 를 풀어 client_email 과 private_key 를 돌려준다` — `btoa(JSON.stringify({client_email:'a@b', private_key:'-----BEGIN…'}))` 를 넣고 `serviceAccount()` 가 `{clientEmail:'a@b', privateKey:'-----BEGIN…'}`.
  - `test.each([['없으면', undefined], ['비어 있으면', '']])` 로 세 함수가 변수 이름을 담아 던진다.
- [ ] **Step 5: 실패 확인** — `pnpm test tests/config.test.ts` → 모듈 없음으로 FAIL.
- [ ] **Step 6: `lib/config.ts`·`instrumentation.ts` 구현** — `register()` 가 세 함수를 한 번씩 부른다.
- [ ] **Step 7: 테스트 통과 확인** — `pnpm test tests/config.test.ts` → PASS.
- [ ] **Step 8: `app/layout.tsx`·`app/globals.css`·`app/page.tsx`(임시 "히스하우스")·`content/shop.ts`·`tests/setup.ts` 작성** — layout 은 차곡노트 웹처럼 Pretendard subset 400·600·700 을 `node_modules/pretendard/dist/web/static/woff2-subset/` 에서 싣고 `<html lang="ko">`. `metadata.title` 은 `shop.ogTitle`. viewport `width=device-width, initialScale 1`. globals: `body { max-width: 480px; margin: 0 auto; }`, 토큰, 글자 16px(폰 입력 확대 방지).
- [ ] **Step 9: 빌드 확인** — `.env.local` 에 더미 값 셋을 넣고 `pnpm build` → 성공. (`.env.local` 은 커밋하지 않는다.)
- [ ] **Step 10: 커밋** — `chore: Next.js 뼈대·설정 모듈·글꼴·토큰`.

---

### Task 2: 문항 정의 형·신청서 정의·규칙·검증

**Files:**
- Create: `forms/types.ts`, `forms/apply.ts`, `forms/rules.ts`, `lib/validate.ts`, `lib/id.ts`
- Test: `tests/apply-form.test.ts`, `tests/validate.test.ts`, `tests/id.test.ts`

**Interfaces:**
- Produces `forms/types.ts`:
  ```ts
  export type QuestionType = 'short' | 'long' | 'email' | 'phone' | 'single' | 'multi' | 'date' | 'consent'
  export interface Question {
    id: string; label: string; type: QuestionType; required: boolean
    hint?: string                       // 질문 아래 안내문(원문 그대로)
    options?: string[]                  // single·multi
    other?: boolean                     // "기타: (직접 입력)" 선택지 있음
    showIf?: { questionId: string; equals: string }          // 앞 문항이 이 값일 때만 보임
    optionalIfOnly?: { questionId: string; value: string }   // 앞 문항이 그 값만 골랐으면 필수 해제·숨김
    blockIf?: { value: string; message: string }             // 이 값이면 진행 차단(해요체 안내)
    consentText?: string                // consent 유형의 본문
  }
  export interface Group { id: string; title: string; note?: string; questions: Question[] }
  export interface FormDef { id: 'apply' | 'survey'; title: string; groups: Group[] }
  export type Answer = string | string[]
  export type Answers = Record<string, Answer>
  ```
  `multi` 답은 `string[]`, 그 밖은 `string`. "기타" 를 골랐을 때 값은 `'기타: ' + 입력`(single 은 그 문자열 하나, multi 는 배열 원소 하나). `consent` 의 동의 값은 `'동의'`. `date` 값은 `YYYY-MM-DD`.
- Produces `forms/rules.ts`: `isVisible(q: Question, a: Answers): boolean`, `isRequired(q: Question, a: Answers): boolean`(보이지 않으면 false), `blockedBy(group: Group, a: Answers): { questionId: string; message: string } | null`, `allQuestions(form: FormDef): Question[]`.
- Produces `lib/validate.ts`: `export interface FieldError { questionId: string; message: string }` · `validateGroup(group: Group, a: Answers, today: string): FieldError[]` · `validateForm(form: FormDef, a: Answers, today: string): FieldError[]`. 메시지(해요체): 필수 비움 `'꼭 적어 주세요'`(선택형은 `'하나를 골라 주세요'`, 복수는 `'하나 이상 골라 주세요'`), 길이 초과 `'200자까지 적을 수 있어요'`/`'3,000자까지 적을 수 있어요'`, 선택지 밖 값 `'고를 수 없는 값이에요'`, 날짜 형식 `'날짜를 골라 주세요'`, 오늘 이전 `'오늘 이후 날짜를 골라 주세요'`, 연락처(숫자·하이픈·공백 외 문자 또는 숫자 9자 미만) `'연락처를 다시 확인해 주세요'`, 이메일(`@` 없음) `'이메일을 다시 확인해 주세요'`, 동의 안 함 `'동의해야 신청할 수 있어요'`. 보이지 않는 문항은 검사하지 않고, `blockIf` 에 걸리면 그 메시지를 낸다.
- Produces `lib/id.ts`: `newSubmissionId(): string`(영숫자 10자, `crypto.getRandomValues`), `isSubmissionId(v: unknown): v is string`.
- Produces `forms/apply.ts`: `export const applyForm: FormDef` — 묶음 셋:
  - `guardian`(제목 `보호자`): `guardian_name`(short, 필수, 라벨 `보호자 성함`), `guardian_phone`(phone, 필수, `보호자 연락처`), `privacy_consent`(consent, 필수, 라벨 `개인정보 수집·이용 동의`, consentText 는 수집 항목(보호자 성함·연락처, 반려견 정보)·목적(예약 상담·안내)·보유 기간 `shop.privacyRetention` 을 해요체로 쓴 세 줄).
  - `pet`(제목 `반려견`): `pet_name`·`pet_breed`·`pet_age`·`pet_weight`(short, 필수), `pet_sex`(single `남`/`여`), `pet_neutered`(single `O`/`X`, 라벨 `반려견 중성화 여부`), `pet_vaccinated`(single `O`/`X`, `예방접종 유무`), `pet_health`(long, 필수, `질병, 질환 등 건강상태에 대해 알려주세요.`), `pet_treatment`(long, 필수, `최근 수술 또는 치료 이력이 있으면 알려주세요.`), `pet_aggression`(single 필수, 라벨 `사람이나 다른 강아지에 대한 공격성 여부`, options `O`/`X`, hint `심한 경우 이용에 제한이 있을 수 있어요`).
  - `visit`(제목 `희망 일시·서비스`, note `원하는 날짜와 시간대를 알려 주시면 가능한지 확인하고 연락드려요. 안 맞으면 함께 조율해요.`): `wish1_date`(date 필수 `희망 날짜 1순위`), `wish1_slot`(single 필수, options `오전`/`오후`/`상관없어요`, 라벨 `시간대`), `wish2_date`(date 선택 `희망 날짜 2순위`), `wish2_slot`(single 선택, 같은 options, 라벨 `시간대`; `requiredIf: { questionId: 'wish2_date' }` — 2순위 날짜가 있으면 필수. 실행 중 판정: 처음엔 `validateGroup` 특례였으나 화면의 '선택' 표시와 어긋나 문항 정의로 옮김), `services`(multi 필수, options `Grooming 미용`/`Daycare 데이케어`/`Hotel 호텔`/`교육미용 / 미용 트레이닝 상담`), `visit_type`(single 필수, `첫 방문`/`재방문`, 라벨 `히스하우스 방문 여부`).
  - 상수 `export const TRAINING_SERVICE = '교육미용 / 미용 트레이닝 상담'`.

- [ ] **Step 1: 실패 테스트** `tests/apply-form.test.ts` — `신청서는 묶음 셋이고 문항 id 가 겹치지 않는다`, `희망 날짜 1순위와 시간대는 필수고 2순위는 선택이다`, `서비스 선택지에 교육미용 상담이 있다`(`TRAINING_SERVICE` 포함).
- [ ] **Step 2: 실패 테스트** `tests/validate.test.ts` — 신청서로:
  - `필수를 비우면 문항마다 오류가 난다`(빈 답 → `guardian_name`·`guardian_phone`·`privacy_consent` 오류, 메시지 `꼭 적어 주세요`/`동의해야 신청할 수 있어요`)
  - `연락처에 글자가 섞이면 거부한다`(`'010-abcd'`), `하이픈 없는 11자리는 통과한다`
  - `짧은 답 201자는 거부하고 200자는 통과한다`, `긴 답 3001자는 거부한다`
  - `선택지에 없는 값은 거부한다`(`pet_sex: '기타'`)
  - `희망 날짜가 오늘 이전이면 거부한다`(today `2026-10-23`, `wish1_date: '2026-10-22'`), `형식이 틀리면 거부한다`(`'10/28'`), `오늘은 통과한다`
  - `2순위 날짜가 있으면 시간대도 있어야 한다`
  - `복수 선택이 빈 배열이면 거부한다`
  - 규칙용 가짜 FormDef 로: `showIf 가 안 맞으면 보이지 않고 검사하지 않는다`, `optionalIfOnly 가 맞으면 필수가 풀린다`, `blockIf 값이면 그 메시지를 낸다`.
- [ ] **Step 3: 실패 테스트** `tests/id.test.ts` — `영숫자 10자를 만든다`, `형식이 다르면 거짓`(`'abc'`, `'abcdefghij!'`, 숫자 123).
- [ ] **Step 4: 실패 확인** — `pnpm test` → FAIL.
- [ ] **Step 5: 구현** — `forms/types.ts`, `forms/rules.ts`, `forms/apply.ts`, `lib/validate.ts`, `lib/id.ts`.
- [ ] **Step 6: 통과 확인** — `pnpm test` → PASS.
- [ ] **Step 7: 커밋** — `feat: 문항 정의 형·신청서 정의·검증 규칙`.

---

### Task 3: 검사지 정의(98문항 원문)

**Files:**
- Create: `forms/survey.ts`
- Test: `tests/survey-form.test.ts`

**Interfaces:**
- Produces: `export const surveyForm: FormDef` — 묶음 12개(문항 문서의 A~L. F 의 제목은 `식사·간식·영양제`). 문항 id 는 `q1`…`q98`. 질문·선택지·안내문(`hint`)은 문항 문서 제2부에서 **글자 그대로** 옮긴다. 유형: 문서의 단답→`short`, 장문·장문(추정)→`long`, 단일→`single`, 복수→`multi`, `q1`→`email`, `q4`→`phone`. "기타: (직접 입력)" 은 options 에서 빼고 `other: true`. 규칙: `q2.blockIf = { value: '동의하지 않음 (서비스 이용 불가)', message: '동의하지 않으면 검사지를 진행할 수 없어요' }`; `q50.showIf = {q49,'예'}`, `q60.showIf = {q59,'네'}`, `q62.showIf = {q61,'네'}`, `q82.showIf = {q81,'네'}`; `q84`·`q85` 에 `optionalIfOnly = { questionId: 'q83', value: '없음' }`. 묶음 K 의 `note` 는 원문 안내 그대로. 원문 Q45·Q17 의 예시 문구는 구글폼 원본을 열어 `hint` 에 그대로 넣는다.

- [ ] **Step 1: 실패 테스트** `tests/survey-form.test.ts`
  - `검사지는 98문항이고 id 가 q1~q98 로 빠짐없다`
  - `묶음은 12개다`
  - `원문의 오타를 고치지 않았다` — `q43.label === '영영제를 급여하고 있습니까?'`, `q56.label` 에 `'편균'` 포함, `q71.options` 에 `'훈현소를 다녀봤고 수료했다.'`, `q83.options` 에 `'반려견 목욖을 한다'`, `q21.hint` 에 `'b에서 12개'`
  - `필수 표시가 원문과 같다` — 선택 문항 집합 `{31,32,44,46,47,48,50,60,62,63,70,76,78,81,82,86,87,88,89,90,91,92,93,94,95}` 만 `required: false`
  - `q83 에서 없음만 고르면 q84·q85 가 필수가 아니다`(`isRequired` 로), `없음과 다른 것을 같이 고르면 필수다`
  - `q2 에서 동의하지 않음을 고르면 진행이 막힌다`(`blockedBy`)
  - `q50·q60·q62·q82 는 앞 문항이 네/예일 때만 보인다`
  - `기타가 있는 문항은 other 가 참이고 options 에 기타가 없다`(q14·q16·q27·q29·q30·q33·q34·q50·q51·q55·q56·q63·q68·q69·q79·q83·q86·q92·q96·q97)
  - `q69 는 선택지 22개, q83 은 48개다`(기타 제외)
- [ ] **Step 2: 실패 확인** — `pnpm test tests/survey-form.test.ts` → FAIL.
- [ ] **Step 3: `forms/survey.ts` 작성** — 문항 문서를 위에서 아래로 옮긴다. 복사 뒤 문항 문서와 한 번 더 대조한다.
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 커밋** — `feat: 검사지 98문항 정의(원문 그대로)`.

---

### Task 4: 표시 형식·시트 행 변환

**Files:**
- Create: `lib/format.ts`, `lib/sheet-row.ts`, `scripts/sheet-header.mjs`
- Test: `tests/format.test.ts`, `tests/sheet-row.test.ts`

**Interfaces:**
- Produces `lib/format.ts`: `nowKst(): string`(`YYYY-MM-DD HH:mm:ss`, Asia/Seoul), `todayKst(): string`(`YYYY-MM-DD`), `dateKo(ymd: string): string`(`'2026-10-28'` → `'10월 28일 (화)'`), `maskPhone(p: string): string`(숫자만 남겨 가운데 4자리를 `****`, 예 `010-****-1234`; 10자리면 `010-***-1234`), `answerText(q: Question, a: Answers): string`(없으면 `''`, 배열은 `', '` 로, date 는 `dateKo`).
- Produces `lib/sheet-row.ts`: `export interface Meta { submissionId: string; receivedAt: string }` · `sheetHeader(form: FormDef): string[]`(`['접수 시각','신청 ID', ...라벨]`) · `sheetRow(form: FormDef, a: Answers, meta: Meta): string[]`(같은 길이, 빈 값은 `''`).
- `scripts/sheet-header.mjs`: 두 폼의 헤더를 탭 이름과 함께 탭 구분 텍스트로 출력(사용자가 시트 첫 줄에 붙인다). TypeScript 를 바로 못 읽으므로 `node --experimental-strip-types` 로 `forms/*.ts` 를 import 한다. (안 되면 `pnpm exec tsx` 를 devDependency 로 추가.)

- [ ] **Step 1: 실패 테스트** `tests/format.test.ts` — `dateKo 는 월·일·요일로 보여 준다`, `maskPhone 은 가운데를 가린다`(`'01012345678'`→`'010-****-5678'`, `'010-1234-5678'` 같음), `answerText 는 배열을 쉼표로 잇고 날짜를 한국어로 보여 준다`.
- [ ] **Step 2: 실패 테스트** `tests/sheet-row.test.ts` — `헤더는 접수 시각·신청 ID 뒤에 문항 라벨 순서다`(신청서 → 길이 `2 + 문항 수`), `행은 헤더와 길이가 같고 빈 답은 빈 칸이다`, `복수 선택은 쉼표로 잇는다`, `검사지 행도 100칸이다`.
- [ ] **Step 3: 실패 확인**, **Step 4: 구현**, **Step 5: 통과 확인**.
- [ ] **Step 6: `pnpm sheet:header` 가 두 탭 헤더를 출력하는지 눈으로 확인.**
- [ ] **Step 7: 커밋** — `feat: 표시 형식·시트 행 변환·헤더 스크립트`.

---

### Task 5: 슬랙 메시지 생성(분할·이스케이프)

**Files:**
- Create: `lib/slack-blocks.ts`
- Test: `tests/slack-blocks.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Block = { type: 'header'; text: { type: 'plain_text'; text: string } }
    | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
    | { type: 'context'; elements: { type: 'mrkdwn'; text: string }[] }
    | { type: 'divider' }
  export interface SlackMessage { text: string; blocks: Block[] }   // text 는 알림 미리보기용 한 줄
  export const SECTION_LIMIT = 3000, BLOCKS_LIMIT = 50, MESSAGE_BYTES_LIMIT = 30_000
  export function escapeMrkdwn(s: string): string           // & < > → &amp; &lt; &gt;
  export function applyMessages(a: Answers, meta: Meta): SlackMessage[]
  export function surveyMessages(a: Answers, meta: Meta & { applyId?: string }): SlackMessage[]
  export function cancelTrainingMessage(p: { petName: string; guardianName: string; submissionId: string }): SlackMessage
  ```
  - 공통 `buildMessages(form, a, meta, headerText, firstContext?)`: 머리글 블록 → 묶음마다 `divider` + 묶음 제목 섹션(`*제목*`) + 문항 줄들(`*라벨*\n답`, 빈 답은 `—`) 을 섹션 텍스트에 `\n\n` 로 이어 붙이되 3,000자에 닿으면 새 섹션. 한 줄이 혼자 3,000자를 넘으면 답을 글자 단위로 잘라 여러 섹션에 나눈다(잘리지 않게). 블록 50개 또는 JSON 30,000바이트에 닿으면 새 메시지. 둘 이상이면 머리글에 ` (k/N)`. 마지막 메시지 끝 `context`: `신청 ID {id} · {receivedAt}`.
  - 신청서 머리글 `🐾 새 예약 신청 — {pet_name} ({guardian_name})`, 알림 한 줄 `text` 는 `새 예약 신청: {pet_name} ({guardian_name}) · {services} · {wish1}`.
  - 검사지 머리글 `📋 행동 분석 검사지 — {q7} ({q3})`; `applyId` 가 있으면 머리글 다음 섹션에 `예약 신청 {applyId}의 검사지예요`.
  - 취소 메시지 `↩️ {petName} ({guardianName}) 보호자가 교육미용 선택을 취소했어요 (신청 {submissionId})`.

- [ ] **Step 1: 실패 테스트** — `신청서는 메시지 한 통이고 머리글에 반려견·보호자 이름이 있다`, `모든 문항 라벨이 본문에 있다`, `특수문자를 이스케이프한다`(`'<b>&'` → `'&lt;b&gt;&amp;'`), `3,000자 긴 답은 잘리지 않고 다음 섹션으로 넘어간다`(답 2,990자 + 라벨 → 두 섹션에 나뉘고 합치면 원문 그대로), `검사지는 블록 50개를 넘기면 다음 통으로 가고 머리글에 (k/N) 이 붙는다`(98문항 긴 답으로 채움), `어느 섹션도 3,000자를 넘지 않고 어느 메시지도 블록 50개·30,000바이트를 넘지 않는다`, `마지막 통에 신청 ID 와 시각이 있다`, `applyId 가 있으면 첫 통에 적는다`, `취소 메시지 문구`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: 통과 확인**.
- [ ] **Step 5: 커밋** — `feat: 슬랙 메시지 생성 — 분할·이스케이프·취소 알림`.

---

### Task 6: 슬랙 전송·시트 추가·제출 순서

**Files:**
- Create: `lib/slack.ts`, `lib/sheets.ts`, `lib/submit.ts`
- Test: `tests/slack.test.ts`, `tests/sheets.test.ts`, `tests/submit.test.ts`

**Interfaces:**
- `lib/slack.ts`: `sendSlack(messages: SlackMessage[], deps?: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> }): Promise<void>` — `slackWebhookUrl()` 로 순서대로 POST(JSON), 두 통째부터 앞에 `sleep(1000)`. 응답이 2xx 가 아니면 `Error('slack')` (본문·주소 없이).
- `lib/sheets.ts`: `appendRow(tab: '예약신청' | '검사지', row: string[], deps?: { fetch?: typeof fetch; token?: () => Promise<string> }): Promise<void>` — 토큰은 `google-auth-library` 의 `JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })` 로 `getAccessToken()`; URL `https://sheets.googleapis.com/v4/spreadsheets/{sheetId}/values/{encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`; 본문 `{ values: [row] }`. 2xx 아니면 `Error('sheets')`.
- `lib/submit.ts`:
  ```ts
  export type SubmitResult = { status: 'ok' } | { status: 'invalid'; errors: FieldError[] } | { status: 'failed' }
  export async function submitApply(body: unknown, deps?: Deps): Promise<SubmitResult>
  export async function submitSurvey(body: unknown, deps?: Deps): Promise<SubmitResult>
  export async function cancelTraining(body: unknown, deps?: Deps): Promise<SubmitResult>
  ```
  body 형: `{ submissionId: string; answers: Answers; website?: string }`(허니팟 `website`; 검사지는 `applyId?: string` 추가; 취소는 `{ submissionId, petName, guardianName }`). 순서: 허니팟에 값 → `{status:'ok'}` 로 조용히 끝. ID 형식·`validateForm(form, answers, todayKst())` → `invalid`. `appendRow` 실패 → `failed`. `sendSlack` 실패 → `ok` + `console.error('슬랙 전송 실패', submissionId)`. `Deps = { appendRow?, sendSlack?, now?: () => string }`.

- [ ] **Step 1: 실패 테스트** `tests/slack.test.ts` — 가짜 fetch 로 `메시지 수만큼 POST 하고 사이에 1초 쉰다`(sleep 호출 횟수 = 통 수 − 1), `2xx 가 아니면 던지되 메시지에 주소가 없다`.
- [ ] **Step 2: 실패 테스트** `tests/sheets.test.ts` — 가짜 fetch·가짜 token 으로 `한글 탭 이름을 따옴표로 감싸 인코딩한 URL 로 append 한다`(URL 에 `encodeURIComponent("'예약신청'!A1")` 포함, `Authorization: Bearer tok`), `본문은 values 에 행 하나다`, `2xx 가 아니면 던진다`.
- [ ] **Step 3: 실패 테스트** `tests/submit.test.ts` — `허니팟에 값이 있으면 아무것도 보내지 않고 ok`, `ID 형식이 틀리면 invalid`, `필수가 비면 invalid 와 오류 목록`, `시트 실패면 failed 이고 슬랙을 부르지 않는다`, `슬랙 실패여도 ok 이고 로그에 ID 만 남는다`(`console.error` 스파이 인자에 답변 문자열 없음), `성공하면 시트 한 줄 뒤 슬랙 메시지가 간다`(호출 순서), `검사지는 검사지 탭에 쓴다`, `취소는 시트를 건드리지 않고 슬랙 한 통만 보낸다`.
- [ ] **Step 4: 실패 확인**, **Step 5: 구현**, **Step 6: 통과 확인**.
- [ ] **Step 7: 커밋** — `feat: 슬랙 전송·시트 추가·제출 순서`.

---

### Task 7: API 경로

**Files:**
- Create: `app/api/apply/route.ts`, `app/api/survey/route.ts`, `app/api/apply/cancel-training/route.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- 세 파일 모두 `export const maxDuration = 30`, `export const runtime = 'nodejs'`, `export async function POST(req: Request): Promise<Response>`. JSON 아니면 400. `SubmitResult` → `ok` 200 `{ ok: true }`, `invalid` 400 `{ ok: false, errors }`, `failed` 503 `{ ok: false }`. 응답 헤더 `Cache-Control: no-store`. 요청 본문을 로그에 찍지 않는다.
- 제출 함수는 모듈 스코프에서 `lib/submit` 을 import 하고, 테스트는 `vi.mock('../lib/submit')` 로 바꾼다.

- [ ] **Step 1: 실패 테스트** `tests/api.test.ts` — 세 경로에 대해 `JSON 이 아니면 400`, `ok 면 200`, `invalid 면 400 과 오류 목록`, `failed 면 503`, `maxDuration 이 30 이다`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: 통과 확인**.
- [ ] **Step 5: 커밋** — `feat: 제출 API 경로 셋`.

---

### Task 8: 초안·세션 저장(localStorage)

**Files:**
- Create: `lib/draft.ts`
- Test: `tests/draft.test.ts`

**Interfaces:**
```ts
export interface Draft { answers: Answers; groupIndex: number; submissionId: string }
export function loadDraft(formId: 'apply' | 'survey'): Draft | null
export function saveDraft(formId, d: Draft): void
export function clearDraft(formId): void
export interface ApplySession { submissionId: string; guardianName: string; guardianPhone: string; petName: string; services: string[]; wish1: string; training: boolean; surveyDone: boolean }
export function loadSession(): ApplySession | null
export function saveSession(s: ApplySession): void
export function clearSession(): void
```
키 `hh.draft.apply`, `hh.draft.survey`, `hh.session`. 모든 함수는 `localStorage` 접근을 `try/catch` 로 감싸고 실패하면 `null`/무시. JSON 이 깨져 있으면 `null`.

- [ ] **Step 1: 실패 테스트** — `저장한 초안을 그대로 읽는다`, `없으면 null`, `지우면 null`, `깨진 JSON 이면 null`, `localStorage 가 던져도 예외가 새지 않는다`(`vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('nope') })` 뒤 `saveDraft` 가 던지지 않고 `loadDraft` 가 `null`), `세션도 같다`.
- [ ] **Step 2: 실패 확인**, **Step 3: 구현**, **Step 4: 통과 확인**.
- [ ] **Step 5: 커밋** — `feat: 초안·세션 localStorage 저장`.

---

### Task 9: 필드 컴포넌트와 StepForm

**Files:**
- Create: `components/fields/ShortField.tsx`, `LongField.tsx`, `SingleChoice.tsx`, `MultiChoice.tsx`, `DateField.tsx`, `ConsentField.tsx`, `components/fields/Field.module.css`, `components/StepForm.tsx`, `components/StepForm.module.css`
- Test: `tests/fields.test.tsx`, `tests/StepForm.test.tsx`

**Interfaces:**
- 필드 공통 props: `{ q: Question; value: Answer | undefined; error?: string; onChange(v: Answer): void }`. 라벨은 `<label htmlFor>` 로 연결(접근성·테스트 모두 `getByLabelText`). 오류는 `role="alert"` 문단. `SingleChoice`·`MultiChoice` 는 칩 모양 버튼(`role="radio"`/`role="checkbox"`, `aria-checked`) 이고 `other` 면 `기타` 칩을 고를 때 아래 한 줄 입력(placeholder `직접 적어 주세요`)이 열리며 값은 `'기타: ' + 입력`. `DateField` 는 `<input type="date" min={today}>`. `ConsentField` 는 체크 하나와 `consentText`. 긴 답은 `<textarea>` 자동 높이.
- `StepForm`:
  ```ts
  export interface StepFormProps {
    form: FormDef; initial: Draft; today: string
    submitLabel: string                     // 마지막 묶음 버튼 글자
    onDraft(d: Draft): void                 // 입력·묶음 이동마다
    onSubmit(answers: Answers): Promise<'ok' | 'invalid' | 'failed'>
    onBackFromFirst?(): void                // 첫 묶음에서 ‹
  }
  ```
  - 위: `‹` 버튼(aria-label `이전`) + 묶음 제목 + `k / N`. 진행 막대. 묶음 `note` 가 있으면 제목 아래.
  - 보이는 문항만 그린다(`isVisible`). 아래 고정 버튼은 `validateGroup` 이 비어야 활성. 비활성 상태에서 누르면 첫 오류 문항으로 `scrollIntoView` 하고 오류를 보여 준다(`showErrors` 상태). `blockedBy` 가 있으면 버튼 비활성 + 그 문항 아래 메시지.
  - 마지막이 아니면 버튼 `다음` → `groupIndex + 1`, `history.pushState({ group: k }, '')`; `popstate` 로 이전 묶음. `‹` 는 `history.back()`(첫 묶음이면 `onBackFromFirst`).
  - 마지막 묶음 버튼은 `submitLabel`; 누르면 `submitting` 상태(버튼 글자 `보내는 중…`, 비활성) → `onSubmit`. `'failed'` → 상단 `role="alert"` 에 `지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.`, 입력 유지. `'invalid'` → 서버 오류 목록을 그 문항에 표시(간단히 `showErrors`). `'ok'` → 부모가 화면을 바꾼다.
  - 데이터 속성 `data-group={group.id}`, 버튼 `data-action="next"|"submit"`.

- [ ] **Step 1: 실패 테스트** `tests/fields.test.tsx` — `단일 선택은 하나만 켜진다`, `복수 선택은 여러 개가 켜진다`, `기타를 고르면 입력이 열리고 값이 기타: 로 시작한다`, `날짜 입력은 오늘을 min 으로 가진다`, `오류가 있으면 alert 로 보인다`.
- [ ] **Step 2: 실패 테스트** `tests/StepForm.test.tsx` (신청서로) — `첫 묶음에서 필수를 비우면 버튼이 비활성이고 누르면 오류가 보인다`, `필수를 채우면 다음 묶음으로 가고 onDraft 가 불린다`, `이전을 누르면 앞 묶음으로 돌아가고 입력이 남아 있다`, `마지막 묶음 버튼은 submitLabel 이고 누르면 onSubmit 이 답 전체를 받는다`, `보내는 중에 두 번 누르면 onSubmit 은 한 번만 불린다`(첫 호출이 끝나지 않은 Promise), `failed 면 안내가 보이고 입력이 남는다`, `showIf 문항은 조건이 맞을 때만 그린다`(검사지 q49/q50 으로), `blockIf 면 버튼이 막히고 메시지가 보인다`(검사지 q2).
- [ ] **Step 3: 실패 확인**, **Step 4: 구현**, **Step 5: 통과 확인**.
- [ ] **Step 6: 커밋** — `feat: 필드 컴포넌트와 StepForm`.

---

### Task 10: 화면 연결 — 첫 화면·신청서·검사지 안내·완료·검사지

**Files:**
- Create: `components/Landing.tsx`(+`.module.css`), `components/TrainingIntro.tsx`, `components/Done.tsx`, `components/SurveyDone.tsx`, `components/ApplyFlow.tsx`('use client'), `components/SurveyFlow.tsx`('use client'), `app/apply/page.tsx`, `app/apply/training/page.tsx`, `app/apply/done/page.tsx`, `app/survey/page.tsx`, `app/survey/done/page.tsx`, `public/hero.jpg`(자리 표시 그림), `public/og.jpg`
- Modify: `app/page.tsx`(임시 → `Landing`), `app/layout.tsx`(OG 메타데이터)
- Test: `tests/screens.test.tsx`, `tests/ApplyFlow.test.tsx`

**Interfaces / 문구(그대로):**
- `Landing`: 위 `shop.name`, 큰 사진 `shop.heroImage`(alt `히스하우스 매장`), 제목 `예약 신청서`, 안내 두 문단 `이 신청서는 예약 확정이 아니에요. 신청서를 확인한 뒤 따로 연락드리고, 최종 안내를 받으면 예약이 확정돼요.` / `아이의 편안한 케어를 위해 충분히 상담한 뒤 예약을 진행해요.`, 정보 줄 `위치`·`영업시간`·`예약금`(소요 줄 없음), 고정 링크 버튼 `예약 신청하기` → `/apply`. 각 구역 `data-section="head|hero|intro|info|cta"`.
- `ApplyFlow`: `loadDraft('apply')` 없으면 `{answers:{}, groupIndex:0, submissionId:newSubmissionId()}`. (실행 중 판정: 처음엔 `clearSession()` 뒤에 시작했으나, 완료 화면에서 뒤로 가기만 해도 세션이 지워져 앞으로 가기 때 완료 화면이 튕겨서 지우지 않는다 — 세션은 다음 제출이 덮어쓴다.) `StepForm` 에 `submitLabel='신청하기'`, `onBackFromFirst` → `/`. `onSubmit`: `fetch('/api/apply', { method:'POST', body: JSON.stringify({ submissionId, answers, website: '' }) })` → 200 이면 `saveSession({...})`(`training = services.includes(TRAINING_SERVICE)`), `clearDraft('apply')`, `router.push(training ? '/apply/training' : '/apply/done')`; 400 → `'invalid'`; 그 밖·네트워크 → `'failed'`. 허니팟 `website` 는 StepForm 밖 숨은 입력(`aria-hidden`, `tabIndex=-1`, `autoComplete="off"`).
- `TrainingIntro`(세션 필요, 없으면 `/`): 제목 `심층 행동 분석 검사지를 이어서 작성해요`, 문단 `중간에 창을 닫아도 쓰던 자리가 저장돼요.`, 상자 `예약 신청은 여기서 먼저 접수돼요. 검사지를 다 못 써도 신청은 히스하우스에 전달돼요. 검사지는 나중에 같은 링크로 이어서 쓸 수 있어요.`, 버튼 `검사지 작성 시작` → `/survey`, 보조 버튼 `교육미용은 아니에요` → `POST /api/apply/cancel-training` `{ submissionId, petName, guardianName }` 뒤(실패해도) 세션 `training=false` 저장 → `/apply/done`.
- `Done`(세션 필요, 없으면 `/`): 제목 `신청이 접수되었어요`, 요약 `{petName} · {services.join(', ')} · {dateKo(wish1 날짜)} {시간대} 희망`, 상자 `다음 순서` 세 줄 `1. 히스하우스가 신청서를 확인하고 연락드려요` / `2. 날짜·시간을 맞춘 뒤 예약금 10,000원을 입금해 주세요` / `3. 입금이 확인되면 예약이 확정돼요`, 문단 `{maskPhone} 로 연락드려요.`, `training && !surveyDone` 이면 링크 `검사지 이어서 쓰기` → `/survey`.
- `SurveyFlow`: `loadDraft('survey')` 없으면 새 초안이되 세션이 있으면 `q3`←`guardianName`, `q4`←`guardianPhone`, `q7`←`petName` 미리 채움. `submitLabel='제출하기'`, `onSubmit` → `POST /api/survey` `{ submissionId, answers, applyId: session?.submissionId, website: '' }` → 200 이면 `clearDraft('survey')`, 세션 있으면 `surveyDone=true` 저장 → `/survey/done`. `onBackFromFirst` → 세션 있으면 `/apply/done`, 없으면 `/`.
- `SurveyDone`: 제목 `검사지가 접수되었어요`, 문단 `히스하우스가 내용을 확인하고 연락드려요.`
- `app/layout.tsx` metadata: `title: shop.ogTitle`, `description: shop.ogDescription`, `openGraph: { title, description, images: ['/og.jpg'] }`. robots 는 두지 않는다(색인 허용).
- `app/survey/page.tsx` 는 `/survey` 직접 열기도 지원(세션 없이).

- [ ] **Step 1: 실패 테스트** `tests/screens.test.tsx` — `첫 화면에 소요 시간 줄이 없다`(`queryByText(/소요|분/)` 없음, 정보 줄 셋), `첫 화면 문구에 "~입니다" 가 없다`(`container.textContent` 에 `입니다`·`됩니다` 없음), `검사지 안내에 문항 수가 없다`(`98` 없음), `완료 화면은 요약·다음 순서·가린 연락처를 보여 준다`, `교육미용이고 검사지를 안 썼으면 이어서 쓰기 링크가 있다`.
- [ ] **Step 2: 실패 테스트** `tests/ApplyFlow.test.tsx` — 가짜 `fetch` 와 가짜 `next/navigation` 으로: `제출 성공이면 세션을 저장하고 완료로 간다`, `교육미용을 골랐으면 검사지 안내로 간다`, `503 이면 failed 로 입력이 남는다`, `허니팟은 빈 값으로 간다`.
- [ ] **Step 3: 실패 확인**, **Step 4: 구현**, **Step 5: 통과 확인**.
- [ ] **Step 6: `pnpm build` 성공 확인.**
- [ ] **Step 7: 커밋** — `feat: 화면 연결 — 첫 화면·신청서·검사지 안내·완료·검사지`.

---

### Task 11: 실제 브라우저(e2e)와 가짜 슬랙·시트

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fake-services.mjs`, `tests/e2e/apply.spec.ts`, `tests/e2e/survey.spec.ts`
- Modify: `lib/config.ts`(선택 변수 `SHEETS_BASE_URL`·`SHEETS_FAKE_TOKEN`), `lib/sheets.ts`(그 둘을 씀), `tests/config.test.ts`(선택 변수는 없어도 던지지 않는다), `.env.example`

**Interfaces:**
- `fake-services.mjs`: 한 포트(3021)에서 `POST /slack` 은 본문을 메모리에 쌓고 200, `POST /v4/spreadsheets/:id/values/:range:append` 는 행을 쌓고 200, `GET /__state` 로 쌓인 것을 JSON 으로 준다, `POST /__reset`. 토큰 발급은 `lib/sheets.ts` 의 `deps.token` 을 쓸 수 없으므로 환경변수 `SHEETS_BASE_URL`(기본 `https://sheets.googleapis.com`) 과 `SHEETS_FAKE_TOKEN`(있으면 JWT 대신 이 값)을 `lib/config.ts`·`lib/sheets.ts` 에 추가한다 — 둘 다 선택 변수이고 `.env.example` 에 "테스트용" 이라 적는다.
- `playwright.config.ts`: `webServer` 둘(가짜 서비스, `next dev -p 3020` with `SLACK_WEBHOOK_URL=http://127.0.0.1:3021/slack`, `SHEETS_BASE_URL=http://127.0.0.1:3021`, `SHEETS_FAKE_TOKEN=t`, `GOOGLE_SHEET_ID=sheet`, `GOOGLE_SERVICE_ACCOUNT_JSON=<더미 base64>`), `devices['Pixel 7']`, `workers: 1`.

- [ ] **Step 1: 테스트 작성** `apply.spec.ts`
  - `신청서를 끝까지 쓰면 완료 화면이 뜨고 시트 한 줄·슬랙 한 통이 온다` — 필수 전부 채움, 완료 제목 확인, `/__state` 에 `예약신청` 행 1·슬랙 1, 슬랙 본문에 반려견 이름·`&lt;` 이스케이프 확인(이름에 `<` 넣음).
  - `교육미용을 고르면 검사지 안내로 가고 아니에요를 누르면 취소 알림이 온다` — 슬랙 2통째 본문에 `취소했어요`.
  - `폭 320 에서 가로 넘침이 없다` — `document.documentElement.scrollWidth <= 320`.
  - `브라우저 뒤로 가기는 이전 묶음으로 간다`.
  - `화면 어디에도 입니다 체가 없다` — 각 묶음의 `body.innerText` 에 `입니다`·`됩니다` 없음(검사지 원문 제외라 신청서만).
- [ ] **Step 2: 테스트 작성** `survey.spec.ts`
  - `검사지를 몇 묶음 쓰고 닫았다 열면 쓰던 묶음으로 돌아온다` — 묶음 셋 채우고 `page.reload()` → 제목이 4번째 묶음.
  - `q83 에서 없음만 고르면 q84·q85 없이 넘어간다`.
  - `q2 에서 동의하지 않음을 고르면 버튼이 막힌다`.
  - `끝까지 제출하면 검사지 탭에 한 줄, 슬랙은 한 통 이상이고 머리글에 반려견 이름이 있다`.
- [ ] **Step 3: 실행** — `pnpm exec playwright install chromium`(없으면) 뒤 `pnpm e2e` → 전부 PASS. 실패하면 화면 코드를 고친다(테스트를 느슨하게 하지 않는다).
- [ ] **Step 4: 커밋** — `test: 실제 브라우저 흐름과 가짜 슬랙·시트`.

---

### Task 12: 운영 문서와 마무리

**Files:**
- Create: `README.md`, `CLAUDE.md`
- Modify: `content/shop.ts`(사용자가 채울 자리 표시 주석)

- [ ] **Step 1: `README.md`** — 섹션: 무엇인지 한 문단 / 로컬 실행(`pnpm install`, `.env.local`, `pnpm dev`) / 슬랙 수신 웹훅 만들기(앱 생성 → Incoming Webhooks 켜기 → 채널 고르기 → URL 복사) / 구글 서비스 계정 만들기(Cloud 프로젝트 → Sheets API 켜기 → 서비스 계정 → JSON 키 → `base64 -i key.json | tr -d '\n'`) / 시트 만들기(탭 둘 이름 `예약신청`·`검사지`, `pnpm sheet:header` 출력을 첫 줄에 붙이기, 서비스 계정 이메일을 편집자로 공유, URL 의 ID) / Vercel(환경변수 셋, `maxDuration` 30 은 Hobby 에서 허용) / 매장 사진·정보 바꾸기(`public/hero.jpg`·`public/og.jpg`·`content/shop.ts`) / 테스트 셋 명령 / 알려진 제약(같은 기기에서만 이어 쓰기, 재시도 중복 행은 시트에서 ID 로 정리, Hobby 약관).
- [ ] **Step 2: `CLAUDE.md`** — 이 저장소 규칙 열 줄: 해요체, 검사지 원문 불변, 문항 수·소요 시간 금지, `process.env` 는 `lib/config.ts` 만, 로그 금지 항목, 폴더 목록, 명령 셋, 설계 문서 위치.
- [ ] **Step 3: 전체 검증** — `pnpm test`(전부 PASS 와 개수), `pnpm build`, `pnpm e2e` 를 다시 돌려 출력 확인.
- [ ] **Step 4: 커밋** — `docs: 운영 안내와 저장소 규칙`.
