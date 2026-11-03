# 교육미용 동의서 전자 서명 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사장님이 만든 동의서 PDF 를 보호자가 휴대폰·매장 아이패드에서 읽고 손가락으로 사인하면, 칸이 채워지고 사인이 찍힌 PDF 가 보관 메일함·보호자 메일함으로 가고 시트에 다시 만들 수 있는 기록이 남는다.

**Architecture:** 사장님 화면(`/admin`, 비밀번호 + 아이패드 잠금 PIN, 서명 쿠키)에서 묶음을 고르고 칸을 채우면 시트 '동의서' 탭에 '준비' 줄이 붙고 서명 링크(`/consent/{동의서 ID}-{서명}`)가 나온다. 보호자 화면은 원본 장 그림 위에 같은 좌표표로 값을 얹어 보여 주고, 제출하면 서버가 `pdf-lib` 로 원본 PDF 에 값·체크·사인(벡터 선)을 찍고 기록 페이지를 붙여 검증 → 시트('서명' 줄) → 메일(네이버 SMTP) → 슬랙 순서로 처리한다. 시트 '동의서' 탭은 줄만 붙이는 기록장(준비·취소·서명·메일)이고, 사인은 맨 끝 열에 있어 목록을 읽을 때는 빼고 읽는다.

**Tech Stack:** Next.js 16.3.6 App Router(서버 액션은 사장님 화면에만), TypeScript, Vitest 5, Playwright 1.63, `pdf-lib` + `@pdf-lib/fontkit`(한글은 이미 있는 `pretendard` 패키지의 `Pretendard-Regular.otf`), `nodemailer`.

**Spec:** `docs/superpowers/specs/2026-11-03-consent-signing-design.md`

## Global Constraints

- 응답·주석·테스트 이름·커밋 메시지는 한국어. 화면 문구는 해요체("~입니다/~십시오" 금지). 동의서 본문(PDF)은 사장님 문서 그대로.
- `process.env` 는 `lib/config.ts` 에서만 읽는다. `NEXT_PUBLIC_` 변수를 만들지 않는다.
- 로그(`console.*`)에는 `시트 저장 실패` / `슬랙 전송 실패` / `메일 전송 실패`(이번에 추가) 와 ID 만. 답·주소·사인·키·오류 객체는 찍지 않는다.
- 비밀값(메일 앱 비밀번호·사장님 비밀번호·PIN·링크 비밀값)을 코드·로그·문서·커밋에 남기지 않는다.
- 시트는 `valueInputOption=RAW` 로만 쓴다.
- 제출 순서는 검증 → 시트 → 메일 → 슬랙. 시트 실패는 실패로 답하고, 메일·슬랙 실패는 성공으로 답한다.
- 브라우저는 이 웹만 부른다(외부 스크립트·글꼴·분석 금지). npm 패키지를 번들에 넣는 것은 된다. 한글 글꼴 파일은 서버가 PDF 안에 넣을 때만 쓴다.
- `fetch`·`<img>` 주소에는 `BASE_PATH` 를 직접 붙인다. 쿠키 경로도 `BASE_PATH`.
- e2e 는 진짜 메일·시트·슬랙을 부르지 않는다(가짜 서비스 3031, 웹 3030, `reuseExistingServer: false`).
- 새 최상위 폴더를 만들지 않는다. `content/`·`public/` 에 새 파일을 둘 때는 하위 폴더 없이 둔다.
- 유료 기능을 쓰지 않는다. 문자 인증 없음. IP 는 기록하지 않는다.
- 출처 문구 `ⓒ 어글리독 All rights reserved` 는 서명 화면 맨 아래와 기록 페이지 맨 아래에만. 사장님 문서 장 위에는 찍지 않는다.
- 보관 기간 5년(서명일부터). 개인정보 안내에 적는다.
- PDF 크기: '일반 미용'·'교육 중단 미용 동의서' 묶음 300KB 안팎, 어느 묶음이든 1MB 이하.
- 묶음(사장님 결정, 순서 그대로): 행동수정 트레이닝 = 서약서·행동수정 계약서·안내사항 / 신뢰쌓기 = 서약서·신뢰쌓기 계약서·안내사항 / 그루밍 트레이닝 = 서약서·그루밍 트레이닝 계약서·안내사항 / 교육 중단 미용 동의서 = 5장 / 일반 미용 = 6장.
- 원본 PDF 는 `/Users/jangminseok/Downloads/HISS_HAUS_미용 동의서_숫자삭제.pdf`(3·4장 조판 숫자를 지운 판)와 `/Users/jangminseok/Downloads/HISS_HAUS_교육미용안내사항.pdf`.

## Review Focus

- **운영 배포에서 원본 PDF·글꼴 파일을 못 읽음** — `next dev` 에서는 되는데 Vercel 함수 묶음에 `content/*.pdf` 와 `.otf` 가 빠지면 서명마다 실패한다. Task 6 이 `outputFileTracingIncludes` 를 넣고 Task 10·12 가 빌드 산출물(`.nft.json`)에 파일이 들어갔는지 확인한다.
- **카톡 인앱 브라우저·아이패드에서 사인하면 화면이 같이 움직임** — 사인 칸에서 손가락을 끌면 그리기만 되고 페이지는 스크롤되지 않아야 한다. Task 5 가 `touch-action: none` 을 단언하고 Task 11 e2e 가 그린 뒤 `scrollY` 가 그대로인지 본다.
- **긴 글(수업 목표 200자, 긴 견종)이 PDF 칸을 넘침** — 칸 안에서 줄을 바꾸고 줄어들다(최소 7pt) 그래도 넘치면 `…` 로 자른다. Task 6 테스트가 긴 글로 만들어도 던지지 않고 칸 밖에 그리지 않는지 본다.
- **취소한 링크·이미 서명한 링크를 다시 엶** — 취소는 "열 수 없는 동의서예요", 서명함은 "이미 서명한 동의서예요". 같은 링크로 두 번 내도 기록·메일은 한 번. Task 10(제출)·Task 11(화면 e2e) 테스트.
- **아이패드를 건네받은 보호자가 뒤로 가기로 사장님 화면에 감** — 잠긴 동안 `/admin` 은 PIN 화면만, 서버 액션도 잠금이면 거부. Task 2·12 테스트.

---

### Task 1: 메일 보내기와 설정

