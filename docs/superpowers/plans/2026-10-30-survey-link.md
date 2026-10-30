# 검사지 링크 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검사지를 사장님이 보낸 신청별 서명 링크로만 열리게 하고, 제출하면 그 링크를 닫는다.

**Architecture:** 서버만 아는 비밀값으로 신청 ID 에 HMAC 서명을 붙인 링크(`/survey/{신청ID}-{서명}`)를 만든다. 검사지 화면(서버 컴포넌트)과 제출 API 가 링크를 확인하고, 시트 검사지 탭의 ID 열을 읽어 이미 냈는지 본다. 신청 직후 검사지로 이어지던 길(첫 화면 카드·검사지 안내·완료 화면 버튼)은 지운다.

**Tech Stack:** Next.js 16 App Router · TypeScript · node:crypto · Vitest · Playwright

**Spec:** `docs/superpowers/specs/2026-10-30-survey-link-design.md`

## Global Constraints

- 응답·주석·테스트 이름은 한국어. 화면 문구는 해요체. 검사지 문항(`forms/survey.ts`)의 글자는 바꾸지 않는다.
- 커밋하지 않는다(CLAUDE.md: 사용자가 요청할 때만). 각 작업 끝은 테스트 통과까지다.
- `process.env` 는 `lib/config.ts` 에서만 읽는다. 로그는 `시트 저장 실패`/`슬랙 전송 실패` + 신청 ID 만.
- 시트 쓰기는 `valueInputOption=RAW` 그대로.
- 비밀값 `SURVEY_LINK_SECRET`: 필수, 32자 이상. 서명 = `HMAC-SHA256(secret, "survey:" + 신청ID)` 16진수 앞 32자(최종 리뷰로 base64url 22자에서 바꿈).
- 링크 주소 = `SITE_ORIGIN + BASE_PATH + "/survey/" + 신청ID + "-" + 서명`, `SITE_ORIGIN = 'https://chagocnote.com'`.
- 문구(스펙 그대로):
  - 확인 창: `제출하면 답을 고칠 수 없어요. 제출할까요?` 버튼 `다시 볼게요` / `제출하기`
  - `/survey`: 제목 `검사지는 받은 링크로 열어 주세요`, 본문 `심층 행동 분석 검사지는 교육미용 상담 예약금 입금이 확인된 뒤 카카오톡으로 링크를 보내 드려요.`
  - 닫힌 링크: 제목 `이미 제출된 검사지예요`, 본문 `고칠 내용이 있으면 카카오톡 채널로 알려 주세요.`
  - 검사지 완료: 제목 `검사지가 잘 도착했어요`, 본문 `상담 전에 꼼꼼히 읽어 볼게요. 고칠 내용이 있으면 카카오톡 채널로 알려 주세요.`
  - 신청 완료(교육미용): `5. 입금이 확인되면 카카오톡으로 검사지 링크를 보내 드려요`
  - 슬랙 단락: `📋 *검사지 링크* — 입금 확인 뒤 보내 주세요` + `\n` + 링크
  - 첫 화면 머리 안내: `신청서를 작성해 주세요.`

## Review Focus

1. 링크 없이 문항 글이 실리는 길 — `/survey/done` 이 `forms/survey.ts` 를 불러오면 누구나 문항 전체를 받는다. → Task 6 단위 테스트(SurveyDone 이 surveyForm 을 import 하지 않음) + Task 8 e2e(응답 본문 검사).
2. 응답을 못 받은 재시도 — 첫 제출이 시트에 들어갔는데 응답이 끊겨 다시 누름. 보호자는 완료 화면을 봐야 한다. → Task 3 테스트 '이미 낸 신청 ID 면 쓰지 않고 ok'.
3. 옛 흐름의 초안(신청 ID 없음·다른 신청 ID)이 남은 기기에서 링크를 엶 — 남의 답이 섞이면 안 된다. → Task 6 SurveyFlow 테스트.
4. 링크 모양이 깨진 값(빈 값, `-` 없음, 신청 ID 가 9자, 서명 길이 다름, 대소문자 바꿈) — 예외 없이 null. → Task 1 테스트.
5. 시트를 못 읽을 때 — 링크 화면은 검사지를 열고, 제출은 503. → Task 6(화면), Task 3(제출) 테스트.

---

### Task 1: 링크 서명과 비밀값

