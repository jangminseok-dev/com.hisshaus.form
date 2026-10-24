import { shop } from '../content/shop'
import type { FormDef } from './types'

export const TRAINING_SERVICE = '교육미용 / 미용 트레이닝 상담'

export const GROOMING_SERVICE = 'Grooming 미용'
export const DAYCARE_SERVICE = 'Daycare 데이케어'
export const HOTEL_SERVICE = 'Hotel 호텔'

const OX = ['O', 'X']

export const applyForm: FormDef = {
  id: 'apply',
  title: '예약 신청',
  groups: [
    {
      id: 'guardian',
      title: '보호자 정보',
      questions: [
        { id: 'guardian_name', label: '보호자 성함', type: 'short', required: true },
        { id: 'guardian_phone', label: '보호자 연락처', type: 'phone', required: true },
        {
          id: 'privacy_consent',
          label: '개인정보 수집·이용 동의',
          type: 'consent',
          required: true,
          consentText: [
            '보호자 성함·연락처와 반려견 정보는 예약 상담과 안내에만 사용해요.',
            `예약이 끝난 뒤 ${shop.privacyRetention}까지 보관하고, 그 뒤에는 지워요.`,
          ].join('\n'),
        },
      ],
    },
    {
      id: 'pet',
      title: '반려견 정보',
      questions: [
        { id: 'pet_name', label: '반려견 이름', type: 'short', required: true },
        { id: 'pet_breed', label: '반려견 견종', type: 'short', required: true },
        { id: 'pet_age', label: '반려견 나이', type: 'short', required: true },
        { id: 'pet_weight', label: '반려견 몸무게', type: 'short', required: true },
        { id: 'pet_sex', label: '반려견 성별', type: 'single', required: true, options: ['남', '여'] },
        { id: 'pet_neutered', label: '반려견 중성화 여부', type: 'single', required: true, options: OX },
        { id: 'pet_vaccinated', label: '예방접종 유무', type: 'single', required: true, options: OX },
        { id: 'pet_health', label: '질병, 질환 등 건강상태에 대해 알려주세요.', type: 'long', required: true },
        { id: 'pet_treatment', label: '최근 수술 또는 치료 이력이 있으면 알려주세요.', type: 'long', required: true },
        {
          id: 'pet_aggression',
          label: '사람이나 다른 강아지에 대한 공격성 여부',
          type: 'single',
          required: true,
          options: OX,
          hint: '심한 경우 이용에 제한이 있을 수 있어요',
        },
      ],
    },
    {
      id: 'visit',
      title: '이용 서비스',
      note: '서비스를 고르면 다음 화면에서 서비스별 희망 날짜와 요청 사항을 여쭤봐요.',
      questions: [
        {
          id: 'services',
          label: '히스하우스 이용 서비스',
          type: 'multi',
          required: true,
          options: [GROOMING_SERVICE, DAYCARE_SERVICE, HOTEL_SERVICE, TRAINING_SERVICE],
        },
        { id: 'visit_type', label: '히스하우스 방문 여부', type: 'single', required: true, options: ['첫 방문', '재방문'] },
      ],
    },
    // 아래 넷은 구글폼의 서비스별 섹션이다. 고른 서비스의 묶음만 보인다. 날짜·체크인·체크아웃만 필수로 올렸고(원문은 전부 선택)
    // 나머지는 원문대로 선택이다. 묶음 안내문은 원문 질문을 해요체로 옮긴 것이다.
    {
      id: 'grooming',
      title: 'Grooming 미용',
      showIf: { questionId: 'services', includes: GROOMING_SERVICE },
      questions: [
        { id: 'groom_date', label: '희망 예약 날짜', type: 'date', required: true },
        { id: 'groom_time', label: '희망 시간', type: 'time', required: false, dateId: 'groom_date' },
        { id: 'groom_kind', label: '원하시는 미용 종류', type: 'short', required: false },
        { id: 'groom_sensitive', label: '만지는 것을 특히 싫어하는 부위가 있으면 알려주세요.', type: 'short', required: false },
        { id: 'groom_request', label: '미용 중 요청사항이 있으면 편하게 알려주세요.', type: 'long', required: false },
      ],
    },
    {
      id: 'daycare',
      title: 'Daycare 데이케어',
      showIf: { questionId: 'services', includes: DAYCARE_SERVICE },
      questions: [
        { id: 'daycare_date', label: '희망 이용 날짜', type: 'date', required: true },
        { id: 'daycare_time', label: '이용 예정 시간', type: 'time', required: false, dateId: 'daycare_date' },
        { id: 'daycare_social', label: '다른 강아지와 사회성', type: 'short', required: false },
        { id: 'daycare_separation', label: '분리불안 여부', type: 'short', required: false },
        { id: 'daycare_feeding', label: '사료 및 복용약 급여 여부', type: 'short', required: false },
        { id: 'daycare_request', label: '요청 사항이 있으면 편하게 알려주세요', type: 'long', required: false },
      ],
    },
    {
      id: 'hotel',
      title: 'Hotel 호텔',
      showIf: { questionId: 'services', includes: HOTEL_SERVICE },
      questions: [
        // 원문은 '체크인 날짜 / 시간' 한 칸이지만 달력·시간 칩으로 받으려고 날짜와 시간으로 나눴다.
        { id: 'hotel_checkin_date', label: '체크인 날짜', type: 'date', required: true },
        { id: 'hotel_checkin_time', label: '체크인 시간', type: 'time', required: true, dateId: 'hotel_checkin_date' },
        { id: 'hotel_checkout_date', label: '체크아웃 날짜', type: 'date', required: true },
        { id: 'hotel_checkout_time', label: '체크아웃 시간', type: 'time', required: true, dateId: 'hotel_checkout_date' },
        { id: 'hotel_meals', label: '식사 횟수 및 시간', type: 'short', required: false },
        { id: 'hotel_food', label: '사료 급여량', type: 'short', required: false },
        { id: 'hotel_meds', label: '복용약 여부와 방법', type: 'short', required: false },
        { id: 'hotel_anxiety', label: '분리 불안 및 야간 짖음 여부', type: 'short', required: false },
        { id: 'hotel_stayed', label: '보호자와 떨어져 숙박한 경험', type: 'single', required: false, options: OX },
        {
          id: 'hotel_caution',
          label: '호텔 이용 시 특별히 주의해야 할 사항',
          type: 'long',
          required: false,
          hint: '호텔에 기본적으로 직원이 상주하진 않으나 필요하신 분은 미리 말씀해주세요.',
        },
      ],
    },
    {
      id: 'training',
      // 구글폼 섹션 제목 그대로(선택지 '교육미용 / …' 와 띄어쓰기가 다른 것도 원문대로).
      title: '교육 미용 / 미용 트레이닝 상담',
      note: '교육에 대한 자세한 안내는 따로 연락드려요.',
      showIf: { questionId: 'services', includes: TRAINING_SERVICE },
      questions: [
        // 라벨은 시트 열 이름이라 미용 묶음의 '희망 시간' 과 겹치지 않게 앞에 교육미용을 붙였다.
        { id: 'training_date', label: '교육미용 희망 날짜', type: 'date', required: true },
        { id: 'training_time', label: '교육미용 희망 시간', type: 'time', required: false, dateId: 'training_date' },
      ],
    },
    // 구글폼의 마지막 섹션 '예약금 안내'. 입금 계좌는 사장님이 정해 주면 note 에 넣는다.
    {
      id: 'deposit',
      title: '예약금 안내',
      // 금액은 lib/deposit.ts·content/shop.ts 와 맞춘다.
      note: [
        '신청서를 확인한 뒤 연락드릴게요. 날짜와 시간을 맞춘 뒤 예약금을 입금해 주시면 예약이 확정돼요.',
        '',
        '예약금은 한 번만 내요.',
        '· 교육미용 상담이 없으면 10,000원',
        '· 교육미용 상담이 있으면 50,000원',
        '',
        `입금 계좌: ${shop.bankAccount.bank} ${shop.bankAccount.number}`,
      ].join('\n'),
      questions: [
        { id: 'request', label: '마지막으로 요청 사항이 있으면 편하게 말씀해주세요!', type: 'long', required: false, hint: '감사합니다 :)' } // 구글폼 원문 인사. 사용자 결정(2026-10-24)으로 해요체로 바꾸지 않는다.,
      ],
    },
  ],
}
