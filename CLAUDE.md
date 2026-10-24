# CLAUDE.md — 히스하우스 예약 신청서

히스하우스(Hiss Haus)의 예약 신청서와 교육미용 행동 분석 검사지를 받는 웹이다(Next.js 16 App Router · TypeScript · pnpm). 에이전트는 코드·설정·명령을 제안하거나 실행하기 전에 이 문서를 먼저 읽는다. 설정과 운영은 `README.md`, 설계·문항·계획은 `docs/superpowers/` 에 있다.

## 꼭 지킬 것

- 응답·주석·테스트 이름·커밋 메시지는 한국어다. 커밋과 푸시는 사용자가 요청할 때만 한다.
- 화면 문구는 해요체다. "~입니다/~됩니다/~십시오" 를 쓰지 않는다. 단 검사지(`forms/survey.ts`)의 질문·선택지·안내문은 구글폼 원문 그대로 두고 오타("영영제", "편균" 등)도 고치지 않는다. 원문과 달라지는 곳은 설계 문서 5절에 적힌 것뿐이다. `tests/survey-verbatim.test.ts` 가 원본 덤프(`tests/survey-original.txt`)와 문항마다 대조한다.
- 화면 어디에도 전체 문항 수·소요 시간("98문항", "약 3분")·묶음 진행 표시(`2 / 4`, 진행 막대)를 적지 않는다(사용자 결정 2026-10-24).
- 예약금은 교육미용 상담 50,000원, 그 밖 10,000원이다(`lib/deposit.ts`). 금액 글은 `content/shop.ts`·`forms/apply.ts` 예약금 안내문에도 있다.
- `process.env` 는 `lib/config.ts` 에서만 읽는다. `NEXT_PUBLIC_` 변수를 만들지 않는다. 필수 변수는 `SLACK_WEBHOOK_URL`·`GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_SHEET_ID` 셋이다. `SHEETS_BASE_URL`·`SHEETS_FAKE_TOKEN` 은 e2e 전용이고 production 에서는 읽지 않는다.
- 로그(`console.*`)에는 `시트 저장 실패` / `슬랙 전송 실패` 와 신청 ID 만 남긴다. 답변·요청 본문·웹훅 주소·키·오류 객체는 넣지 않는다(오류 객체에 주소가 들어 있을 수 있다).
- 비밀값(웹훅 주소·서비스 계정 키)을 코드·로그·문서·커밋에 남기지 않고, `.env*` 파일 내용을 그대로 출력하지 않는다.
- 시트는 `valueInputOption=RAW` 로만 쓴다(`lib/sheets.ts`). 보호자가 적은 `=...` 가 수식이 되지 않게 `USER_ENTERED` 로 바꾸지 않는다.
- 제출 순서는 검증 → 시트 → 슬랙이다. 시트 실패는 실패로 답하고, 슬랙 실패는 기록이 남았으므로 성공으로 답한다.
- 외부 스크립트·외부 글꼴·분석 도구를 넣지 않는다. 브라우저가 부르는 곳은 이 웹뿐이다. Vercel 전용 기능에 기대지 않고, 첫 화면 사진은 `next/image` 가 아니라 `<img>` 다(이미지 최적화 사용량을 쓰지 않는다).
- 문항 정의(`forms/`)가 단일 출처다. 화면·검증·시트 행·슬랙 메시지가 모두 그것을 읽는다. 문항을 바꾸면 시트 열이 바뀌므로 `pnpm sheet:header` 로 헤더를 다시 확인한다. 다만 일부 문항 id 는 코드가 직접 쓴다: 슬랙 머리글·알림 줄(`lib/slack-blocks.ts`), 신청 세션(`components/ApplyFlow.tsx`), 희망 일시 요약(`lib/wish.ts`), 검사지 미리 채우기(`components/SurveyFlow.tsx`), 문항 정의 안의 `showIf`(문항·묶음)·`requiredIf`. id 를 바꾸면 그곳도 고친다.
- 신청서의 서비스별 묶음(`grooming`·`daycare`·`hotel`·`training`)은 묶음 `showIf` 로 고른 서비스일 때만 보인다. 묶음을 옮기는 코드는 `visibleGroups`·`isGroupVisible` 을 거쳐야 하고, 보내는 답·검증·슬랙 본문은 숨은 묶음을 빼야 한다.
- 새 신청을 시작할 때 신청 세션을 지우지 않는다. 완료 화면에서 뒤로 가기만 해도 세션이 사라져, 앞으로 가기 때 완료 화면이 첫 화면으로 튕긴다. 세션은 다음 제출이 덮어쓴다.
- 영업시간은 `content/shop.ts` 에 두 번 적혀 있다: 첫 화면 글(`hours`)과 시간 칩이 쓰는 요일별 값(`openHours`). 바꾸면 둘 다 고친다. 시간 문항(`time`)의 칩은 `lib/slots.ts` 가 `openHours` 로 만든다.
- 날짜 문항(`components/fields/DateField.tsx`)은 브라우저 기본 달력이 아니라 직접 그린 달력이다(입력칸은 읽기 전용 `role=combobox`, 값은 `data-value`, 날짜 칸은 `[data-date]`). e2e 도우미 `pickDate` 가 이 표지로 고른다.
- 뒤로 가기·방문 기록 코드(`components/StepForm.tsx`)를 고치면 e2e 로 확인한다. jsdom 은 실제 Next 의 `popstate` 를 재현하지 못한다.
- e2e 는 진짜 서비스를 부르지 않는다. 포트 3030·3031 의 전용 서버와 가짜 슬랙·시트만 쓰고 `reuseExistingServer: false` 를 유지한다. `pnpm e2e` 전에 개발 서버(3020)를 끈다.
- 웹은 `chagocnote.com/hisshaus` 아래에서 열린다(`next.config.ts` 의 `basePath`, 값은 `lib/base-path.ts` 의 `BASE_PATH`). `Link`·`router` 주소에는 Next 가 붙여 주지만 `fetch` 주소(`lib/post.ts`), `<img>` 주소(`content/shop.ts`), 미리보기 그림 주소(`app/layout.tsx`·`app/survey/page.tsx`)에는 붙여 주지 않아서 `BASE_PATH` 를 직접 붙인다. 이런 주소를 새로 만들면 같이 붙인다. 도메인 첫 주소 `/` 는 `/hisshaus` 로 보낸다(임시 307, 나중에 차곡노트 플랫폼이 첫 주소를 맡으면 지운다).
- 외부 서비스나 유료 기능을 더하기 전에 무료 한도와 유료로 바뀌는 지점을 사용자에게 먼저 밝히고 README 의 비용 표에 적는다.

