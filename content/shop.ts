import { BASE_PATH } from '../lib/base-path'

// 매장 정보와 링크 미리보기 문구. 비밀이 아니라서 커밋한다.
// "사장님이 채울 값" 이라고 적힌 것은 지금 자리 표시이고, 정해지면 이 파일에서 값만 바꾼다.
export const shop = {
  name: 'Hiss Haus',
  nameKo: '히스하우스',
  // 사장님이 채울 값: 매장 주소. 첫 화면 정보 줄의 '위치' 에 나온다.
  address: '주소는 추후 입력',
  // 사장님이 채울 값: 영업시간. 첫 화면 정보 줄의 '영업시간' 에 나온다.
  hours: '영업시간은 추후 입력',
  // 금액(10,000원)은 완료 화면 안내(components/Done.tsx)에도 적혀 있다. 바꾸면 둘 다 고친다.
  deposit: '10,000원 입금 시 확정',
  // 사장님이 채울 값: 첫 화면 큰 사진. 지금은 자리 표시 그림이다. public/hero.jpg 를 같은 이름으로 바꿔 넣는다.
  // (카카오톡 링크 미리보기 그림은 public/og.jpg 이고 app/layout.tsx 와 app/survey/page.tsx 가 가리킨다.)
  // <img> 주소에는 basePath 가 붙지 않아서 직접 붙인다.
  heroImage: `${BASE_PATH}/hero.jpg`,
  ogTitle: '히스하우스 예약 신청',
  ogDescription: '히스하우스 예약 신청서를 작성해 주세요.',
  // 사장님이 채울 값: 개인정보 보유 기간. 지금은 자리 표시 '1년'.
  // 신청서 동의문의 "예약이 끝난 뒤 {값}까지 보관하고 지워요." 에 들어가므로 '1년'·'3년' 처럼 기간으로 적는다.
  privacyRetention: '1년',
} as const