**Files:**
- Create: `lib/survey-link.ts`, `tests/survey-link.test.ts`
- Modify: `lib/config.ts`(함수 추가), `lib/base-path.ts`(`SITE_ORIGIN`), `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `config.surveyLinkSecret(): string` — 없으면 `환경 변수 SURVEY_LINK_SECRET 이 없다.`, 32자 미만이면 `환경 변수 SURVEY_LINK_SECRET 이 너무 짧다.`
  - `SITE_ORIGIN: string` (`lib/base-path.ts`)
  - `surveyToken(applyId: string, secret?: string): string` — `${applyId}-${sig}`
  - `applyIdOf(token: unknown, secret?: string): string | null`
  - `surveyUrl(applyId: string, secret?: string): string`
  - `secret` 기본값은 `surveyLinkSecret()`(e2e·스크립트가 직접 넘길 수 있게).

- [ ] **Step 1: 실패하는 테스트**
  - `surveyToken('Ab3dE5gH7j', S)` 가 `/^Ab3dE5gH7j-[A-Za-z0-9_-]{22}$/` 이고 두 번 불러도 같다.
  - `applyIdOf(surveyToken(id, S), S) === id`.
  - null: 다른 비밀값, 서명 한 글자 바꿈, 서명 대소문자 바꿈, 다른 신청 ID 에 남의 서명, `''`, `'Ab3dE5gH7j'`(서명 없음), 신청 ID 9자, 서명 21자·23자, 숫자 `123`, `undefined`.
  - `surveyUrl(id, S)` 가 `https://chagocnote.com/hisshaus/survey/${surveyToken(id, S)}`.
  - config: 값 읽기, 없음 오류, 31자 오류 메시지에 값이 없다.
