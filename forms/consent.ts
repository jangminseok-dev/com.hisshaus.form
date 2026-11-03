import type { Group } from './types'

// 동의서 서명 첫 화면의 보호자 정보. 화면·서버 검증(lib/consent-submit.ts)·'보호자가 고친 값' 의 라벨이 이것을 읽는다.
// 문항 id 는 시트 '동의서' 탭의 칸(GuardianInfo)·PDF 칸 이름과 같다. 바꾸면 lib/consent-submit.ts 도 고친다.
export const consentInfoGroup: Group = {
  id: 'consent_info',
  title: '보호자 정보',
  questions: [
    { id: 'guardianName', label: '보호자 성함', type: 'short', required: true, autoComplete: 'name' },
    { id: 'phone', label: '연락처', type: 'phone', required: true },
    { id: 'petName', label: '반려견 이름', type: 'short', required: true },
    { id: 'breed', label: '견종', type: 'short', required: true },
    {
      id: 'email',
      label: '사본을 받을 이메일',
      type: 'email',
      required: true,
      hint: '서명한 동의서 PDF 를 이 주소로 보내 드려요.',
    },
  ],
}
