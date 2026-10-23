import { shop } from '../content/shop'
import type { FormDef } from './types'

export const TRAINING_SERVICE = '교육미용 / 미용 트레이닝 상담'

const OX = ['O', 'X']
const SLOTS = ['오전', '오후', '상관없어요']

export const applyForm: FormDef = {
  id: 'apply',
  title: '예약 신청',
  groups: [
    {
      id: 'guardian',
      title: '보호자',
      questions: [
        { id: 'guardian_name', label: '보호자 성함', type: 'short', required: true },
        { id: 'guardian_phone', label: '보호자 연락처', type: 'phone', required: true },
        {
          id: 'privacy_consent',
          label: '개인정보 수집·이용 동의',
          type: 'consent',
          required: true,
          consentText: [
            '보호자 성함·연락처와 반려견 정보를 받아요.',
            '예약 상담과 안내에만 써요.',
            `예약이 끝난 뒤 ${shop.privacyRetention}까지 보관하고 지워요.`,
          ].join('\n'),
        },
      ],
    },
    {
      id: 'pet',
      title: '반려견',
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
      title: '희망 일시·서비스',
      note: '원하는 날짜와 시간대를 알려 주시면 가능한지 확인하고 연락드려요. 안 맞으면 함께 조율해요.',
      questions: [
        { id: 'wish1_date', label: '희망 날짜 1순위', type: 'date', required: true },
        { id: 'wish1_slot', label: '시간대', type: 'single', required: true, options: SLOTS },
        { id: 'wish2_date', label: '희망 날짜 2순위', type: 'date', required: false },
        { id: 'wish2_slot', label: '시간대', type: 'single', required: false, options: SLOTS },
        {
          id: 'services',
          label: '히스하우스 이용 서비스',
          type: 'multi',
          required: true,
          options: ['Grooming 미용', 'Daycare 데이케어', 'Hotel 호텔', TRAINING_SERVICE],
        },
        { id: 'visit_type', label: '히스하우스 방문 여부', type: 'single', required: true, options: ['첫 방문', '재방문'] },
      ],
    },
  ],
}