**Files:**
- Modify: `lib/config.ts`, `package.json`, `tests/e2e/fake-services.mjs`, `tests/e2e/fake.ts`, `playwright.config.ts`
- Create: `lib/mail.ts`
- Test: `tests/mail.test.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `lib/config.ts`: `mailAddress(): string`(필수 `MAIL_ADDRESS`), `mailAppPassword(): string`(필수 `MAIL_APP_PASSWORD`), `adminPassword(): string`(필수 `ADMIN_PASSWORD`, 10자 미만이면 `환경 변수 ADMIN_PASSWORD 이 너무 짧다.`), `adminPin(): string`(필수 `ADMIN_PIN`, `/^\d{4}$/` 아니면 `환경 변수 ADMIN_PIN 이 4자리 숫자가 아니다.`), `isProduction(): boolean`, `mailFakeUrl(): string | undefined`(테스트 전용 `testOnly('MAIL_FAKE_URL')`). 값은 메시지에 넣지 않는다. `instrumentation.ts` 의 시작 확인에는 넣지 않는다(동의서 기능만 쓰는 변수라 나머지 화면을 막지 않는다).
  - `lib/mail.ts`: `interface Mail { to: string; subject: string; text: string; attachment?: { filename: string; content: Uint8Array } }`, `interface MailDeps { send?: (mail: Mail) => Promise<void> }`, `sendMail(mail: Mail, deps?: MailDeps): Promise<void>` — 실패하면 `Error('mail')` 만 던진다(원래 오류는 버린다).
  - 가짜 서비스: `POST /mail` 이 JSON `{ from, to, subject, text, attachment?: { filename, base64 } }` 을 쌓고, `/__state` 에 `mail` 배열, `/__reset` 이 비운다. `FakeState` 에 `mail: FakeMail[]`.

- [ ] **Step 1: 의존성** — `pnpm add -E nodemailer pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1` 과 `pnpm add -D -E @types/nodemailer`. (PDF 패키지는 Task 6 이 쓰지만 한 번에 넣는다.)

- [ ] **Step 2: 실패하는 테스트**

`tests/config.test.ts` 에 추가:
```ts
test('메일·사장님 변수를 읽고, 사장님 비밀번호는 10자 이상·PIN 은 4자리 숫자만 받는다', () => {
  vi.stubEnv('MAIL_ADDRESS', 'a@naver.com'); expect(mailAddress()).toBe('a@naver.com')
  vi.stubEnv('ADMIN_PASSWORD', 'short'); expect(adminPassword).toThrow('ADMIN_PASSWORD 이 너무 짧다')
  vi.stubEnv('ADMIN_PIN', '12a4'); expect(adminPin).toThrow('ADMIN_PIN 이 4자리 숫자가 아니다')
  vi.stubEnv('ADMIN_PIN', '0420'); expect(adminPin()).toBe('0420')
})
// 기존 '변수가 %s 이름을 담아 던진다' 표에 MAIL_ADDRESS·MAIL_APP_PASSWORD·ADMIN_PASSWORD·ADMIN_PIN 을 더한다.
// 기존 '테스트용 선택 변수' 표에 MAIL_FAKE_URL 을 더한다(운영에서는 undefined).
```
`tests/mail.test.ts`:
```ts
it('MAIL_FAKE_URL 이 있으면 가짜 서비스에 JSON 으로 보내고 첨부는 base64 다', ...)
  // fetch 를 바꿔 끼워: POST `${fake}/mail`, body.from === mailAddress(), body.attachment.base64 === Buffer.from(bytes).toString('base64')
it('보내기가 실패하면 원래 오류를 버리고 Error("mail") 만 던진다', ...)
  // send 가 new Error('smtp://user:pass@...') 로 거부 → rejects.toThrow(/^mail$/), 메시지에 'pass' 가 없다
