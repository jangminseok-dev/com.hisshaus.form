# 설정과 배포

로컬 실행, 외부 서비스(슬랙·구글 시트·Vercel·도메인) 설정, 매장 정보 바꾸기, 테스트를 적은 문서입니다. 예전 `README.md` 에 있던 내용을 그대로 옮겼습니다. 비용·운영·동의서 사용법은 [OPERATIONS.md](OPERATIONS.md) 에 있습니다.

## 로컬 실행

Node.js 24 LTS(24.15.0 이상)와 pnpm 11 을 권한다. 22.22.2 이상의 22.x 도 된다(Vitest·jsdom 요구 범위). 개발과 확인은 Node 25.9 · pnpm 11.17 에서 했다.

```bash
pnpm install
cp .env.example .env.local   # 아래 네 값을 채운다
pnpm dev                     # http://localhost:3020/hisshaus
```

`.env.local` 은 git 에 올라가지 않는다(`.gitignore` 의 `.env*`). 슬랙·서비스 계정·시트 값을 만드는 방법은 이어지는 세 절에 있다.

| 변수 | 값 |
|---|---|
| `SLACK_WEBHOOK_URL` | 슬랙 수신 웹훅 주소(`https://hooks.slack.com/services/` 로 시작) |
| `SLACK_MENTION` (선택) | 알림 첫 줄에 붙일 멘션. `channel`·`here`·슬랙 멤버 ID(`U…`, 프로필 → ⋯ → 멤버 ID 복사). 쉼표로 여러 개. 휴대폰 슬랙은 기본 설정에서 멘션이 있어야 울린다. 없으면 멘션 없이 보낸다. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 서비스 계정 키(JSON)를 base64 한 줄로 바꾼 값 |
| `GOOGLE_SHEET_ID` | 신청을 쌓을 시트의 ID |
| `HOLIDAY_API_KEY` (선택) | 공공데이터포털 '한국천문연구원_특일 정보' 의 일반 인증키(**Decoding**). data.go.kr 에서 '특일 정보' 를 검색해 활용신청하고, 마이페이지 → 데이터활용 → Open API → 활용신청 현황에서 복사한다(Encoding 키를 넣으면 두 번 인코딩돼 거절된다). 승인 직후 1~2시간은 키가 아직 등록되지 않았다고 거절될 수 있다. 없으면 공휴일을 막지 않고 화요일만 막는다. |
| `SURVEY_LINK_SECRET` | 검사지 링크의 서명 비밀값. `openssl rand -base64 32` 로 만든 한 줄(32자 이상). 운영(Vercel)과 `pnpm survey:link` 를 돌리는 `.env.local` 이 같은 값이어야 한다. 바꾸면 이미 보낸 검사지 링크가 모두 막힌다. |
| `MAIL_ADDRESS` | 동의서 사본을 보낼 네이버 메일 주소. 동의서 기능에만 필요하다. 없으면 사장님 화면·서명만 500 이다. |
| `MAIL_APP_PASSWORD` | 위 계정의 네이버 앱 비밀번호(SMTP 용). 동의서 기능에만 필요하다. 없으면 사장님 화면·서명만 500 이다. |
| `ADMIN_PASSWORD` | 사장님 화면 로그인 비밀번호(10자 이상). 동의서 기능에만 필요하다. 없으면 사장님 화면·서명만 500 이다. |
| `ADMIN_PIN` | 사장님 화면 잠금 해제 PIN(4자리). 동의서 기능에만 필요하다. 없으면 사장님 화면·서명만 500 이다. |