- [ ] **Step 2:** `pnpm test tests/survey-link.test.ts tests/config.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현.** `createHmac('sha256', secret).update('survey:' + id).digest('base64url').slice(0, 22)`. 확인은 첫 `-` 로 나누고, 신청 ID 는 `isSubmissionId`, 길이가 다르면 바로 null, 같으면 `timingSafeEqual`.
- [ ] **Step 4:** 같은 명령 → PASS

### Task 2: 시트에서 검사지 신청 ID 읽기

**Files:**
- Modify: `lib/sheets.ts`, `tests/sheets.test.ts`, `tests/e2e/fake-services.mjs`

**Interfaces:**
- Produces: `surveySubmitted(applyId: string, deps?: SheetsDeps): Promise<boolean>` — `GET {base}/v4/spreadsheets/{id}/values/{encodeURIComponent("'검사지'!B:B")}`, 응답 `{ values?: string[][] }` 에 `row[0] === applyId` 가 있나. 토큰·네트워크·응답 오류·JSON 깨짐은 `Error('sheets')` 하나로(appendRow 와 같은 규칙, 같은 10초 제한, 같은 가짜 토큰 처리).
- 가짜 서비스: `GET /v4/spreadsheets/:id/values/:range` — 범위가 `'탭'!X:X` 꼴이면 그 탭에 append 된 행들의 X열(A=0)을 `{ values: [[v], ...] }` 로. 헤더 주석에 한 줄 추가.

- [ ] **Step 1: 실패하는 테스트** — 주소·Authorization·GET 확인, 있으면 true, 없거나 `values` 가 없으면 false, 4xx·던짐·깨진 JSON 은 `Error('sheets')` 이고 메시지에 토큰이 없다.
- [ ] **Step 2:** `pnpm test tests/sheets.test.ts` → FAIL
- [ ] **Step 3:** 구현(토큰 얻기는 appendRow 와 공유하는 작은 함수로 뺀다).
- [ ] **Step 4:** PASS

### Task 3: 검사지 제출 서버 — 링크·이미 냄·신청 ID

**Files:**
- Modify: `lib/submit.ts`, `lib/slack-blocks.ts`(`surveyMessages`), `tests/submit.test.ts`, `tests/slack-blocks.test.ts`, `tests/api.test.ts`, `lib/post.ts`(머리 주석)
- Delete: `app/api/apply/cancel-training/route.ts`, `cancelTraining`(submit.ts), `cancelTrainingMessage`(slack-blocks.ts)와 그 테스트들

**Interfaces:**
- Consumes: `applyIdOf`(Task 1), `surveySubmitted`(Task 2)
- Produces: `submitSurvey(body: unknown, deps?: Deps): Promise<SubmitResult>` — 본문 `{ token, answers, website }`. `Deps` 에 `surveySubmitted?: typeof surveySubmitted`, `secret?: string` 추가(테스트용).
- `surveyMessages(a, meta)` — `meta.submissionId` 가 곧 신청 ID 이므로 `applyId` 인자를 없애고 늘 `예약 신청 ${meta.submissionId}의 검사지예요` 단락.

- [ ] **Step 1: 실패하는 테스트**
  - 맞는 링크 → 시트 행의 2번째 칸이 링크의 신청 ID, 슬랙 첫 통에 `예약 신청 {ID}의 검사지예요`.
  - 링크 없음·틀림 → `invalid`, 시트·슬랙 안 부름.
  - 허니팟이 링크 확인보다 먼저(값이 있으면 링크가 틀려도 ok).
  - 이미 냄(`surveySubmitted` → true) → `ok`, appendRow·sendSlack 안 부름.
  - `surveySubmitted` 가 던짐 → `failed`, `console.error('시트 저장 실패', id)` 한 번, appendRow 안 부름.
  - 본문에 `submissionId`·`applyId` 를 넣어도 무시된다(행의 ID 는 링크의 것).
  - 신청서 제출(`submitApply`)은 지금과 같다.
- [ ] **Step 2:** `pnpm test tests/submit.test.ts tests/slack-blocks.test.ts tests/api.test.ts` → FAIL
- [ ] **Step 3: 구현.** `submitForm` 이 ID 를 몸통에서 꺼내던 부분을 호출하는 쪽이 넘기게 바꾼다(신청서: 본문 `submissionId`, 검사지: 링크의 신청 ID). 검사지는 시트 단계 안에서 `surveySubmitted` → true 면 바로 ok. cancel-training 경로·함수·메시지·테스트 삭제(api.test 의 ROUTES 에서 빠짐).
- [ ] **Step 4:** PASS

### Task 4: 신청 슬랙에 검사지 링크

**Files:**
- Modify: `lib/slack-blocks.ts`(`applyMessages`, `buildMessages` 에 `lastSection?`), `lib/submit.ts`(`submitApply`), 테스트 둘

**Interfaces:**
- Consumes: `surveyUrl`(Task 1)
- Produces: `applyMessages(a: Answers, meta: Meta, surveyLink?: string): SlackMessage[]` — 있으면 마지막 통의 context 블록 바로 앞에 `📋 *검사지 링크* — 입금 확인 뒤 보내 주세요\n{link}` 섹션.

- [ ] **Step 1: 실패하는 테스트** — 교육미용 신청이면 단락이 있고 링크가 `surveyUrl(신청ID, S)`, 아니면 없음. 단락은 context 블록 바로 앞. 블록 한도로 여러 통이 되어도 마지막 통에만 하나.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현. `submitApply` 는 `services` 에 `TRAINING_SERVICE` 가 있을 때만 `surveyUrl(meta.submissionId, deps.secret)` 을 넘긴다.
- [ ] **Step 4:** PASS

### Task 5: 제출 전 확인 창(StepForm)

**Files:**
- Modify: `components/StepForm.tsx`, `components/StepForm.module.css`, `tests/StepForm.test.tsx`

**Interfaces:**
- Produces: `StepFormProps.confirmSubmit?: string` — 있으면 마지막 묶음의 제출 버튼(오류 없음)이 바로 보내지 않고 창을 연다. 창: `role="alertdialog"`, `aria-modal="true"`, 글은 이 값, 버튼 `다시 볼게요`(`data-action="cancel-submit"`, 창만 닫음) · `제출하기`(`data-action="confirm-submit"`, 지금의 제출). 열리면 `다시 볼게요` 에 포커스, Esc 는 닫기, 닫으면 제출 버튼으로 포커스. 오류가 있으면 창 없이 지금처럼 오류로 간다. 실패(failed)·재검(invalid) 처리는 지금과 같다.

- [ ] **Step 1: 실패하는 테스트** — 창 열림·문구·포커스, 다시 볼게요는 onSubmit 안 부름, 제출하기는 onSubmit 한 번, Esc 닫힘, `confirmSubmit` 없으면 바로 onSubmit(기존 테스트 그대로 통과), 오류가 있으면 창이 안 열림.
- [ ] **Step 2:** `pnpm test tests/StepForm.test.tsx` → FAIL
- [ ] **Step 3:** 구현. 창은 화면 아래 고정 바텀시트 모양(배경 반투명), 기존 `.primary` 와 같은 버튼 모양. 다크 모드 토큰은 지금 CSS 가 쓰는 변수를 따른다.
- [ ] **Step 4:** PASS

### Task 6: 검사지 화면 — 링크로만

**Files:**
- Create: `app/survey/[token]/page.tsx`, `components/SurveyNotice.tsx`, `forms/survey-credit.ts`
- Modify: `app/survey/page.tsx`, `components/SurveyFlow.tsx`, `components/SurveyDone.tsx`, `forms/survey.ts`(credit 을 상수로), `next.config.ts`(헤더), `tests/SurveyFlow.test.tsx`, `tests/screens.test.tsx`, `tests/survey-form.test.ts`(필요하면)

**Interfaces:**
- Consumes: `applyIdOf`(Task 1), `surveySubmitted`(Task 2), `confirmSubmit`(Task 5), `/api/survey` 본문(Task 3)
- Produces:
  - `SURVEY_CREDIT = '출처: 어글리독'` (`forms/survey-credit.ts`), `surveyForm.credit = SURVEY_CREDIT`
  - `SurveyNotice({ kind: 'locked' | 'closed' })` — 서버 컴포넌트, 제목·본문(Global Constraints) + `KakaoLink` + `처음으로`(`/`)
  - `SurveyFlow({ applyId, token }: { applyId: string; token: string })`
  - `app/survey/[token]/page.tsx`: `dynamic = 'force-dynamic'`. `applyIdOf(token)` 가 null → `redirect('/survey')`. `surveySubmitted` true → `<SurveyNotice kind="closed" />`, 던지면 검사지를 연다. 아니면 `<SurveyFlow …/>`. og 메타데이터는 지금 `app/survey/page.tsx` 의 것을 옮긴다.
  - `app/survey/page.tsx`: `<SurveyNotice kind="locked" />`, 제목 메타 `히스하우스 검사지`(내 판단), og 없음(첫 화면 것을 물려받음).
  - `next.config.ts`: `/survey/:path*` 에 `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` 를 더한다(no-store 는 그대로).

- [ ] **Step 1: 실패하는 테스트**
  - SurveyFlow: 초안 없음 → 첫 묶음, 새 초안의 `submissionId`·`applyId` 가 링크의 신청 ID, 미리 채우기 없음. 같은 신청 ID 초안은 이어 씀. 다른 신청 ID·신청 ID 없는 초안은 버림. 첫 묶음 '이전' 이 막힘. 제출: 확인 창을 거쳐 `/hisshaus/api/survey` 에 `{ token, answers, website }`(submissionId·applyId 없음), ok → 초안 지우고 `router.replace('/survey/done')`. 세션은 읽지도 쓰지도 않는다.
  - SurveyNotice 두 종류 문구·버튼, 해요체(`입니다` 없음).
  - SurveyDone: 제목·본문·출처·버튼, 계좌·예약금 없음, 세션이 있든 없든 같다. `components/SurveyDone.tsx` 소스에 `forms/survey'` import 가 없다(파일을 읽어 확인).
  - `[token]` 페이지 함수: 틀린 링크 → `redirect` 가 `/survey` 로 불림(next/navigation 목), 닫힘 → closed, 읽기 실패 → SurveyFlow. (`surveySubmitted` 는 vi.mock)
  - 미리보기 메타: `[token]` 페이지가 지금의 og 제목·설명·그림.