## 폴더

폴더는 아래 아홉 개뿐이다. 새 폴더를 만들지 않는다.

| 폴더 | 내용 |
|---|---|
| `app` | 화면(`/`, `/apply`, `/survey` 와 그 하위)과 API 경로(`app/api`). 실제 주소는 모두 `/hisshaus` 아래다 |
| `components` | 화면 조각, `StepForm`, 필드(`components/fields`) |
| `forms` | 문항 정의(`apply.ts`, `survey.ts`)·형(`types.ts`)·규칙(`rules.ts`) |
| `content` | 매장 정보(`shop.ts`) |
| `lib` | 설정·검증·시트·슬랙·초안 저장 |
| `public` | 사진(`hero.jpg`, `og.jpg`) |
| `tests` | Vitest, `tests/e2e` 는 Playwright 와 가짜 슬랙·시트 |
| `scripts` | 시트 헤더 출력 |
| `docs` | 설계·문항·계획 |

## 명령

```bash
pnpm dev                    # 개발 서버 http://localhost:3020/hisshaus (127.0.0.1 로 열면 막힌다)
pnpm test                   # 단위·컴포넌트 (Vitest)
pnpm exec tsc --noEmit      # 형 검사
pnpm build                  # 빌드
pnpm e2e                    # 실제 브라우저 (Playwright). 처음에는 pnpm exec playwright install chromium
pnpm sheet:header           # 시트 두 탭의 헤더 출력
```

## 문서

- 설계: `docs/superpowers/specs/2026-10-23-hisshaus-form-design.md`
- 문항 원문: `docs/superpowers/specs/2026-10-23-hisshaus-form-questions.md`
- 구현 계획: `docs/superpowers/plans/2026-10-23-hisshaus-form.md`
- 설정·운영: `README.md`
