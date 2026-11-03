# CLAUDE.md — 히스하우스 예약 신청서

히스하우스(Hiss Haus)의 예약 신청서와 교육미용 행동 분석 검사지를 받는 웹이다(Next.js 16 App Router · TypeScript · pnpm). 에이전트는 코드·설정·명령을 제안하거나 실행하기 전에 이 문서를 먼저 읽는다. 설정과 운영은 `README.md`, 설계·문항·계획은 `docs/superpowers/` 에 있다.

## 꼭 지킬 것

- 응답·주석·테스트 이름·커밋 메시지는 한국어다. 커밋과 푸시는 사용자가 요청할 때만 한다.
- 화면 문구는 해요체다. "~입니다/~됩니다/~십시오" 를 쓰지 않는다. 단 검사지(`forms/survey.ts`)의 질문·선택지·안내문은 구글폼 원문 그대로 둔다. 원문과 달라지는 곳은 `tests/survey-verbatim.test.ts` 의 RULINGS·FIXES·OPTION_FIXES·INSTRUCTION_HINT 에 전부 적혀 있고(사장님 결정으로 고친 오타·틀린 숫자·설명, 구글폼용 선택 안내 삭제) 설계 문서 5절이 그 근거다. 거기 없는 글자는 바꾸지 않는다. `tests/survey-verbatim.test.ts` 가 원본 덤프(`tests/survey-original.txt`)와 문항마다 대조한다.
- 화면 어디에도 전체 문항 수·소요 시간("98문항", "약 3분")·묶음 진행 표시(`2 / 4`, 진행 막대)를 적지 않는다(사용자 결정 2026-10-24). 대신 뒤쪽 묶음에서 '절반 넘게 왔어요'·'✨ 거의 다 왔어요, 한 화면만 더!'·'🎉 마지막 화면이에요' 배지 한 줄로 알린다(`StepForm` 의 `pace`).
- 예약금은 교육미용 상담 50,000원, 그 밖 10,000원이다(`lib/deposit.ts`). 금액 글은 `content/shop.ts`·`forms/apply.ts` 예약금 안내문에도 있다.
- `process.env` 는 `lib/config.ts` 에서만 읽는다. `NEXT_PUBLIC_` 변수를 만들지 않는다. 필수 변수는 `SLACK_WEBHOOK_URL`·`GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_SHEET_ID`·`SURVEY_LINK_SECRET`(32자 이상) 넷이다. `MAIL_ADDRESS`·`MAIL_APP_PASSWORD`·`ADMIN_PASSWORD`(10자 이상)·`ADMIN_PIN`(4자리)은 동의서 기능에만 필요하다(없으면 사장님 화면·서명만 500). `SLACK_MENTION` 은 선택(알림 멘션), `HOLIDAY_API_KEY` 도 선택(공휴일, 없으면 화요일만 막는다). `SHEETS_BASE_URL`·`SHEETS_FAKE_TOKEN`·`MAIL_FAKE_URL` 은 e2e 전용이고 production 에서는 읽지 않는다.
- 로그(`console.*`)에는 `시트 저장 실패` / `슬랙 전송 실패` / `메일 전송 실패` / `PDF 만들기 실패` 와 신청 ID(동의서는 동의서 ID, 메일 시험은 `test`)만 남긴다. 답변·요청 본문·웹훅 주소·키·오류 객체는 넣지 않는다(오류 객체에 주소가 들어 있을 수 있다).
- 비밀값(웹훅 주소·서비스 계정 키·검사지 링크 비밀값·메일 앱 비밀번호·사장님 비밀번호와 PIN)을 코드·로그·문서·커밋에 남기지 않고, `.env*` 파일 내용을 그대로 출력하지 않는다.
- 시트는 `valueInputOption=RAW` 로만 쓴다(`lib/sheets.ts`). 보호자가 적은 `=...` 가 수식이 되지 않게 `USER_ENTERED` 로 바꾸지 않는다.
- 제출 순서는 검증 → 시트 → 슬랙이다. 시트 실패는 실패로 답하고, 슬랙 실패는 기록이 남았으므로 성공으로 답한다. 검사지는 시트 단계에서 이미 냈는지 먼저 읽고, 냈으면 쓰지도 보내지도 않고 성공으로 답한다.
- 검사지는 사장님이 보낸 신청별 링크(`/survey/{신청 ID}-{서명}`, `lib/survey-link.ts`)로만 열린다(사장님 결정 2026-10-30, 설계 `docs/superpowers/specs/2026-10-30-survey-link-design.md`). 첫 화면·신청 완료 화면에 검사지로 가는 길을 두지 않는다. 링크가 없거나 틀린 화면(`/survey`, 틀린 링크는 그리로 redirect)과 누구나 열 수 있는 화면(첫 화면·신청서·`/survey/done`)은 문항 정의(`forms/survey.ts`)를 불러오지 않는다 — 불러오면 문항 전체가 그 화면의 JS 에 실린다. e2e 가 응답 본문으로 확인한다. 출처 글은 `forms/survey-credit.ts` 에 따로 있다. 제출하면 링크가 닫힌다(시트 확인 + 기기 표시 `hh.survey.sent`). 링크 주소의 도메인은 `lib/base-path.ts` 의 `SITE_ORIGIN` 이다.
- 외부 스크립트·외부 글꼴·분석 도구를 넣지 않는다. 브라우저가 부르는 곳은 이 웹뿐이다. Vercel 전용 기능에 기대지 않고, 첫 화면 사진은 `next/image` 가 아니라 `<img>` 다(이미지 최적화 사용량을 쓰지 않는다).
- 문항 정의(`forms/`)가 단일 출처다. 화면·검증·시트 행·슬랙 메시지가 모두 그것을 읽는다. 문항을 바꾸면 시트 열이 바뀌므로 `pnpm sheet:header` 로 헤더를 다시 확인한다. 다만 일부 문항 id 는 코드가 직접 쓴다: 슬랙 머리글·알림 줄(`lib/slack-blocks.ts`), 신청 세션(`components/ApplyFlow.tsx`), 희망 일시 요약(`lib/wish.ts`), 교육미용 신청의 검사지 링크(`lib/submit.ts` 의 `services`), 문항 정의 안의 `showIf`(문항·묶음)·`requiredIf`. id 를 바꾸면 그곳도 고친다.
- 신청서의 서비스별 묶음(`grooming`·`daycare`·`hotel`·`training`)은 묶음 `showIf` 로 고른 서비스일 때만 보인다. 묶음을 옮기는 코드는 `visibleGroups`·`isGroupVisible` 을 거쳐야 하고, 보내는 답·검증·슬랙 본문은 숨은 묶음을 빼야 한다.
- 새 신청을 시작할 때 신청 세션을 지우지 않는다. 완료 화면에서 뒤로 가기만 해도 세션이 사라져, 앞으로 가기 때 완료 화면이 첫 화면으로 튕긴다. 세션은 다음 제출이 덮어쓴다. 다만 완료 화면의 **확인·처음으로** 버튼은 "다 봤다" 는 뜻이라 세션과 초안을 지운다(공용 기기 대비, 사용자 결정 2026-10-24).
- 영업시간은 `content/shop.ts` 에 두 번 적혀 있다: 첫 화면 글(`hours`)과 시간 칩이 쓰는 요일별 값(`openHours`). 바꾸면 둘 다 고친다. 시간 문항(`time`)의 칩은 `lib/slots.ts` 가 `openHours` 로 만든다. `openHours` 에 없는 요일은 쉬는 날(지금 화요일)이라 달력에서 누를 수 없고 서버도 거부한다(`isOpenDay`). 공휴일은 서버가 공공데이터포털 특일 정보 API 로 받아(`lib/holidays.ts`, 12시간 캐시, `/apply` 는 12시간마다 새로 그린다) 같이 막는다. 받기가 실패하면 빈 목록이라 화요일만 막고 신청은 그대로 받는다.
- 날짜 문항(`components/fields/DateField.tsx`)은 브라우저 기본 달력이 아니라 직접 그린 달력이다(입력칸은 읽기 전용 `role=combobox`, 값은 `data-value`, 날짜 칸은 `[data-date]`). e2e 도우미 `pickDate` 가 이 표지로 고른다.
- 뒤로 가기·방문 기록 코드(`components/StepForm.tsx`)를 고치면 e2e 로 확인한다. jsdom 은 실제 Next 의 `popstate` 를 재현하지 못한다.
- e2e 는 진짜 서비스를 부르지 않는다. 포트 3030·3031 의 전용 서버와 가짜 슬랙·시트만 쓰고 `reuseExistingServer: false` 를 유지한다. `pnpm e2e` 전에 개발 서버(3020)를 끈다.
- 웹은 `chagocnote.com/hisshaus` 아래에서 열린다(`next.config.ts` 의 `basePath`, 값은 `lib/base-path.ts` 의 `BASE_PATH`). `Link`·`router` 주소에는 Next 가 붙여 주지만 `fetch` 주소(`lib/post.ts`), `<img>` 주소(`content/shop.ts`), 미리보기 그림 주소(`app/layout.tsx`·`app/survey/[token]/page.tsx`·`app/consent/[token]/page.tsx`), 동의서 장 그림 주소(`lib/consent-docs.ts`)에는 붙여 주지 않아서 `BASE_PATH` 를 직접 붙인다. 이런 주소를 새로 만들면 같이 붙인다. 도메인 첫 주소 `/` 는 `/hisshaus` 로 보낸다(임시 307, 나중에 차곡노트 플랫폼이 첫 주소를 맡으면 지운다).
- 외부 서비스나 유료 기능을 더하기 전에 무료 한도와 유료로 바뀌는 지점을 사용자에게 먼저 밝히고 README 의 비용 표에 적는다.

