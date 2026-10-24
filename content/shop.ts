import { BASE_PATH } from '../lib/base-path'

// 매장 정보와 링크 미리보기 문구. 비밀이 아니라서 커밋한다.
// "사장님이 채울 값" 이라고 적힌 것은 지금 자리 표시이고, 정해지면 이 파일에서 값만 바꾼다.
export const shop = {
  name: 'Hiss Haus',
  nameKo: '히스하우스',
  // 매장 주소. 첫 화면 정보 줄의 '위치' 에 나온다.
  address: '경기 수원시 팔달구 인계로 21 제2상가 104호',
  // 주소를 누르면 여는 네이버 지도. 주소로 찾은 위치에서 '도착' 을 누르면 길찾기가 된다.
  // 매장이 네이버 지도에 등록되면 그 장소 링크(naver.me/…)로 바꾸면 매장 이름·리뷰가 함께 보인다.
  mapUrl: `https://map.naver.com/p/search/${encodeURIComponent('경기 수원시 팔달구 인계로 21')}`,
  // 영업시간. 첫 화면 정보 줄의 '영업시간' 에 나온다. 줄마다 한 줄로 보인다.
  hours: '월~수 10:00~16:00\n목~일 10:00~20:00',
  // 같은 영업시간을 요일별로. 희망 시간 칩(lib/slots.ts)이 고른 날짜의 요일에 맞춰 30분 단위로 만든다. days: 0 = 일요일.
  openHours: [
    { days: [1, 2, 3], open: '10:00', close: '16:00' },
    { days: [4, 5, 6, 0], open: '10:00', close: '20:00' },
  ],
  // 예약금 안내 글. 금액은 lib/deposit.ts(완료 화면·검사지 완료 화면이 씀)와 forms/apply.ts 의 예약금 안내문에도 적혀 있다. 바꾸면 셋 다 고친다.
  deposit: '미용·데이케어·호텔 10,000원\n교육미용 상담 50,000원\n입금 시 확정',
  // 예약금 입금 계좌(사장님이 알려 준 값, 2026-10-24). 완료 화면·검사지 완료 화면·예약금 안내문에 보인다. 복사 버튼은 하이픈을 뺀 숫자를 복사한다.
  bankAccount: { bank: '하나은행', number: '553-910109-67607' },
  // 첫 화면 큰 사진(매장 내부). 바꿀 때는 public/hero.jpg 를 같은 이름으로 덮어쓴다.
  // (카카오톡 링크 미리보기 그림은 public/og-shop.jpg 이고 app/layout.tsx 와 app/survey/page.tsx 가 가리킨다.)
  // <img> 주소에는 basePath 가 붙지 않아서 직접 붙인다.
  heroImage: `${BASE_PATH}/hero.jpg`,
  // 첫 화면 정보 줄의 인스타그램 링크. 공유 링크의 추적 값(?rpxt=…)은 뺐다. handle 은 화면에 @hisshaus 로 보인다.
  instagramHandle: 'hisshaus',
  instagramUrl: 'https://www.instagram.com/hisshaus/',
  ogTitle: '히스하우스 예약 신청',
  ogDescription: '히스하우스 예약 신청서를 작성해 주세요.',
  // 개인정보 보유 기간(사장님 결정 2026-10-24: 1년).
  // 신청서 동의문의 "예약이 끝난 뒤 {값}까지 보관하고 지워요." 에 들어가므로 '1년'·'3년' 처럼 기간으로 적는다.
  privacyRetention: '1년',
} as const