it('주입한 send 를 그대로 쓴다', ...)
```

- [ ] **Step 3: 실패 확인** — `pnpm vitest run tests/config.test.ts tests/mail.test.ts` → FAIL(함수 없음).

- [ ] **Step 4: 구현** — 기본 `send` 는 `mailFakeUrl()` 이 있으면 `fetch(\`${url}/mail\`)`(타임아웃 10초), 없으면 `nodemailer.createTransport({ host: 'smtp.naver.com', port: 465, secure: true, auth: { user: mailAddress(), pass: mailAppPassword() }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })` 의 `sendMail({ from: mailAddress(), to, subject, text, attachments })`. 가짜 서비스에 `POST /mail` 을 더하고 `playwright.config.ts` 웹 서버 env 에 `MAIL_ADDRESS: 'archive@example.invalid'`, `MAIL_APP_PASSWORD: 'e2e-not-real'`, `MAIL_FAKE_URL: FAKE_URL`, `ADMIN_PASSWORD: 'e2e-admin-password'`, `ADMIN_PIN: '1234'` 를 넣는다(`tests/e2e/fake.ts` 에 `E2E_ADMIN_PASSWORD`·`E2E_ADMIN_PIN` 상수로 두고 config 가 읽는다).

- [ ] **Step 5: 통과 확인** — `pnpm vitest run tests/config.test.ts tests/mail.test.ts` → PASS. `pnpm exec tsc --noEmit` → 오류 없음.

- [ ] **Step 6: Commit** — `git commit -m "feat: 메일 보내기(네이버 SMTP)와 동의서용 설정 — 가짜 메일 서비스 포함"`

---

### Task 2: 사장님 로그인과 잠금(PIN)

**Files:**
- Create: `lib/admin-session.ts`, `lib/admin-guard.ts`, `app/admin/page.tsx`, `app/admin/actions.ts`, `components/AdminLogin.tsx`, `components/AdminUnlock.tsx`, `components/Admin.module.css`
- Modify: `next.config.ts`
- Test: `tests/admin-session.test.ts`, `tests/next-config.test.ts`

**Interfaces:**
- Consumes: Task 1 `adminPassword()`, `adminPin()`, `isProduction()`; 기존 `surveyLinkSecret()`.
- Produces:
  - `lib/admin-session.ts`: `interface AdminSession { exp: number; locked: boolean; fails: number }`, `SESSION_COOKIE = 'hh_admin'`, `SESSION_DAYS = 30`, `MAX_PIN_FAILS = 5`, `sealSession(s: AdminSession): string`, `openSession(raw: string | undefined, now?: number): AdminSession | null`, `checkPassword(given: unknown): boolean`, `checkPin(given: unknown): boolean`. 봉인은 `surveyLinkSecret()` 를 키로 `admin:` 용도 접두와 `ADMIN_PASSWORD` 의 sha256 앞 8자를 함께 넣은 HMAC — 비밀번호를 바꾸면 모든 기기가 로그아웃된다. 비교는 `timingSafeEqual`.
  - `lib/admin-guard.ts`(서버 전용, `next/headers`): `readSession(): Promise<AdminSession | null>`, `writeSession(s: AdminSession | null): Promise<void>`(쿠키 HttpOnly·SameSite=Lax·path=`BASE_PATH`·secure=`isProduction()`·maxAge 30일, null 이면 지움), `requireAdmin(): Promise<AdminSession>`(없거나 잠겼으면 `redirect('/admin')`).
  - 서버 액션(`app/admin/actions.ts`, `'use server'`): `login(prev: ActionState, form: FormData): Promise<ActionState>`, `logout(): Promise<void>`, `unlock(prev: ActionState, form: FormData): Promise<ActionState>`, `type ActionState = { error?: string }`.

- [ ] **Step 1: 실패하는 테스트** — `tests/admin-session.test.ts`:
```ts
it('봉인한 세션은 열리고, 한 글자만 바꿔도·만료가 지나도·비밀번호를 바꿔도 열리지 않는다', ...)
it('비밀번호·PIN 비교는 맞을 때만 참이고 문자열이 아니면 거짓이다', ...)
```
`tests/next-config.test.ts` 에: `/admin/:path*` 와 `/consent/:path*` 응답에 `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` 가 붙는다.

- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/admin-session.test.ts tests/next-config.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 세션 모듈·가드·액션·`next.config.ts` 헤더. `login` 은 틀리면 1초 기다린 뒤 `{ error: '비밀번호가 맞지 않아요' }`, 맞으면 `{ exp: now+30일, locked: false, fails: 0 }` 를 쓰고 `redirect('/admin')`. `unlock` 은 세션이 잠겨 있을 때만: 맞으면 `locked: false, fails: 0`, 틀리면 `fails+1` 로 다시 쓰고 `{ error: 'PIN 이 맞지 않아요' }`, `fails` 가 5 가 되면 쿠키를 지우고 `redirect('/admin')`(로그인 화면). `app/admin/page.tsx`(`dynamic = 'force-dynamic'`): 세션 없음 → `<AdminLogin/>`, 잠김 → `<AdminUnlock/>`, 아니면 Task 3·9 의 홈(지금은 제목 '사장님 화면' 과 로그아웃 버튼만). 문구: 로그인 제목 '사장님 화면', 칸 이름 '비밀번호', 버튼 '들어가기'; 잠금 제목 '잠겨 있어요', 안내 '사장님 PIN 4자리를 넣어 주세요.', 칸 `inputMode="numeric"`, 버튼 '풀기'.

- [ ] **Step 4: 통과 확인** — `pnpm vitest run tests/admin-session.test.ts tests/next-config.test.ts` → PASS.

- [ ] **Step 5: e2e** — `tests/e2e/admin.spec.ts`: 틀린 비밀번호는 '비밀번호가 맞지 않아요', 맞으면 '사장님 화면'·'로그아웃'. 쿠키를 지우면 다시 로그인 화면. (잠금은 Task 12 에서.) `pnpm e2e tests/e2e/admin.spec.ts` → PASS(개발 서버 3020 을 끄고).

- [ ] **Step 6: Commit** — `git commit -m "feat: 사장님 화면 로그인과 잠금 PIN — 서명 쿠키, 5번 틀리면 로그아웃"`

---

### Task 3: 메일 시험 보내기와 배포 확인(첫 마일스톤)

**Files:**
- Modify: `app/admin/page.tsx`, `app/admin/actions.ts`, `README.md`, `CLAUDE.md`
- Test: `tests/admin-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 `sendMail`, `mailAddress`; Task 2 `requireAdmin`.
- Produces: 서버 액션 `sendTestMail(): Promise<ActionState & { ok?: boolean }>` — `requireAdmin()` 뒤 `sendMail({ to: mailAddress(), subject: '[히스하우스] 메일 설정 시험', text: '이 메일이 보이면 동의서 사본을 보낼 수 있어요.' })`. 성공 `{ ok: true }`, 실패 `{ error: '메일을 보내지 못했어요. 네이버 메일 설정을 확인해 주세요.' }` + `console.error('메일 전송 실패', 'test')`.

- [ ] **Step 1: 실패하는 테스트** — `tests/admin-actions.test.ts` 에서 `sendMail`·`requireAdmin` 을 `vi.mock` 하고: 성공이면 `{ ok: true }` 이고 받는 주소가 `mailAddress()`, 실패면 에러 문구와 `console.error` 인자가 정확히 `['메일 전송 실패', 'test']`.
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/admin-actions.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 사장님 홈 아래에 '메일 시험 보내기' 버튼과 결과 한 줄('보냈어요. hisshaus 메일함을 확인해 주세요.' / 에러 문구).
- [ ] **Step 4: 문서** — README 변수 표에 `MAIL_ADDRESS`·`MAIL_APP_PASSWORD`·`ADMIN_PASSWORD`(10자 이상)·`ADMIN_PIN`(4자리) — 동의서 기능에만 필요, 없으면 사장님 화면·서명만 500. 비용 표에 '네이버 메일(SMTP)' 줄: 무료, 하루 발송 한도는 공개 숫자를 못 찾음, **메일함 용량이 유료로 바뀌는 지점**(한 건 크기 × 미용 건수 계산은 Task 6 뒤 채움). `CLAUDE.md`: 변수 줄에 동의서 변수 넷, 로그 규칙에 `메일 전송 실패`.
- [ ] **Step 5: 통과 확인** — `pnpm test` 전부 PASS, `pnpm exec tsc --noEmit`, `pnpm build`.
- [ ] **Step 6: Commit** — `git commit -m "feat: 사장님 화면에 메일 시험 보내기 — 운영에서 네이버 발송 확인용"`
- [ ] **Step 7: 사용자 확인(멈춤)** — 사용자에게 Vercel 에 `ADMIN_PASSWORD`(Secret)·`ADMIN_PIN`(Secret) 를 넣게 하고, 배포 뒤 사장님 화면에서 '메일 시험 보내기' → `hisshaus@naver.com` 수신 확인을 받는다. 실패하면 다음 Task 로 가지 않는다: Vercel 함수 지역을 서울(`icn1`, Settings → Functions)로 바꾸고 다시 시험한다. 그래도 실패하면 사용자에게 보고하고 멈춘다. 보낸메일함에도 남는지 함께 확인해 README 에 적는다.

---

### Task 4: 문서 정의 — 묶음·장·칸 좌표·장 그림

**Files:**
- Create: `content/consent-agreement.pdf`(숫자삭제 판 복사), `content/consent-guidelines.pdf`, `lib/consent-docs.ts`, `scripts/consent-pages.mjs`, `content/consent-text.ts`(스크립트 산출), `public/consent-v1-*.png`(스크립트 산출, 7장)
- Test: `tests/consent-docs.test.ts`

**Interfaces:**
- Produces (`lib/consent-docs.ts`):
  - `type PageId = 'agreement' | 'behavior' | 'trust' | 'groomingTraining' | 'unfinishedGrooming' | 'generalGrooming' | 'guidelines'`
  - `type BundleId = 'behavior' | 'trust' | 'groomingTraining' | 'unfinishedGrooming' | 'generalGrooming'`
  - `type OwnerField = 'programName' | 'goal' | 'classTime' | 'groomingParts'`
  - `interface Bundle { id: BundleId; label: string; pages: PageId[]; ownerFields: OwnerField[] }`, `BUNDLES: Bundle[]`(Global Constraints 의 묶음 표 그대로. label: '행동수정 트레이닝'·'신뢰쌓기'·'그루밍 트레이닝'·'교육 중단 미용 동의서'·'일반 미용'. ownerFields: behavior `['programName','goal']`, trust `['classTime']`, groomingTraining `[]`, 5·6 `['groomingParts']`), `bundleOf(id: string): Bundle | undefined`
  - `interface DocPage { id: PageId; title: string; source: 'agreement' | 'guidelines'; index: number; signed: boolean; agreeLabel: '읽고 동의해요' | '확인했어요'; image: string }` (`image` 는 `${BASE_PATH}/consent-v1-<id>.png`), `PAGES: Record<PageId, DocPage>` — title 은 PDF 제목 그대로(예: '교육을 마치지 않은 상태의 반려견의 미용 동의서'), 안내사항만 `signed: false`·'확인했어요'.
  - `GROOMING_PARTS: string[]` — PDF 순서 15개: 등, 배, 앞다리, 뒷다리, 발톱깎기, 발바닥털정리, 항문낭압출, 귀청소, 목욕&드라이, 얼굴컷트, 눈앞컷트, 귀바깥털, 발등, 생식기털, 항문털
  - `type FieldKey = 'guardianName' | 'phoneMid' | 'phoneLast' | 'petName' | 'breed' | 'yearSuffix' | 'month' | 'day' | 'manager' | 'signerName' | 'signature' | 'programName' | 'goal' | 'classTime' | \`part:${string}\``
  - `interface FieldBox { key: FieldKey; x: number; y: number; w: number; h: number; size: number }` — PDF 포인트, 왼쪽 아래 원점, 페이지 595.276 × 841.89. `LAYOUT: Record<PageId, FieldBox[]>`.
  - `PAGE_SIZE = { w: 595.276, h: 841.89 }`

- [ ] **Step 1: 원본 넣기** — 두 PDF 를 위 이름으로 `content/` 에 복사.
- [ ] **Step 2: 좌표 재기** — `pdftotext -bbox content/consent-agreement.pdf -` 로 각 장의 '성함'·'연락처'·'010'·'반려견 이름'·'견종'·'20'·'년'·'월'·'일'·'교육 담당자'·'보호자 성함'·'보호자 서명'·'(인)'·'프로그램 명'·'수업 목표'·'수업 시간'·'□ 등' 등의 상자를 얻어, 각 값이 들어갈 빈칸 상자를 정한다(bbox 의 y 는 위가 0 이므로 `841.89 - yMax` 로 뒤집는다). 1·4장의 교육 담당자는 이미 '히스하우스' 가 인쇄돼 있으니 `manager` 칸을 두지 않는다. 5·6장의 체크 칸은 '□' 글자의 상자 그대로.
- [ ] **Step 3: 실패하는 테스트** — `tests/consent-docs.test.ts`:
```ts
it('묶음 다섯은 사장님이 정한 장과 순서다', () => {
  expect(BUNDLES.map((b) => [b.label, b.pages])).toEqual([
    ['행동수정 트레이닝', ['agreement', 'behavior', 'guidelines']],
    ['신뢰쌓기', ['agreement', 'trust', 'guidelines']],
    ['그루밍 트레이닝', ['agreement', 'groomingTraining', 'guidelines']],
    ['교육 중단 미용 동의서', ['unfinishedGrooming']],
    ['일반 미용', ['generalGrooming']],
  ])
})
it('사인하는 장마다 작성일·보호자 성함·서명 칸이 있고, 2~6장에는 의뢰인·반려견 칸이 있다', ...)
it('2장은 프로그램 명·수업 목표, 3장은 수업 시간, 5·6장은 미용 부위 15칸이 있다', ...)
it('모든 칸은 페이지 안에 있고 같은 장의 칸끼리 겹치지 않는다', ...)
it('안내사항에는 칸이 없다', ...)
```
- [ ] **Step 4: 실패 확인** — `pnpm vitest run tests/consent-docs.test.ts` → FAIL.
- [ ] **Step 5: 구현** — `lib/consent-docs.ts`. `scripts/consent-pages.mjs`: `pdftoppm -png -scale-to-x 1240 -scale-to-y -1` 로 7장을 `public/consent-v1-<id>.png` 로, `pdftotext -layout` 로 장별 글을 `content/consent-text.ts`(`export const CONSENT_TEXT: Record<PageId, string>`)로 쓴다. 한 번 돌려 산출물을 커밋한다(그림을 바꾸면 `v2` 로 이름을 바꾼다 — 카톡·브라우저가 주소별로 저장).
- [ ] **Step 6: 통과 확인** — `pnpm vitest run tests/consent-docs.test.ts` → PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat: 동의서 묶음·장·칸 좌표와 원본 PDF·장 그림"`

---

### Task 5: 사인 데이터와 사인 칸

**Files:**
- Create: `lib/signature.ts`, `components/SignaturePad.tsx`, `components/SignaturePad.module.css`
- Test: `tests/signature.test.ts`, `tests/SignaturePad.test.tsx`

**Interfaces:**
- Produces:
  - `lib/signature.ts`: `SIG_W = 600`, `SIG_H = 200`, `SIG_MAX_CHARS = 4000`, `type Stroke = [number, number][]`, `encodeSignature(strokes: Stroke[]): string`(정수 좌표, 점은 `x,y` 를 공백으로, 획은 `;` 로), `decodeSignature(s: unknown): Stroke[] | null`(4000자 초과·상자 밖·정수 아님·두 점 이상인 획이 하나도 없으면 null), `simplify(stroke: Stroke, minGap = 3): Stroke`.
  - `components/SignaturePad.tsx`: `SignaturePad({ value, onChange }: { value: string; onChange(v: string): void })` — 캔버스(논리 크기 600×200, 화면 폭에 맞춰 늘림), 포인터 이벤트로 그리고 손을 떼면 `simplify` 한 획을 더해 `onChange(encodeSignature(...))`. '다시 그리기' 버튼은 `onChange('')`. 캔버스 `aria-label="서명 칸"`, CSS `touch-action: none`.

- [ ] **Step 1: 실패하는 테스트**
```ts
it('인코딩한 사인을 되읽으면 같은 획이다', ...)
it('4000자를 넘거나 상자 밖 점·소수·빈 사인은 null 이다', ...)
it('simplify 는 3픽셀보다 가까운 점을 버리되 첫 점과 끝 점은 남긴다', ...)
it('사인 칸은 서명 칸이라는 이름이 있고 touch-action 이 none 이며, 끌면 onChange 에 획이 담긴다', ...) // jsdom: pointerDown/Move/Up 을 쏴서
it('다시 그리기는 빈 값으로 바꾼다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/signature.test.ts tests/SignaturePad.test.tsx` → FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: 사인 데이터(정수 좌표, 4000자 이내)와 사인 칸"`

---

### Task 6: PDF 만들기

**Files:**
- Create: `lib/consent-pdf.ts`, `scripts/consent-sample.mjs`
- Modify: `next.config.ts`
- Test: `tests/consent-pdf.test.ts`

**Interfaces:**
- Consumes: Task 4 `BUNDLES`·`PAGES`·`LAYOUT`·`GROOMING_PARTS`, Task 5 `decodeSignature`·`SIG_W`·`SIG_H`.
- Produces: 
```ts
interface ConsentPdfInput {
  bundle: BundleId; consentId: string; applyId: string  // 신청서 없으면 ''
  guardian: { guardianName: string; phone: string; petName: string; breed: string; email: string }
  owner: { programName: string; goal: string; classTime: string; groomingParts: string[] }
  signature: string; signedAt: string  // 'YYYY-MM-DD HH:mm:ss' KST
  device: string; agreed: string[]; changes: string[]
}
buildConsentPdf(input: ConsentPdfInput): Promise<{ bytes: Uint8Array; docHash: string; fileHash: string }>
```
  - 고른 장만 원본에서 복사해 순서대로 → 칸 값(글꼴 `node_modules/pretendard/dist/public/static/Pretendard-Regular.otf`, `subset: true`), 연락처는 `010-1234-5678` 의 가운데·끝, 작성일은 서명 날짜(연도 뒤 두 자리·월·일), `manager` 는 '히스하우스', 사인은 `SIG_W×SIG_H` 를 칸 상자에 비율 맞춰 벡터 선(두께 1.2pt, 짙은 갈색 `#3d2e1f`), 미용 부위는 체크한 '□' 상자에 체크 표시 선.
  - 긴 글: 칸 폭에서 줄을 바꾸고 칸 높이를 넘으면 글자 크기를 0.5pt 씩 줄여 최소 7pt, 그래도 넘치면 마지막 줄 끝을 `…` 로.
  - 그 상태로 한 번 저장해 `docHash`(sha256 hex) → 기록 페이지(A4, 같은 글꼴) 추가: 제목 '서명 기록', 묶음 이름과 장 제목 목록, 보호자 성함·연락처·이메일, 반려견 이름, 서명 시각(한국 시각), 서명 기기, 동의서 ID·신청 ID, 동의 문구 목록(`agreed`), 보호자가 고친 값(`changes`, 없으면 '없음'), `문서 고유값(SHA-256, 이 페이지 앞 장들): <docHash>`, 맨 아래 `ⓒ 어글리독 All rights reserved` → 저장해 `fileHash`. PDF 정보의 만든·고친 날짜는 `signedAt` 으로 고정.
  - 원본·글꼴 파일은 `path.join(process.cwd(), ...)` 로 읽고 한 번 읽은 뒤 모듈 안에 둔다.

- [ ] **Step 1: 한글 확인(멈춤 지점)** — `scripts/consent-sample.mjs` 를 먼저 만들어(다섯 묶음 표본을 `/tmp/consent-sample-<bundle>.pdf` 로) 돌리고 `pdftotext /tmp/consent-sample-generalGrooming.pdf - | grep 김하나` 와 `pdftoppm -png -r 80` 그림으로 한글이 깨지지 않는지 본다. OTF 부분 넣기로 글자가 깨지면 멈추고 사용자에게 알린다(다른 글꼴을 정해야 한다).
- [ ] **Step 2: 실패하는 테스트** — `tests/consent-pdf.test.ts`:
```ts
it('묶음마다 고른 장 수 + 기록 페이지 한 장이다', ...)   // PDFDocument.load(bytes).getPageCount(): behavior 4, generalGrooming 2
it('fileHash 는 bytes 의 sha256 이고 docHash 와 다르다', ...)
it('일반 미용 묶음은 300KB 안팎(350KB 이하), 행동수정 묶음은 1MB 이하다', ...)
it('수업 목표 200자·견종 40자여도 던지지 않는다', ...)
it('사인이 깨졌거나 묶음을 모르면 던진다', ...)
it('PDF 만든 날짜는 서명 시각이다', ...)   // getCreationDate()
```
- [ ] **Step 3: 실패 확인** — `pnpm vitest run tests/consent-pdf.test.ts` → FAIL.
- [ ] **Step 4: 구현** — `lib/consent-pdf.ts`. `next.config.ts` 에 `outputFileTracingIncludes: { '/api/consent': [...파일], '/admin': [...파일] }`(원본 PDF 둘·OTF).
- [ ] **Step 5: 통과 확인** — `pnpm vitest run tests/consent-pdf.test.ts` → PASS. `pnpm exec tsx scripts/consent-sample.mjs` 로 다섯 표본을 다시 만들어 `pdftoppm -png -r 80` 그림을 열어 칸 위치가 원본 빈칸 안에 있는지 눈으로 본다(어긋나면 Task 4 좌표를 고친다).
- [ ] **Step 6: README 숫자** — 표본 크기(묶음별)를 재서 README 비용 표의 네이버 메일 줄에 "한 건 약 N KB, 하루 미용 10건이면 1년에 약 M GB(보낸메일함에도 남으면 세 배)" 를 적는다.
- [ ] **Step 7: Commit** — `git commit -m "feat: 동의서 PDF 만들기 — 고른 장에 값·체크·사인, 기록 페이지, 고유값 둘"`

---

### Task 7: 시트 '동의서' 탭

**Files:**
- Modify: `lib/sheets.ts`, `scripts/sheet-header.mjs`, `tests/e2e/fake-services.mjs`, `README.md`
- Create: `lib/consent-store.ts`
- Test: `tests/sheets.test.ts`, `tests/consent-store.test.ts`

**Interfaces:**
- Consumes: Task 4 `BundleId`, `bundleOf`.
- Produces:
  - `lib/sheets.ts`: `SheetTab = '예약신청' | '검사지' | '동의서'`, `readRange(range: string, deps?: SheetsDeps): Promise<string[][]>`(실패하면 `Error('sheets')`, 빈 칸은 `''` 로 채우지 않고 시트가 준 그대로).
  - `lib/consent-store.ts`:
    - `CONSENT_HEADER` — 20열, 순서 고정: 기록 시각, 종류, 동의서 ID, 신청 ID, 묶음, 프로그램 명, 수업 목표, 수업 시간, 미용 부위, 보호자 성함, 연락처, 반려견 이름, 견종, 이메일, 보호자가 고친 값, 서명 기기, 메일 결과, 문서 고유값, PDF 고유값, 사인(맨 끝 — 목록은 `A:S` 만 읽는다)
    - `type ConsentKind = '준비' | '취소' | '서명' | '메일'`
    - `interface GuardianInfo { guardianName: string; phone: string; petName: string; breed: string }`
    - `interface Prepared { id: string; applyId: string; bundle: BundleId; programName: string; goal: string; classTime: string; groomingParts: string[]; shown: GuardianInfo | null; createdAt: string }` (`shown` = 보호자에게 미리 채워 보여 줄 값, 신청서 없이 만들면 null)
    - `interface Signed { signedAt: string; guardian: GuardianInfo & { email: string }; changes: string[]; device: string; docHash: string; fileHash: string; row: number }`
    - `interface ConsentRecord { prepared: Prepared; cancelled: boolean; signed: Signed | null; mail: { archive: boolean; guardian: boolean } | null }`
    - `preparedRow(p: Prepared): string[]`, `cancelRow(id: string, at: string): string[]`, `signedRow(p: Prepared, s: Omit<Signed, 'row'>, signature: string): string[]`, `mailRow(id: string, at: string, r: { archive: boolean; guardian: boolean }): string[]` — 모두 `CONSENT_HEADER.length` 길이. 미용 부위는 `, ` 로, 고친 값은 줄바꿈으로, 메일 결과는 `보관 보냄 · 사본 실패` 꼴.
    - `parseConsents(rows: string[][]): Map<string, ConsentRecord>` — 머리글 줄은 건너뛰고, 같은 ID 는 나중 줄이 이긴다(서명·취소·메일). `Signed.row` 는 시트 줄 번호(1부터, `rows` 의 index + 1).
    - `loadConsents(deps?: SheetsDeps): Promise<Map<string, ConsentRecord>>` — `readRange("'동의서'!A:S")`
    - `loadSignature(row: number, deps?: SheetsDeps): Promise<string>` — `readRange(\`'동의서'!T${row}\`)`
  - 가짜 서비스 읽기가 `'탭'!X:Y`(여러 열)와 `'탭'!X<n>`(한 칸)도 받는다. 가짜에는 머리글 줄이 없으므로 줄 번호는 쌓인 순서(1부터)다.

- [ ] **Step 1: 실패하는 테스트**
```ts
// tests/sheets.test.ts
it('readRange 는 범위를 인코딩해 GET 하고 values 를 돌려주며, 실패는 Error("sheets") 다', ...)
// tests/consent-store.test.ts
it('네 종류의 줄은 모두 머리글 길이이고 사인은 맨 끝 열이다', ...)
it('준비 → 서명 → 메일 줄을 읽으면 서명·메일이 붙은 한 기록이고, 준비 → 취소면 cancelled 다', ...)
it('머리글 줄과 모르는 종류의 줄은 건너뛴다', ...)
it('서명 기록의 row 는 시트 줄 번호다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/sheets.test.ts tests/consent-store.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 시그니처대로. `scripts/sheet-header.mjs` 가 세 번째로 `동의서` 와 `CONSENT_HEADER` 를 찍는다(출력 여섯 줄). README 시트 절: 탭 `동의서` 만들기, 헤더는 `sed -n 6p`.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `pnpm sheet:header | tail -2` 에 `동의서` 와 20칸.
- [ ] **Step 5: Commit** — `git commit -m "feat: 시트 '동의서' 탭 — 준비·취소·서명·메일 줄과 읽기"`

---

### Task 8: 서명 링크

**Files:**
- Create: `lib/consent-link.ts`
- Test: `tests/consent-link.test.ts`

**Interfaces:**
- Produces: `newConsentId(): string`(서버 `crypto.randomBytes` 로 영숫자 10자), `consentToken(id: string, secret?: string): string`, `consentIdOf(token: unknown, secret?: string): string | null`, `consentUrl(id: string, secret?: string): string`(`${SITE_ORIGIN}${BASE_PATH}/consent/<token>`). `lib/survey-link.ts` 와 같은 꼴(서명 32자 hex)이되 HMAC 메시지 접두가 `consent:`.

- [ ] **Step 1: 실패하는 테스트**
```ts
it('만든 링크는 그 ID 로 열리고, 서명이 틀리거나 모양이 깨지면 null 이다', ...)
it('검사지 링크로는 동의서가 안 열리고 동의서 링크로는 검사지가 안 열린다', ...) // surveyToken(id) → consentIdOf null, consentToken(id) → applyIdOf null
it('newConsentId 는 영숫자 10자이고 매번 다르다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/consent-link.test.ts` → FAIL.
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: 동의서 서명 링크 — 검사지 링크와 용도를 나눈 서명"`

---

### Task 9: 사장님 홈 — 신청 고르기·동의서 만들기·링크·취소

**Files:**
- Create: `lib/applicants.ts`, `lib/consent-admin.ts`, `components/AdminHome.tsx`, `components/ConsentCreate.tsx`, `app/admin/new/page.tsx`
- Modify: `app/admin/page.tsx`, `app/admin/actions.ts`, `components/Admin.module.css`
- Test: `tests/applicants.test.ts`, `tests/consent-admin.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 2 `requireAdmin`; Task 4 `BUNDLES`·`bundleOf`·`GROOMING_PARTS`; Task 7 `preparedRow`·`cancelRow`·`loadConsents`·`appendRow`·`readRange`; Task 8 `newConsentId`·`consentUrl`.
- Produces:
  - `lib/applicants.ts`: `interface Applicant { applyId: string; receivedAt: string; guardianName: string; phone: string; petName: string; breed: string }`, `parseApplicants(rows: string[][]): Applicant[]`(열 위치는 `sheetHeader(applyForm)` 에서 `guardian_name`·`guardian_phone`·`pet_name`·`pet_breed` 를 찾아 정한다, 최신이 먼저, 머리글·빈 줄 제외), `loadApplicants(deps?): Promise<Applicant[]>`(필요한 마지막 열까지만 읽는다).
  - `lib/consent-admin.ts`(순수 + 주입):
    - `interface CreateInput { applyId: string; bundle: string; programName: string; goal: string; classTime: string; groomingParts: string[]; shown: GuardianInfo | null }`
    - `validateCreate(input: CreateInput): Record<string, string>` — 묶음 모름 '문서 묶음을 골라 주세요', 행동수정은 프로그램 명·수업 목표, 신뢰쌓기는 수업 시간 필수('적어 주세요'), 5·6 은 부위 하나 이상('미용할 부위를 하나 이상 골라 주세요'), 부위는 `GROOMING_PARTS` 안의 값만, 글은 500자 이하. 묶음에 없는 칸 값은 버린다.
    - `createConsent(input: CreateInput, deps?: { appendRow?; now?: () => string }): Promise<{ id: string; url: string } | { errors: Record<string, string> }>` — 시트 실패는 던진다(`Error('sheets')`).
    - `cancelConsent(id: string, deps?): Promise<'ok' | 'not-found' | 'signed'>`
  - 서버 액션: `createConsentAction(prev, form)`, `cancelConsentAction(id)` — 둘 다 `requireAdmin()` 먼저. 시트 실패는 `{ error: '지금은 시트에 쓸 수 없어요. 잠시 뒤 다시 눌러 주세요.' }` + `console.error('시트 저장 실패', id)`.

- [ ] **Step 1: 실패하는 테스트**
```ts
// tests/applicants.test.ts
it('예약신청 줄에서 신청 ID·성함·연락처·반려견·견종을 헤더 위치로 꺼내 최신순으로 준다', ...)
// tests/consent-admin.test.ts
it('묶음별 필수 칸이 비면 그 칸 이름으로 오류를 준다', ...)
it('묶음에 없는 칸 값은 준비 줄에 남지 않는다', ...)          // 일반 미용인데 programName 이 와도 ''
it('만들면 준비 줄 하나를 붙이고 그 ID 의 링크를 돌려준다', ...)
it('서명된 동의서는 취소되지 않고, 서명 전이면 취소 줄을 붙인다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/applicants.test.ts tests/consent-admin.test.ts` → FAIL.
- [ ] **Step 3: 구현**
  - 홈(`AdminHome`): '신청서에서 만들기' — 검색칸(이름·연락처, 브라우저에서 거르기)과 최근 신청 100개(접수 날짜 · 성함 · 반려견 · 연락처), 누르면 `/admin/new?apply=<ID>`. '신청서 없이 새로 만들기' → `/admin/new`. '최근 동의서' 30개: 묶음 · 성함 · 상태(서명 대기 / 서명함 / 취소함) · 메일 결과, 버튼 '링크 복사'(서명 대기만) · '취소'(서명 대기만, 확인 창은 화면 안에 그린 창). 시트를 못 읽으면 '지금은 시트를 읽을 수 없어요.' 한 줄.
  - 만들기(`ConsentCreate`): 묶음 다섯 칩, 고른 묶음의 칸만(프로그램 명·수업 목표·수업 시간 글칸, 미용 부위 15칩 복수 선택), 보호자 정보 넷(신청서 값으로 채움, 사장님이 고칠 수 있음, 신청서 없으면 비워 둠 — 그러면 보호자가 적는다). 만들면 링크와 '링크 복사' · '이 기기에서 바로 서명'(Task 12) 버튼.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: e2e** — `admin.spec.ts` 에: 신청서를 하나 낸 뒤 사장님 화면 목록에 그 이름이 보이고, 그걸로 '일반 미용'(부위 2개)을 만들면 링크가 나오며 가짜 시트에 '준비' 줄(묶음 '일반 미용', 미용 부위 2개)이 붙는다. 취소하면 '취소' 줄.
- [ ] **Step 6: Commit** — `git commit -m "feat: 사장님 화면 — 신청 고르기, 묶음별 칸 채워 동의서 만들기, 링크 복사·취소"`

---

### Task 10: 서명 제출(서버) — 검증·PDF·시트·메일·슬랙

**Files:**
- Create: `forms/consent.ts`, `lib/consent-submit.ts`, `app/api/consent/route.ts`
- Modify: `lib/slack-blocks.ts`
- Test: `tests/consent-submit.test.ts`, `tests/slack-blocks.test.ts`

**Interfaces:**
- Consumes: Task 1 `sendMail`·`Mail`·`mailAddress`; Task 4 `bundleOf`·`PAGES`·`PageId`; Task 5 `decodeSignature`; Task 6 `buildConsentPdf`; Task 7 `loadConsents`·`signedRow`·`mailRow`·`appendRow`·`ConsentRecord`; Task 8 `consentIdOf`; 기존 `validateGroup`·`FieldError`·`sendSlack`·`escapeMrkdwn`·`nowKst`·`todayKst`·`formatKoreanPhone`.
- Produces:
  - `forms/consent.ts`: `consentInfoGroup: Group` — id `consent_info`, title '보호자 정보', 문항: `guardianName`('보호자 성함', short, 필수, autoComplete `name`), `phone`('연락처', phone, 필수), `petName`('반려견 이름', short, 필수), `breed`('견종', short, 필수), `email`('사본을 받을 이메일', email, 필수, hint '서명한 동의서 PDF 를 이 주소로 보내 드려요.').
  - `lib/consent-submit.ts`:
```ts
type ConsentResult =
  | { status: 'ok'; pdf?: string; mailed: boolean }   // pdf = base64. 이미 서명된 재시도면 pdf 없음
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'closed' }                               // 모르는 ID·취소됨
  | { status: 'failed' }
interface ConsentDeps { loadConsents?; appendRow?; sendMail?; sendSlack?; buildPdf?; now?: () => string; today?: () => string; secret?: string }
submitConsent(body: unknown, userAgent: string, deps?: ConsentDeps): Promise<ConsentResult>
consentMails(r: { bundleLabel: string; guardianName: string; petName: string; email: string; signedAt: string; pdf: Uint8Array }): [Mail, Mail]  // [보관용, 보호자 사본]
```
    본문: `{ token, info: { guardianName, phone, petName, breed, email }, agreed: PageId[], esign: true, signature: string, website?: string }`.
    순서: 허니팟 → 링크(`consentIdOf`, 틀리면 closed) → 기록 읽기(실패 failed) → 취소·모름 closed / 이미 서명 `{ status: 'ok', mailed: false }`(아무것도 쓰지 않음) → 검증(`validateGroup(consentInfoGroup, info, today)` + 연락처를 `formatKoreanPhone` 한 값이 `/^010-\d{4}-\d{4}$/` 아니면 phone 에 '휴대폰 번호(010)로 적어 주세요' + `agreed` 가 묶음 장과 정확히 같은 집합이 아니면 `agreed` 에 '모든 문서에 동의해 주세요' + `esign !== true` 면 `esign` 에 '전자 방식 서명에 동의해 주세요' + `decodeSignature` 가 null 이면 `signature` 에 '사인해 주세요') → 고친 값(`prepared.shown` 이 있으면 바뀐 칸만 `{라벨} {이전} → {이후}`, 라벨은 `consentInfoGroup` 의 것) → `buildConsentPdf`(서명 시각 `now()`) → `appendRow('동의서', signedRow(...))`(실패: `console.error('시트 저장 실패', id)`, failed) → `consentMails` 두 통을 각각 보냄(실패마다 `console.error('메일 전송 실패', id)`) → `appendRow('동의서', mailRow(...))`(실패 무시) → `sendSlack(consentMessages(...))`(실패: `console.error('슬랙 전송 실패', id)`) → `{ status: 'ok', pdf, mailed: 사본 성공 }`.
    메일: 보관용 받는 이 `mailAddress()`, 제목 `[동의서] {성함} · {반려견} · {묶음} · {YYYY-MM-DD}`, 본문 '서명된 동의서를 첨부해요.'; 사본 받는 이 보호자, 제목 `히스하우스 동의서 사본이에요 ({묶음})`, 본문 '서명해 주셔서 고마워요. 서명한 동의서를 첨부해 드려요. 궁금한 점은 카카오톡 채널로 알려 주세요.'; 첨부 이름 둘 다 `히스하우스_동의서_{묶음}_{반려견}_{YYYYMMDD}.pdf`.
  - `lib/slack-blocks.ts`: `consentMessages(r: { bundleLabel: string; guardianName: string; petName: string; changes: string[]; mail: { archive: boolean; guardian: boolean }; consentId: string; applyId: string }): SlackMessage[]` — 머리글 `동의서 서명: {성함} · {반려견} · {묶음}`, '보호자가 고친 값'(있을 때만, 줄마다), '메일' `보관용 보냄/실패 · 보호자 사본 보냄/실패`, 맺음 `동의서 ID … · 신청 ID …`(신청이 없으면 '신청서 없이 만듦'). 글은 `escapeMrkdwn`. 알림 미리보기(text)는 머리글과 같다.
  - `app/api/consent/route.ts`: `runtime = 'nodejs'`, `maxDuration = 30`, POST → 본문 JSON 을 읽어(깨졌으면 400) `submitConsent(body, req.headers.get('user-agent') ?? '')` → 200 `{ ok: true, pdf?, mailed }` / 400 `{ ok: false, errors }` / 409 `{ ok: false }`(closed) / 503 `{ ok: false }`, 모두 `Cache-Control: no-store`.

- [ ] **Step 1: 실패하는 테스트**
```ts
// tests/consent-submit.test.ts (가짜 deps, events 배열로 순서를 본다)
it('맞게 내면 시트 서명 줄 → 메일 두 통 → 메일 줄 → 슬랙 순서이고 pdf 를 돌려준다', ...)
it('같은 링크로 다시 내면 아무것도 쓰지도 보내지도 않고 ok(pdf 없음)다', ...)
it('취소했거나 모르는 동의서, 틀린 링크면 closed 다', ...)
it('묶음의 장을 하나라도 빠뜨리거나 더하거나, 전자서명 동의·사인이 없으면 그 칸 오류다', ...)
it('010 휴대폰이 아니면 휴대폰 번호(010)로 적어 달라 한다', ...)
it('미리 보여 준 값과 달라진 칸만 "견종 말티 → 말티즈" 꼴로 시트·슬랙에 실리고, 신청서 없이 만든 동의서는 고친 값이 없다', ...)
it('시트 쓰기가 실패하면 failed 이고 메일·슬랙을 부르지 않으며 로그 인자는 정확히 ["시트 저장 실패", id] 다', ...)
it('메일이 실패해도 ok 이고 mailed 는 false, 로그는 ["메일 전송 실패", id], 슬랙에 실패가 표시된다', ...)
it('기록을 못 읽으면 failed 다', ...)
it('보관용·사본 메일의 받는 이·제목·첨부 이름이 정해진 꼴이다', ...)   // consentMails
// tests/slack-blocks.test.ts
it('동의서 알림은 머리글·고친 값·메일 결과·ID 를 담고, 고친 값이 없으면 그 칸을 뺀다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/consent-submit.test.ts tests/slack-blocks.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `pnpm build` 뒤 `.next/server/app/api/consent/route.js.nft.json` 에 `content/consent-agreement.pdf`·`content/consent-guidelines.pdf`·`Pretendard-Regular.otf` 가 모두 있는지 `grep` 으로 본다(Review Focus 1). 없으면 Task 6 의 `outputFileTracingIncludes` 키를 고친다.
- [ ] **Step 5: Commit** — `git commit -m "feat: 동의서 서명 제출 — 검증, PDF, 시트→메일→슬랙, 같은 링크 재시도는 한 번만"`

---

### Task 11: 보호자 서명 화면

**Files:**
- Create: `app/consent/[token]/page.tsx`, `components/ConsentFlow.tsx`, `components/ConsentPage.tsx`, `components/ConsentNotice.tsx`, `components/Consent.module.css`
- Modify: `lib/post.ts`
- Test: `tests/ConsentFlow.test.tsx`, `tests/consent-page.test.tsx`, `tests/e2e/consent.spec.ts`

**Interfaces:**
- Consumes: Task 2 `readSession`; Task 4 `bundleOf`·`PAGES`·`LAYOUT`·`PAGE_SIZE`·`CONSENT_TEXT`; Task 5 `SignaturePad`; Task 7 `loadConsents`·`Prepared`; Task 8 `consentIdOf`; Task 10 `consentInfoGroup`, `/api/consent` 응답 모양; 기존 `Field`·`validateGroup`·`KakaoLink`.
- Produces:
  - `lib/post.ts`: `postForResult(url: string, body: unknown): Promise<{ result: 'ok' | 'invalid' | 'closed' | 'failed'; data?: { pdf?: string; mailed?: boolean } }>` — 200 이면 본문 JSON 을 읽고, 400 invalid, 409 closed, 그 밖·거부는 failed. 본문·오류는 찍지 않는다.
  - `app/consent/[token]/page.tsx`(`force-dynamic`): 링크 틀림 → `<ConsentNotice kind="closed"/>`, 기록 읽기 실패 → `kind="error"`, 취소·모름 → closed, 서명됨 → `kind="signed"`, 아니면 `<ConsentFlow token={token} prepared={...} device={잠긴 사장님 세션이면 true}/>`. 문구: closed '열 수 없는 동의서예요' / '링크가 바뀌었을 수 있어요. 카카오톡 채널로 알려 주세요.', signed '이미 서명한 동의서예요' / '사본은 메일로 보내 드렸어요.', error '지금은 동의서를 열 수 없어요' / '잠시 뒤 다시 열어 주세요.' 미리보기 제목 '히스하우스 동의서', 그림은 기존 `og-shop.jpg`.
  - `ConsentFlow({ token, prepared, device }: { token: string; prepared: Prepared; device: boolean })` 단계:
    ① 정보 확인 — 제목 '계약서에 이렇게 들어가요', 안내 '틀린 곳이 있으면 고쳐 주세요.', `Field` 로 `consentInfoGroup` 다섯 칸(`prepared.shown` 으로 채움), 개인정보 안내 '동의서 사본을 보내고 서명 기록을 남기려고 이메일, 서명, 서명한 기기 정보와 시각을 받아요. 서명일부터 5년 동안 보관한 뒤 지워요.', 검증은 `validateGroup` 을 화면에서도 돌린다.
    ② 장마다 — `ConsentPage({ page, values })`: 장 그림(`alt` = 장 제목) 위에 `LAYOUT` 좌표를 `PAGE_SIZE` 기준 % 로 바꿔 값 글자를 얹는다(사인 칸은 비워 둔다), 아래 '글로 읽기' 접이식(`<details>`)에 `CONSENT_TEXT[page]`. 체크 `PAGES[id].agreeLabel` 을 켜야 '다음'.
    ③ 서명 — `SignaturePad`, 체크 '전자 방식으로 서명하는 데 동의해요', 한 줄 '이 주소로 사본을 보내요: {이메일}', 버튼 '서명하기'(사인·체크 전엔 막힘, 보내는 동안 막힘). invalid 면 해당 단계로 돌아가 오류, closed 면 `ConsentNotice closed`, failed 면 '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'.
    ④ 완료 — '서명이 끝났어요'. `device` 가 아니면 'PDF 내려받기'(base64 → Blob → 파일 이름은 메일 첨부와 같은 꼴), 사본 성공이면 '메일로 사본을 보냈어요', 실패면 '사본 메일은 곧 다시 보내 드릴게요'. `device` 면 내려받기 대신 '기기를 사장님께 돌려주세요' 와 '사장님 화면으로'(`/admin`) 링크.
    모든 단계 맨 아래 작은 회색 `ⓒ 어글리독 All rights reserved`. 초안은 저장하지 않는다(짧은 흐름, 공용 아이패드).

- [ ] **Step 1: 실패하는 테스트**
```ts
// tests/ConsentFlow.test.tsx (postForResult 를 vi.mock)
it('정보 → 장마다 동의 → 서명 순서이고, 체크·사인 전에는 다음·서명하기가 막힌다', ...)
it('보낼 때 묶음의 모든 장 ID 와 esign: true, 사인을 담는다', ...)
it('완료 화면은 사본 결과에 따라 문구가 다르고 PDF 내려받기가 있다', ...)
it('아이패드(device)면 완료 화면에 내려받기 대신 기기를 돌려 달라고 한다', ...)
it('모든 단계 맨 아래에 출처 문구가 있다', ...)
// tests/consent-page.test.tsx (페이지 함수, 시트·세션을 vi.mock — 기존 tests/survey-page.test.tsx 꼴)
it('틀린 링크·취소·모름은 closed, 서명됨은 signed, 기록 읽기 실패는 error, 아니면 ConsentFlow 다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/ConsentFlow.test.tsx tests/consent-page.test.tsx` → FAIL.
- [ ] **Step 3: 구현** — 위 Interfaces 대로.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS.
- [ ] **Step 5: e2e** — `tests/e2e/consent.spec.ts`(기본 Pixel 7 하나, `test.describe` 로 아이패드 폭 `{ viewport: { width: 820, height: 1180 }, hasTouch: true }` 하나): 신청서를 낸 뒤 사장님이 그 신청으로 '행동수정 트레이닝' 링크를 만들고 → 그 링크를 열어 정보 확인(신청서 값이 채워짐, 견종을 고침) → 세 장 동의 → 사인 칸을 끌어 그림(그 뒤 `window.scrollY` 가 그리기 전과 같다) → 서명하기 → '서명이 끝났어요'. 가짜 상태: 시트 '동의서' 줄이 '준비'·'서명'·'메일' 순, 메일 2통(받는 이 `archive@example.invalid` 와 적은 이메일, 첨부 base64 를 디코드한 앞 4바이트가 `%PDF`), 슬랙 머리글이 `동의서 서명:` 으로 시작하고 '보호자가 고친 값' 에 견종. 같은 링크를 다시 열면 '이미 서명한 동의서예요'. 취소한 링크는 '열 수 없는 동의서예요'. 폭 320 에서 네 단계 모두 가로 넘침 없음.
- [ ] **Step 6: Commit** — `git commit -m "feat: 보호자 서명 화면 — 정보 확인·장마다 동의·사인·완료(내려받기)"`

---

### Task 12: 아이패드 잠금 서명과 메일 다시 보내기

**Files:**
- Modify: `app/admin/actions.ts`, `components/ConsentCreate.tsx`, `components/AdminHome.tsx`, `lib/consent-admin.ts`
- Test: `tests/consent-admin.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 2 `readSession`·`writeSession`·`requireAdmin`; Task 6 `buildConsentPdf`; Task 7 `loadConsents`·`loadSignature`·`mailRow`; Task 10 `consentMails`(메일 제목·첨부 이름을 제출과 똑같이).
- Produces:
  - 서버 액션 `startDeviceSign(token: string): Promise<void>` — `requireAdmin()` 뒤 세션을 `locked: true, fails: 0` 으로 쓰고 `redirect(\`/consent/${token}\`)`.
  - `resendConsentMail(id: string, deps?): Promise<{ archive: boolean; guardian: boolean } | 'not-signed'>`(`lib/consent-admin.ts`) — 기록·사인 읽기 → 같은 입력으로 PDF 다시 만들기 → 메일 둘 → '메일' 줄. 서버 액션 `resendConsentMailAction(id)`.
  - 사장님 화면·사장님 서버 액션은 잠긴 세션이면 아무것도 하지 않는다(`requireAdmin` 이 `/admin` 으로 보내고 그 화면은 PIN).

- [ ] **Step 1: 실패하는 테스트**
```ts
it('메일 다시 보내기는 서명된 기록의 사인으로 PDF 를 다시 만들어 두 통을 보내고 메일 줄을 붙인다', ...)
it('서명 전 동의서는 not-signed 다', ...)
```
- [ ] **Step 2: 실패 확인** — `pnpm vitest run tests/consent-admin.test.ts` → FAIL.
- [ ] **Step 3: 구현** — '이 기기에서 바로 서명' 버튼은 `startDeviceSign`. 최근 동의서 목록에서 서명함 + 메일 결과에 실패가 있으면 '메일 다시 보내기'(결과 한 줄).
- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: e2e** — `admin.spec.ts`: 만들기 → '이 기기에서 바로 서명' → 서명 화면. 이때 `/hisshaus/admin` 으로 가면 '잠겨 있어요'(뒤로 가기로도). 서명 완료 화면은 '기기를 사장님께 돌려주세요'. PIN `1234` → 사장님 홈. 다시 잠그고 틀린 PIN 5번 → 로그인 화면('비밀번호' 칸).
- [ ] **Step 6: 전체 확인** — `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm e2e` 모두 PASS. `.next/server/app/admin/page.js.nft.json` 에도 원본 PDF 둘·글꼴이 있는지 본다(메일 다시 보내기가 PDF 를 만든다).
- [ ] **Step 7: 문서** — README: '동의서' 절(사장님 사용법 — 링크 만들어 카톡으로 보내기, 매장에서 아이패드로 받기·PIN 으로 풀기, 메일 다시 보내기, 메일함 용량이 차기 전 오래된 메일 내려받아 지우기, 5년 지난 메일·시트 줄은 직접 지우기, 원본 PDF 를 바꿀 때 `scripts/consent-pages.mjs` 다시 돌리고 그림 이름 `v2`). `CLAUDE.md`: 동의서 규칙 한 덩어리(묶음·좌표는 `lib/consent-docs.ts` 단일 출처, 시트 '동의서' 탭은 줄만 붙이는 기록장이고 사인은 맨 끝 열, 한글 글꼴은 서버가 PDF 에만 넣는다, 출처 문구 자리, IP 기록 안 함).
- [ ] **Step 8: Commit** — `git commit -m "feat: 아이패드 잠금 서명(PIN 으로 풀기)과 메일 다시 보내기, 사용법 문서"`