- 선택이 아닌 네 값 중 하나라도 없으면 서버가 `환경 변수 SLACK_WEBHOOK_URL 이 없다.` 처럼 빠진 변수 이름만 담은 오류를 낸다. `pnpm dev` 는 이 오류를 찍고 바로 끝난다. `pnpm start` 는 떠 있지만 `public/` 의 사진 같은 정적 파일만 열리고, 페이지와 세 API 경로(`/api/apply`·`/api/survey`·`/api/consent`)는 모두 500 이다(요청마다 같은 오류가 로그에 찍힌다). `GOOGLE_SERVICE_ACCOUNT_JSON` 이 base64 가 아니거나 `client_email`·`private_key` 가 없으면 `환경 변수 GOOGLE_SERVICE_ACCOUNT_JSON 을 읽을 수 없다.` 가, `SURVEY_LINK_SECRET` 이 32자보다 짧으면 `환경 변수 SURVEY_LINK_SECRET 이 너무 짧다.` 가 나온다. 어느 경우에도 값은 찍지 않는다. `pnpm build` 는 변수가 없어도 통과한다.
- 개발 서버는 `http://localhost:3020/hisshaus` 로 연다(`http://localhost:3020` 은 그리로 보낸다). `127.0.0.1` 로 열면 Next 개발 서버가 브라우저 코드를 막아(403) 화면이 동작하지 않는다.
- `.env.local` 에 진짜 값을 넣고 개발 서버에서 신청을 내면 **진짜 슬랙·시트로 간다.** 시험은 시험용 채널·시트로 하거나, 시험 행을 시트에서 지운다. 자동 테스트(`pnpm e2e`)는 가짜 서비스로만 보낸다.
- 운영 모드로 확인하려면 `pnpm build` 뒤 `pnpm start` 를 쓴다(같은 3020 포트).
- `pnpm dev`·`pnpm build` 에 `metadataBase property in metadata export is not set …` 경고가 나온다. 정상이다(아래 도메인 연결 참고).

## 슬랙 수신 웹훅 만들기

1. <https://api.slack.com/apps> 에서 `Create an app` → `Blank app` → `Continue` 를 고르고, 앱 이름(예: `히스하우스 예약 알림`)과 워크스페이스를 정한 뒤 `Create` 를 누른다.
2. 앱 설정의 `Incoming Webhooks` 에서 `Activate Incoming Webhooks` 를 켠다.
3. 아래쪽 `Add New Webhook to Workspace` 를 누르고 알림을 받을 채널을 골라 허용한다. 비공개 채널이면 먼저 그 채널의 구성원이어야 한다.
4. `Webhook URLs for Your Workspace` 에 생긴 주소를 복사해 `SLACK_WEBHOOK_URL` 에 넣는다.

- 채널에는 보호자 연락처를 포함한 답변 전체가 올라온다. 사장님과 담당자만 있는 채널을 고른다.
- 주소는 비밀이다. 아는 사람은 누구나 그 채널에 글을 쓸 수 있다(슬랙은 유출된 주소를 폐기한다). 코드·로그·문서·커밋·채팅에 붙이지 않는다.

## 구글 서비스 계정 만들기

서버가 시트에 쓰려면 사람 계정 대신 서비스 계정이 필요하다.