- [ ] **Step 2:** `pnpm test` → 해당 테스트 FAIL
- [ ] **Step 3:** 구현. SurveyFlow 에서 세션·`?from=apply` 코드를 지운다.
- [ ] **Step 4:** `pnpm test` PASS, `pnpm exec tsc --noEmit` 통과

### Task 7: 신청 쪽 정리

**Files:**
- Modify: `components/Landing.tsx`, `components/ApplyFlow.tsx`, `components/Done.tsx`, `lib/draft.ts`(`surveyDone` 삭제), 테스트(`screens`, `ApplyFlow`, `draft`, `setup`)
- Delete: `components/TrainingIntro.tsx`, `app/apply/training/page.tsx`

**Interfaces:**
- Produces: `ApplySession` 에서 `surveyDone` 제거(`training` 은 남김). 저장된 옛 세션에 `surveyDone` 이 있어도 읽힌다.

- [ ] **Step 1: 실패하는 테스트** — 첫 화면에 양식 링크가 하나(`/apply`)뿐이고 `/survey` 링크가 없다, 머리 안내 `신청서를 작성해 주세요.`. 교육미용 신청도 `router.replace('/apply/done')`. 완료 화면: 교육미용이면 5번 줄이 있고 아니면 없다, '검사지 이어서 쓰기' 가 없다. 옛 세션(`surveyDone: true` 포함)도 읽힌다.
- [ ] **Step 2:** FAIL 확인
- [ ] **Step 3:** 구현, 지울 파일 삭제, 검사지 안내 테스트 삭제.
- [ ] **Step 4:** `pnpm test` PASS, `pnpm exec tsc --noEmit` 통과