## 동의서

교육미용 동의서 전자 서명(설계 `docs/superpowers/specs/2026-11-03-consent-signing-design.md`, 사장님 사용법은 README '동의서').

- 묶음·장·칸 좌표·칸 값은 `lib/consent-docs.ts` 가 단일 출처다. PDF(`lib/consent-pdf.ts`)·보호자 화면·사장님 화면이 모두 그것을 읽는다. 보호자 화면 JS 에 실리므로 그 파일은 서버 전용 모듈을 불러오지 않는다. 원본 PDF(`content/consent-*.pdf`)는 칸 위치가 같을 때만 파일째 바꾸고(위치가 바뀌면 좌표를 다시 잰다), 장 그림을 다시 만들면 이름을 `v2` 로 올린다.
- 시트 '동의서' 탭은 줄을 붙이기만 하는 기록장이다(준비·취소·서명·메일). 줄을 고치지 않고, 읽을 때 동의서 ID 마다 합친다(`lib/consent-store.ts`, 열은 `CONSENT_HEADER`). 사인은 길어서 맨 끝 열(T)이고, 목록 읽기는 `A:S` 만 읽는다. 서명 줄은 준비 값을 되풀이해 적어 그 줄과 사인만으로 PDF 를 다시 만들 수 있다.
- 서명 제출 순서는 검증 → PDF → 시트(서명 줄) → 메일 두 통 → 시트(메일 줄) → 슬랙이다(`lib/consent-submit.ts`). PDF·시트 실패는 실패로 답하고, 서명 줄이 남은 뒤의 메일·슬랙 실패는 성공으로 답한다(사장님 화면에서 메일을 다시 보낸다). 이미 서명한 링크로 다시 내면 쓰지도 보내지도 않고 성공으로 답한다. 메일 다시 보내기(`lib/consent-admin.ts` 의 `resendConsentMail`)는 제출과 같은 PDF 입력을 만들고, 실패한 통만(메일 줄이 없으면 두 통) 제출과 같은 함수(`deliverConsentMails` → `consentMails`)로 보낸다. 메일 줄에는 전에 보낸 통과 합친 결과를 적는다.
- 서명 링크(`/consent/{동의서 ID}-{서명}`, `lib/consent-link.ts`)는 검사지 링크와 같은 모양·비밀값에 용도 접두 `consent:` 를 붙인다. 그래서 두 링크는 서로 열리지 않는다.
- 서명 내용 고유값(`consentContentHash`, 시트 R열·기록 페이지)은 원본 PDF 둘의 sha256 과 서명 값을 정해진 키 순서의 JSON(v1)으로 묶은 것의 SHA-256 이다. 시트 기록과 원본으로 언제든 다시 계산해 서명 뒤 바뀌지 않았음을 보인다. 서명 시각은 한 번 정해 PDF 와 서명 줄 A열에 같이 쓴다. 키·순서·동의 문구 규칙(`agreedSentences`)을 바꾸면 v 를 올린다.
- 한글 글꼴(`pretendard` 패키지의 Pretendard OTF)은 서버가 PDF 안에만 넣는다(foliojs `fontkit` 과 `lib/consent-pdf.ts` 의 이음 코드). 브라우저가 받는 글꼴이 아니다. 원본 PDF 둘과 글꼴은 `next.config.ts` 의 `outputFileTracingIncludes`(`/api/consent`·`/admin`)에 적혀 있다. PDF 를 만드는 경로를 더하면 거기에도 적고, 빌드 뒤 그 경로의 `.next/server/app/**/*.nft.json` 에 세 파일이 있는지 본다.
- 출처 문구 'ⓒ 어글리독 All rights reserved' 는 서명 화면 맨 아래와 PDF 기록 페이지 맨 아래에만 둔다. 사장님 문서 장 위에는 찍지 않는다.
- IP 주소는 기록하지 않는다. 서명 기기(User-Agent)는 300자에서 자른다.
- 사장님 화면(`/admin`)과 그 서버 액션은 모두 `requireAdmin()` 을 먼저 부른다(`lib/admin-guard.ts`, 서명된 HttpOnly 쿠키). '이 기기에서 바로 서명'(`startDeviceSign`)은 로그인을 둔 채 쿠키를 잠그고, 잠긴 동안 `requireAdmin` 이 `/admin`(PIN 화면)으로 보낸다. PIN 을 5번 틀리면 로그아웃이다. 잠긴 기기의 서명 완료 화면과 동의서 안내에는 '사장님 화면으로' 길을 둔다(갇히지 않게).
- e2e 는 진짜 메일을 보내지 않는다. 가짜 메일(`MAIL_FAKE_URL`, `tests/e2e/fake-services.mjs`)만 쓴다.