1. [Google Cloud 콘솔](https://console.cloud.google.com)에서 프로젝트를 만든다(있으면 그대로 쓴다). 결제 계정은 연결하지 않아도 된다.
2. 같은 프로젝트에서 Google Sheets API 를 켠다: <https://console.cloud.google.com/flows/enableapi?apiid=sheets.googleapis.com>
3. `IAM & Admin` → `Service Accounts` → `Create service account` 에서 이름(예: `hisshaus-form`)만 적고 역할은 주지 않은 채 `Done` 을 누른다. 시트 접근은 시트 공유로 준다.
4. 만든 서비스 계정을 눌러 `Keys` 탭 → `Add key` → `Create new key` → 키 유형 `JSON` → `Create` 를 누른다. JSON 파일이 한 번만 내려받아진다.
5. 아래 명령으로 base64 한 줄로 바꾸고, 출력 전체를 `GOOGLE_SERVICE_ACCOUNT_JSON` 에 넣는다.

   ```bash
   base64 -i key.json | tr -d '\n'
   ```

   `key.json` 은 저장소 밖(다운로드 폴더 등)에 두고, 변환한 뒤 지운다. 저장소 안에 두면 git 에 올라갈 수 있다. 키를 잃으면 콘솔에서 새로 만들고 옛 키는 지운다.
6. 서비스 계정의 이메일(`이름@프로젝트ID.iam.gserviceaccount.com`, 키 JSON 의 `client_email` 과 같다)을 적어 둔다. 시트를 공유할 때 쓴다.

회사(Google Workspace) 조직의 프로젝트는 조직 정책 `iam.disableServiceAccountKeyCreation` 이 키 만들기를 막을 수 있다(2024-05-03 이후 만든 조직은 기본으로 막힌다). 개인 구글 계정에서 만든 프로젝트에서는 해당 없다.

## 시트 만들기

1. 새 구글 스프레드시트를 만들고 탭 셋의 이름을 정확히 `예약신청`, `검사지`, `동의서` 로 한다. 이름이 다르면 시트 저장이 실패해 보호자에게 "지금은 보낼 수 없어요" 가 나온다.
2. 세 탭의 첫 줄에 헤더를 붙인다. `pnpm sheet:header` 는 탭 이름 줄과 탭으로 구분한 헤더 줄을 번갈아 여섯 줄 출력한다(지금은 예약신청 42칸, 검사지 105칸, 동의서 20칸이다. 서비스별 묶음의 칸은 고르지 않은 서비스면 비어 있다). 탭 구분을 그대로 붙여야 칸이 나뉘므로 맥에서는 클립보드로 바로 보낸다. 이때는 pnpm 의 실행 안내 줄(`$ tsx scripts/sheet-header.mjs`)이 섞일 일이 없게 스크립트를 직접 실행한다. 출력은 여섯 줄뿐이다.

   ```bash
   pnpm exec tsx scripts/sheet-header.mjs | sed -n 2p | pbcopy   # 예약신청 헤더 → 예약신청 탭의 A1 에 붙여넣기
   pnpm exec tsx scripts/sheet-header.mjs | sed -n 4p | pbcopy   # 검사지 헤더 → 검사지 탭의 A1 에 붙여넣기
   pnpm exec tsx scripts/sheet-header.mjs | sed -n 6p | pbcopy   # 동의서 헤더 → 동의서 탭의 A1 에 붙여넣기
   ```

3. 서비스 계정 이메일을 시트의 편집자로 공유한다(`공유` → 이메일 입력 → `편집자`).
4. 시트 ID 를 `GOOGLE_SHEET_ID` 에 넣는다. 주소가 `https://docs.google.com/spreadsheets/d/<ID>/edit…` 일 때 `<ID>` 부분이다.

- 신청 하나가 한 줄이다. 맨 앞 두 열이 `접수 시각`(한국 시각) · `신청 ID` 이고 그 뒤는 문항 순서다. 값은 `RAW` 로 들어가 보호자가 `=` 로 시작하는 글을 적어도 수식이 되지 않는다. 희망 날짜는 `YYYY-MM-DD` 글자, 시간은 `HH:MM` 글자(슬랙에는 '오후 1:30' 꼴), 복수 선택은 `, ` 로 이은 한 칸이다.
- 열 순서와 헤더는 문항 정의(`forms/`)에서 만든다. 문항을 바꾸면 열도 바뀌므로, 이미 쌓인 시트가 있으면 `pnpm sheet:header` 를 다시 돌려 열을 맞춘다.
- 시트에는 보호자 연락처와 반려견 정보가 쌓인다. 공유 범위를 사장님과 담당자로 제한한다.

## Vercel 배포

1. 이 저장소를 GitHub 에 올리고(저장소는 사용자가 만든다) Vercel 의 [New Project](https://vercel.com/new) 에서 그 저장소를 골라 가져온다. Next.js 로 자동 인식되고 빌드 설정은 바꾸지 않는다. 변수는 아직 넣지 않고 배포한다(빌드는 변수가 없어도 통과한다). 저장소는 개인 GitHub 계정에 만든다. Hobby 는 GitHub 조직이 가진 비공개 저장소에서 배포할 수 없다(Vercel 문서 `Deploying Git Repositories` 의 `Using Hobby teams`: 공개 저장소로 하거나 Pro 로 올려야 한다).
2. 배포가 끝나면 `Settings` → `Environment Variables` 에 필수 네 변수(`SLACK_WEBHOOK_URL`·`GOOGLE_SERVICE_ACCOUNT_JSON`·`GOOGLE_SHEET_ID`·`SURVEY_LINK_SECRET`)와 동의서 기능의 네 변수(`MAIL_ADDRESS`·`MAIL_APP_PASSWORD`·`ADMIN_PASSWORD`·`ADMIN_PIN` — 없으면 사장님 화면과 동의서 서명이 500 이다)를 넣는다. 선택인 `SLACK_MENTION`·`HOLIDAY_API_KEY` 는 쓸 때만 넣는다. 값은 위 '로컬 실행' 의 변수 표대로다. 환경은 **Production 만** 고른다. 웹훅 주소·키 JSON·`SURVEY_LINK_SECRET`·`MAIL_APP_PASSWORD`·`ADMIN_PASSWORD`·`ADMIN_PIN`·`HOLIDAY_API_KEY` 는 `Type` 에서 `Secret` 을 고른다(저장 뒤에는 대시보드에서도 값을 다시 볼 수 없다. 예전 이름은 `Sensitive` 이고 지금은 `Secret` 으로 다룬다). `MAIL_ADDRESS`(보관 메일 주소)는 `Config` 로 둔다.
3. 환경변수는 새 배포부터 적용되므로 `Deployments` 에서 다시 배포한다(변수를 바꿀 때마다 같다).
4. 배포 주소에서 교육미용을 고른 신청서를 한 번 직접 내서 슬랙 한 통(끝에 검사지 링크)이 오고 시트에 한 줄이 생기는지 본다. 그 링크로 검사지가 열리는지도 본다. 시험 행은 시트에서 지운다. 빌드는 변수가 없어도 통과하므로, 배포가 성공했다고 변수가 맞게 들어간 것은 아니다.
5. 사장님 화면(`<주소>/hisshaus/admin`)에 `ADMIN_PASSWORD` 로 들어가 '메일 시험 보내기' 를 누르고 hisshaus 메일함에 시험 메일이 오는지 본다. 이어서 동의서 하나를 만들어('신청서 없이 새로 만들기') 사본을 받을 이메일에 자기 주소를 적어 직접 서명해 보고, 보관 메일·사본 메일·슬랙 알림이 오는지 본다. 끝나면 시트 '동의서' 탭의 그 시험 줄(준비·서명·메일)과 시험 메일을 지운다.
6. 실기기로 동의서를 확인한다(크로미움 e2e 로는 볼 수 없다). 시험 줄·메일은 5단계처럼 지운다.
   - [ ] 카카오톡 인앱 브라우저에서 링크를 열어 서명하고 완료 화면의 'PDF 내려받기' 를 누른다. 안 받아지면 버튼 아래 '카카오톡 안에서는 내려받기가 안 될 수 있어요.' 안내가 보이는지, 메일로 사본이 오는지 본다.
   - [ ] 아이패드 Safari 에서 '이 기기에서 바로 서명' 으로 잠금 서명한다. 서명 중·완료 뒤에 뒤로 스와이프·주소창으로 사장님 화면에 가도 PIN 화면만 보이는지, '사장님 화면으로' → PIN 으로 풀리는지 본다.
   - [ ] 실제 네이버 SMTP 로 서명 한 건을 보낸 뒤 Vercel `Logs` 에서 `/api/consent` 함수 시간(Duration)이 30초보다 넉넉히 짧은지 본다.

- Preview 환경에는 넣지 않는다. 넣으면 미리보기 배포에서 낸 시험 제출도 진짜 슬랙·시트로 간다. 값이 없는 미리보기 배포에서는 제출이 실패한다. 미리보기에서 제출까지 시험하려면 Preview 에 시험용 채널·시트 값을 따로 넣는다.
- `SHEETS_BASE_URL`·`SHEETS_FAKE_TOKEN`·`MAIL_FAKE_URL` 은 e2e 전용이다. Vercel 에 넣지 않는다(넣어도 운영에서는 읽지 않는다).
- Node.js 는 22.x 이상이어야 한다(`google-auth-library` 요구). Vercel 의 기본 24.x 면 된다(`Settings` → `Build and Deployment` → `Node.js Version`).
- 세 API 경로(`/api/apply`·`/api/survey`·`/api/consent`, `app/api/**/route.ts`)와 사장님 화면(`/admin`)은 일이 끝난 뒤 응답하므로 `maxDuration` 을 30초로 올려 두었다. 신청서는 시트 저장과 슬랙 전송, 검사지는 시트 읽기(이미 냈나)·저장과 슬랙 전송, 동의서 서명은 시트 읽기·PDF 만들기·시트 저장·메일 두 통(함께 보내고 통마다 12초까지)·슬랙 전송, 사장님 화면은 메일 다시 보내기(시트 읽기·PDF·메일)를 한다. Hobby 는 이 값을 허용한다.
- 서버 로그는 프로젝트의 `Logs` 에서 본다. Hobby 는 1시간 분량만 남는다. 로그에는 `시트 저장 실패`, `슬랙 전송 실패` 와 신청 ID 꼴만 찍힌다. 동의서는 `시트 저장 실패`·`슬랙 전송 실패`·`메일 전송 실패`·`PDF 만들기 실패` 와 동의서 ID 다(메일 시험은 `메일 전송 실패 test`).

## 도메인 연결

운영 주소는 `chagocnote.com/hisshaus` 다. 웹 전체가 `/hisshaus` 아래에서 열리고(`next.config.ts` 의 `basePath`), 도메인 첫 주소 `chagocnote.com/` 은 `/hisshaus` 로 보낸다(임시 307). 연결 전에는 Vercel 이 주는 `*.vercel.app/hisshaus` 주소를 쓴다.

1. Vercel 프로젝트의 `Settings` → `Domains` → `Add Domain` 에 `chagocnote.com` 을 넣는다. `www.chagocnote.com` 도 함께 붙일지 물으면 `www` 를 `chagocnote.com` 으로 보내는 쪽을 고른다.
2. Vercel 이 보여 주는 값을 가비아 `DNS 관리` 에 넣는다. 루트 주소는 `A` 레코드(호스트 `@`), `www` 는 `CNAME` 레코드(호스트 `www`)다. 값은 Vercel 화면에 나온 그대로 쓴다. 네임서버는 가비아 것을 그대로 둔다.
3. 연결이 확인되면 한 번 다시 배포한다.

나중에 차곡노트 플랫폼이 `chagocnote.com` 을 맡게 되면, 도메인을 플랫폼 프로젝트로 옮기고 플랫폼 쪽에서 `/hisshaus` 로 들어온 요청을 이 프로젝트의 배포 주소로 넘긴다(rewrite). 보호자에게 나간 주소는 그대로 쓸 수 있다. 그때 `next.config.ts` 의 첫 주소 보내기(`redirects`)는 지운다.

카카오톡 링크 미리보기 그림(`og:image`)의 주소는 코드에 적지 않았다(`metadataBase` 를 두지 않았다). Vercel 에서는 Next 가 `VERCEL_PROJECT_PRODUCTION_URL`(커스텀 도메인이 있으면 가장 짧은 것, 없으면 `vercel.app` 주소)로 절대 주소를 만든다. 이 값은 빌드 때 페이지에 박히므로, 도메인을 붙인 뒤 다시 배포해야 새 주소로 바뀐다. 미리보기 그림이 안 나오면 페이지 소스의 `og:image` 가 운영 주소인지 먼저 본다. `localhost` 로 나오면 프로젝트 설정 `Environment Variables` 의 `Enable access to System Environment Variables` 가 켜져 있는지 확인한다. 로컬 `pnpm dev`·`pnpm build` 의 `metadataBase …` 경고는 이 때문이고, 로컬에서는 `localhost` 주소로 채운다.

## 매장 사진·정보 바꾸기

| 바꿀 것 | 파일 | 비고 |
|---|---|---|
| 첫 화면 큰 사진 | `public/hero.jpg` | 매장 내부 사진(1200×900). 화면에서는 4:3 으로 가운데를 잘라 보여 준다. |
| 카카오톡 링크 미리보기 그림 | `public/og-shop.jpg` | 같은 사진의 가운데를 자른 것(1200×630). 가로로 긴 JPG 나 PNG. **바꿀 때는 파일 이름도 새로 짓고** `app/layout.tsx`·`app/survey/[token]/page.tsx` 의 경로를 같이 고친다. 카카오톡이 그림을 주소별로 저장해 두어 같은 이름이면 옛 그림이 계속 보인다. |
| 이름·주소·영업시간·예약금 문구·입금 계좌·미리보기 제목과 설명·개인정보 보유 기간 | `content/shop.ts` | 사장님이 채울 값마다 주석이 있다. |
| 검사지 링크의 미리보기 제목과 설명 | `app/survey/[token]/page.tsx` | 사장님이 검사지 링크를 보낼 때 카카오톡에 보이는 글. 그림은 `public/og-shop.jpg` 를 같이 쓴다. |
| 검사지 링크의 도메인 | `lib/base-path.ts` 의 `SITE_ORIGIN` | 슬랙에 싣는 검사지 링크의 앞부분(지금 `https://chagocnote.com`). 히스하우스 전용 도메인으로 옮기면 이 값만 고친다. |

- 사진은 같은 이름으로 덮어쓴다. 이름이나 확장자를 바꾸면 `content/shop.ts` 의 `heroImage` 와 `app/layout.tsx`·`app/survey/[token]/page.tsx` 의 `og:image` 경로도 고친다.
- 사진은 최적화를 거치지 않고 원본 그대로 보호자 폰으로 간다(`next/image` 를 쓰지 않는다). 첫 화면 사진은 가로 1200px 안팎, 300KB 이하의 JPG 로 줄여서 넣는다.
- 예약금은 교육미용 상담 50,000원, 그 밖 10,000원이다. 금액은 `lib/deposit.ts`(완료 화면), `content/shop.ts` 의 `deposit`(첫 화면), `forms/apply.ts` 의 예약금 안내문 세 곳에 적혀 있다. 바꾸면 셋 다 고친다.
- 카카오톡은 미리보기를 한동안 보관한다. 사진을 바꾼 뒤 옛 모양이 보이면 카카오 디벨로퍼스의 공유 디버거에서 그 주소의 캐시를 지우고, 그래도 그대로면 사진 파일 이름을 바꾼다.

## 출시 전에 정할 것

2026-10-24 기준 모두 정해졌다(주소·영업시간·사진·예약금·입금 계좌·개인정보 보유 기간 1년). 값은 `content/shop.ts` 에 있다.

| 정할 것 | 어디에 | 비고 |
|---|---|---|
| (없음 — 2026-10-24 기준 모두 정해졌다) | | |

## 테스트

```bash
pnpm test                                # 단위·컴포넌트 (Vitest)
pnpm exec tsc --noEmit                   # 형 검사
pnpm build                               # 빌드(경로 표와 형 검사 포함)
pnpm exec playwright install chromium    # e2e 를 처음 돌릴 때 한 번
pnpm e2e                                 # 실제 브라우저 (Playwright)
```

CI 는 없다. 푸시하기 전에 로컬에서 위를 돌린다.

**e2e 는 진짜 서비스를 부르지 않는다.** `pnpm e2e` 는 포트 3030(웹)·3031(가짜 슬랙·시트)에 전용 서버를 직접 띄우고 신청 내용을 가짜 서비스로만 보낸다. 이미 떠 있는 서버를 쓰지 않으므로(`reuseExistingServer: false`) 그 두 포트가 비어 있어야 한다. **e2e 전에 개발 서버(`pnpm dev`, 3020)를 끈다.** Next 16 은 같은 폴더에서 `next dev` 를 둘 띄우지 못하게 잠근다. 개발 서버가 떠 있으면 e2e 는 `Another next dev server is already running.` 과 `Process from config.webServer was not able to start` 를 내고 곧바로 실패하며, 테스트가 한 건도 돌지 않으므로 진짜 서비스로 가지 않는다. 실패하면 `test-results/playwright/` 에 추적 파일이 남는다(git 에 올라가지 않는다).