### Task 8: e2e

**Files:**
- Modify: `playwright.config.ts`(env `SURVEY_LINK_SECRET`), `tests/e2e/fake.ts`(`E2E_SURVEY_SECRET`, `surveyPath(applyId?)`), `tests/e2e/fill.ts`(`submitSurvey` 가 확인 창의 제출하기까지 누름), `tests/e2e/survey.spec.ts`, `tests/e2e/apply.spec.ts`

**Interfaces:**
- Produces: `surveyPath(applyId = newSubmissionId()): string` → `/hisshaus/survey/${surveyToken(applyId, E2E_SURVEY_SECRET)}`

- [ ] **Step 1: 시나리오 고치기·더하기**
  - 기존 검사지 시나리오는 `surveyPath()` 로 연다. '검사지를 낸 뒤 완료 화면에서 뒤로 두 번' 은 신청 흐름이 없어졌으므로 '링크로 연 검사지를 낸 뒤 뒤로 가면 닫힌 안내' 로 바꾼다.
  - 새: 교육미용 신청 → `/apply/done` 에 5번 줄 → 슬랙 마지막 통에서 링크를 꺼내 경로만 열기 → 확인 창 '다시 볼게요' 는 그대로 → 제출하기 → 완료 → 시트 두 탭 ID 같음 → 같은 링크 다시 열면 `이미 제출된 검사지예요`.
  - 새: `/hisshaus/survey` 와 틀린 링크는 안내만(틀린 링크는 `/survey` 로 바뀐다). `/hisshaus`, `/hisshaus/apply`, `/hisshaus/survey`, 틀린 링크, `/hisshaus/survey/done` 에서 받은 모든 응답(document·script) 본문에 검사지 문항 글(예: q83 의 선택지 하나처럼 신청서에 없는 긴 글)이 없다.
  - 새: 검사지 응답 헤더에 `x-robots-tag`·`referrer-policy`.
  - apply.spec: 검사지 안내·취소 시나리오 삭제, 해요체 훑기에서 검사지 안내 빼기.
- [ ] **Step 2:** 개발 서버(3020)를 끄고 `pnpm e2e` → 모두 PASS

### Task 9: `pnpm survey:link`

**Files:**
- Create: `scripts/survey-link.mjs`
- Modify: `package.json`(`"survey:link": "tsx --env-file-if-exists=.env.local scripts/survey-link.mjs"`)

- [ ] **Step 1:** 인자로 신청 ID 를 받으면 형식 확인 뒤 `surveyUrl` 출력, 없으면 `newSubmissionId()` 로 만들어 `신청 ID {id}` 와 링크 출력. 형식이 틀리면 한 줄 안내 후 exit 1. 비밀값은 찍지 않는다.
- [ ] **Step 2:** `SURVEY_LINK_SECRET=$(openssl rand -base64 32) pnpm survey:link Ab3dE5gH7j` → 링크 한 줄, 틀린 ID → 안내와 종료 코드 1.

### Task 10: 문서와 마지막 확인

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `.env.example`, `docs/superpowers/specs/2026-10-23-hisshaus-form-design.md`

- [ ] **Step 1:** CLAUDE.md — 필수 변수 넷, 검사지는 링크로만(`lib/survey-link.ts`), 세션 규칙의 검사지 부분 정리, 코드가 직접 쓰는 id 목록에서 '검사지 미리 채우기' 삭제, 명령에 `pnpm survey:link`. README — 첫 문단 흐름, 비용 표의 Sheets 줄(읽기 분당 300건, 링크 열 때·제출 때 한 번씩), 변수 표·오류 설명·Vercel 단계에 새 변수, 운영 메모(슬랙 링크를 입금 확인 뒤 보낸다, 비밀값을 바꾸면 보낸 링크가 막힌다, `pnpm survey:link`). 기존 설계 문서의 바뀐 절 머리에 새 설계 문서를 가리키는 한 줄.
- [ ] **Step 2:** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build` 모두 통과.
- [ ] **Step 3:** 빌드 결과에서 문항 글이 든 JS 조각을 찾아(`grep -l` 로 `.next/static/chunks`), 그 조각을 가리키는 것이 검사지 링크 화면뿐인지 `.next/server/app` 의 매니페스트로 확인.