## 폴더

폴더는 아래 아홉 개뿐이다. 새 폴더를 만들지 않는다.

| 폴더 | 내용 |
|---|---|
| `app` | 화면(`/`, `/apply`, `/survey`, `/consent`, 사장님 화면 `/admin` 과 그 하위)과 API 경로(`app/api`). 실제 주소는 모두 `/hisshaus` 아래다 |
| `components` | 화면 조각, `StepForm`, 필드(`components/fields`) |
| `forms` | 문항 정의(`apply.ts`, `survey.ts`)·형(`types.ts`)·규칙(`rules.ts`) |
| `content` | 매장 정보(`shop.ts`), 동의서 원본 PDF 둘·장 글(`consent-text.ts`) |
| `lib` | 설정·검증·시트·슬랙·초안 저장 |
| `public` | 사진(`hero.jpg`, 미리보기 `og-shop.jpg` — 그림을 바꾸면 파일 이름도 바꾼다, 카카오톡이 주소별로 저장), 동의서 장 그림(`consent-v1-*.png`) |
| `tests` | Vitest, `tests/e2e` 는 Playwright 와 가짜 슬랙·시트·메일 |
| `scripts` | 시트 헤더 출력, 검사지 링크 출력, 동의서 장 그림·표본 PDF 만들기 |
| `docs` | 설계·문항·계획 |

## 명령

```bash
pnpm dev                    # 개발 서버 http://localhost:3020/hisshaus (127.0.0.1 로 열면 막힌다)
pnpm test                   # 단위·컴포넌트 (Vitest)
pnpm exec tsc --noEmit      # 형 검사
pnpm build                  # 빌드
pnpm e2e                    # 실제 브라우저 (Playwright). 처음에는 pnpm exec playwright install chromium
pnpm sheet:header           # 시트 세 탭의 헤더 출력
pnpm survey:link [신청ID]    # 검사지 링크 출력(.env.local 의 SURVEY_LINK_SECRET, 신청 ID 없으면 새로 만든다)
```

## 문서

- 설계: `docs/superpowers/specs/2026-10-23-hisshaus-form-design.md`, 검사지 링크: `docs/superpowers/specs/2026-10-30-survey-link-design.md`, 동의서: `docs/superpowers/specs/2026-11-03-consent-signing-design.md`
- 문항 원문: `docs/superpowers/specs/2026-10-23-hisshaus-form-questions.md`
- 구현 계획: `docs/superpowers/plans/2026-10-23-hisshaus-form.md`, 동의서: `docs/superpowers/plans/2026-11-03-consent-signing.md`
- 설정·운영: `README.md`
