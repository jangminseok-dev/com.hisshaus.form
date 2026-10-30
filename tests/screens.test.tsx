import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewport } from '../app/layout'
import NotFoundPage from '../app/not-found'
import { metadata as surveyLinkMetadata } from '../app/survey/[token]/page'
import { Done } from '../components/Done'
import { Landing } from '../components/Landing'
import { SurveyDone } from '../components/SurveyDone'
import { SurveyNotice } from '../components/SurveyNotice'
import { shop } from '../content/shop'
import { TRAINING_SERVICE } from '../forms/apply'
import { loadDraft, loadSession, saveDraft, saveSession, type ApplySession } from '../lib/draft'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
// next/font/local 은 Next 컴파일러가 바꿔 쓰는 함수라 그대로 부르면 던진다. app/layout.tsx 를 읽으려고 대신한다.
vi.mock('next/font/local', () => ({ default: () => ({ className: 'font' }) }))

const session: ApplySession = {
  submissionId: 'Ab3dE5gH7j',
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용', TRAINING_SERVICE],
  wish: '10월 28일 (수) 오전',
  training: true,
}

const section = (name: string) => document.querySelector<HTMLElement>(`[data-section="${name}"]`)!

beforeEach(() => {
  localStorage.clear()
  router.push.mockReset()
  router.replace.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('첫 화면', () => {
  it('매장 이름·제목과 신청서·사진·안내·정보 순서로 있다 — 할 일(신청서)이 사진보다 위다', () => {
    render(<Landing />)
    expect(Array.from(document.querySelectorAll('[data-section]')).map((e) => e.getAttribute('data-section'))).toEqual([
      'head',
      'lead',
      'choices',
      'hero',
      'intro',
      'info',
    ])

    expect(section('head')).toHaveTextContent(shop.name)
    const photo = within(section('hero')).getByRole('img', { name: '히스하우스 매장' })
    expect(photo).toHaveAttribute('src', shop.heroImage)
    // 이미지가 올라오기 전에도 자리가 잡히게 크기를 적는다.
    expect(photo).toHaveAttribute('width')
    expect(photo).toHaveAttribute('height')

    expect(within(section('lead')).getByRole('heading', { level: 1, name: '예약 신청' })).toBeInTheDocument()
    expect(within(section('lead')).getByText('신청서를 작성해 주세요.')).toBeInTheDocument()
    // 안내는 한 문단이다(잡초 뽑기). 상세 순서는 완료 화면에 있다.
    const paragraphs = Array.from(section('intro').querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toEqual(['신청서를 보내 주시면 확인하고 연락드려요. 날짜와 시간을 정하고 예약금을 입금하면 예약이 완료돼요.'])

    // 양식은 예약 신청서 하나다. 검사지는 사장님이 보낸 링크로만 연다(첫 화면에 길이 없다).
    const choices = within(section('choices')).getAllByRole('link')
    expect(choices.map((l) => l.getAttribute('href'))).toEqual(['/apply'])
    expect(within(section('choices')).getByRole('link', { name: '예약 신청서' })).toHaveAttribute('href', '/apply')
    // 설명 줄은 이름이 아니라 설명으로 들린다.
    expect(within(section('choices')).getByRole('link', { name: '예약 신청서' })).toHaveAccessibleDescription(
      '미용, 데이케어, 호텔, 교육미용 상담을 예약해요',
    )
    expect(document.querySelector('a[href*="survey"]')).toBeNull()
    expect(document.body.textContent).not.toContain('검사지')
    // 첫 화면에는 아래 고정 버튼이 없다.
    expect(screen.queryByRole('link', { name: '예약 신청하기' })).not.toBeInTheDocument()
  })

  it('첫 화면에 소요 시간 줄이 없다', () => {
    render(<Landing />)
    // '분' 한 글자로 찾으면 안내문의 '충분히' 가 걸려서, 숫자 뒤에 붙은 분만 본다.
    expect(screen.queryByText(/소요|\d\s*분/)).not.toBeInTheDocument()
    expect(Array.from(section('info').querySelectorAll('dt')).map((e) => e.textContent)).toEqual([
      '위치',
      '영업시간',
      '예약금',
      '문의',
      '소식',
    ])
  })

  it('정보 줄은 매장 정보 파일의 값을 보여 준다', () => {
    render(<Landing />)
    expect(Array.from(section('info').querySelectorAll('dd')).map((e) => e.textContent)).toEqual([
      shop.address,
      shop.hours,
      shop.deposit,
      '카카오톡 채널',
      `@${shop.instagramHandle}`,
    ])
    // 문의는 카카오톡 채널 채팅을 새 탭으로 연다.
    const kakao = within(section('info')).getByRole('link', { name: '카카오톡 채널' })
    expect(kakao).toHaveAttribute('href', 'https://pf.kakao.com/_uMxcJX/chat')
    expect(kakao).toHaveAttribute('target', '_blank')
  })

  it('정보 줄의 인스타그램 링크는 매장 인스타그램을 새 탭으로 연다', () => {
    render(<Landing />)
    const link = within(section('info')).getByRole('link', { name: '히스하우스 인스타그램' })
    expect(link).toHaveTextContent('@hisshaus')
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/hisshaus/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('주소를 누르면 네이버 지도를 새 탭으로 연다', () => {
    render(<Landing />)
    const link = screen.getByRole('link', { name: shop.address })
    expect(link).toHaveAttribute('href', shop.mapUrl)
    expect(link.getAttribute('href')).toMatch(/^https:\/\/map\.naver\.com\//)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('첫 화면 문구에 "~입니다" 가 없다', () => {
    const { container } = render(<Landing />)
    expect(container.textContent).not.toContain('입니다')
    expect(container.textContent).not.toContain('됩니다')
  })
})

describe('완료 화면', () => {
  it('세션이 없으면 완료 화면은 첫 화면으로 보낸다', () => {
    const { container } = render(<Done />)
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(container).toBeEmptyDOMElement()
  })

  it('완료 화면은 요약·다음 순서·연락처를 보여 준다', async () => {
    saveSession(session)
    const { container } = render(<Done />)

    expect(await screen.findByRole('heading', { level: 1, name: '보리의 신청서가 잘 도착했어요' })).toBeInTheDocument()
    expect(screen.getByText('Grooming 미용, 교육미용 / 미용 트레이닝 상담 · 10월 28일 (수) 오전 희망')).toBeInTheDocument()

    expect(screen.getByText('다음 순서')).toBeInTheDocument()
    expect(screen.getByText('1. 히스하우스가 신청서를 확인하고 연락드려요')).toBeInTheDocument()
    // 입금 계좌와 복사 버튼. 복사는 하이픈을 뺀 숫자다.
    expect(screen.getByText('553-910109-67607')).toBeInTheDocument()
    expect(screen.getByText(/예금주 김재성\(히어\)/)).toBeInTheDocument()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: '계좌번호 복사' }))
    expect(writeText).toHaveBeenCalledWith('55391010967607')
    expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument()
    // 교육미용이 든 신청이라 50,000원.
    expect(screen.getByText('2. 연락하면서 예약 날짜와 시간을 확정해요')).toBeInTheDocument()
    expect(screen.getByText('3. 확정된 뒤 예약금 50,000원을 아래 계좌로 입금해 주세요')).toBeInTheDocument()
    expect(screen.getByText('4. 입금이 확인되면 예약이 완료돼요')).toBeInTheDocument()

    // 방금 적은 본인이 확인하는 자리라 번호를 가리지 않는다.
    expect(screen.getByText(/곧 010-1234-5678 로 연락드릴게요\./)).toBeInTheDocument()
    expect(screen.getByText(/변경이나 취소는 카카오톡 채널로 알려 주세요\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '카카오톡 채널로 문의하기' })).toHaveAttribute('href', 'https://pf.kakao.com/_uMxcJX/chat')
    expect(container.textContent).not.toContain('입니다')
    expect(container.textContent).not.toContain('됩니다')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('교육미용이면 다음 순서 끝에 입금 확인 뒤 검사지 링크를 보낸다는 줄이 있다 — 검사지로 가는 버튼은 없다', async () => {
    saveSession(session)
    render(<Done />)
    expect(await screen.findByText('5. 입금이 확인되면 카카오톡으로 검사지 링크를 보내 드려요')).toBeInTheDocument()
    expect(document.querySelector('a[href*="survey"]')).toBeNull()
  })

  it('교육미용이 아니면 그 줄이 없다', async () => {
    saveSession({ ...session, services: ['Grooming 미용'], training: false })
    render(<Done />)
    await screen.findByText('4. 입금이 확인되면 예약이 완료돼요')
    expect(screen.queryByText(/검사지/)).not.toBeInTheDocument()
  })

  it.each([
    ['교육미용이면', true],
    ['교육미용이 아니면', false],
  ])('%s 버튼은 카카오톡과 확인 둘이고, 확인은 첫 화면으로 가며 세션과 검사지 초안을 지운다(공용 기기)', async (_name, training) => {
    saveSession({ ...session, training })
    render(<Done />)
    await screen.findByRole('heading', { level: 1, name: '보리의 신청서가 잘 도착했어요' })
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['카카오톡 채널로 문의하기', '확인'])
    saveDraft('survey', { answers: { q3: '김하나' }, groupIndex: 0, submissionId: session.submissionId, key: 'Kk3dE5gH7j' })
    const ok = screen.getByRole('link', { name: '확인' })
    expect(ok).toHaveAttribute('href', '/')
    fireEvent.click(ok)
    expect(loadSession()).toBeNull()
    expect(loadDraft('survey')).toBeNull()
  })

  it('서비스가 하나여도 요약이 이어진다', async () => {
    saveSession({ ...session, services: ['Hotel 호텔'], training: false })
    render(<Done />)
    expect(await screen.findByText('Hotel 호텔 · 10월 28일 (수) 오전 희망')).toBeInTheDocument()
  })
})

describe('검사지 완료 화면', () => {
  it('잘 도착했다고 알리고 고칠 곳은 카카오톡으로 알려 달라고 한다 — 예약금·계좌·신청서 안내는 없다', () => {
    const { container } = render(<SurveyDone />)
    expect(screen.getByRole('heading', { level: 1, name: '검사지가 잘 도착했어요' })).toBeInTheDocument()
    expect(screen.getByText('상담 전에 꼼꼼히 읽어 볼게요. 고칠 내용이 있으면 카카오톡 채널로 알려 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '카카오톡 채널로 문의하기' })).toHaveAttribute('href', shop.kakaoChatUrl)
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(screen.getByText('출처: 어글리독')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/예약금|계좌|553-910109-67607|예약 신청서 쓰기/)
    expect(container.textContent).not.toMatch(/입니다|됩니다|십시오/)
  })

  it('세션이 있어도 없어도 같은 화면이다', () => {
    const without = render(<SurveyDone />).container.innerHTML
    cleanup()
    saveSession(session)
    expect(render(<SurveyDone />).container.innerHTML).toBe(without)
  })

  it('처음으로 = 다 봤다. 세션과 초안을 지운다(공용 기기)', () => {
    saveSession(session)
    saveDraft('survey', { answers: { q3: '김하나' }, groupIndex: 2, submissionId: 'Ab3dE5gH7j', key: 'Kk3dE5gH7j' })
    render(<SurveyDone />)
    fireEvent.click(screen.getByRole('link', { name: '처음으로' }))
    expect(loadDraft('survey')).toBeNull()
    expect(loadSession()).toBeNull()
  })

  it('누구나 열 수 있는 주소라 문항 정의(forms/survey)를 불러오지 않는다 — 불러오면 문항 전체가 이 화면의 JS 에 실린다', () => {
    const source = readFileSync('components/SurveyDone.tsx', 'utf8')
    expect(source).not.toMatch(/from '\.\.\/forms\/survey'/)
  })
})

describe('검사지 안내(링크 없음·닫힌 링크)', () => {
  it.each([
    ['locked', '검사지는 받은 링크로 열어 주세요', '심층 행동 분석 검사지는 교육미용 상담 예약금 입금이 확인된 뒤 카카오톡으로 링크를 보내 드려요.'],
    ['closed', '이미 제출된 검사지예요', '고칠 내용이 있으면 카카오톡 채널로 알려 주세요.'],
  ] as const)('%s: 제목·본문·카카오톡·처음으로', (kind, title, text) => {
    const { container } = render(<SurveyNotice kind={kind} />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '카카오톡 채널로 문의하기' })).toHaveAttribute('href', shop.kakaoChatUrl)
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(container.textContent).not.toMatch(/입니다|됩니다|십시오/)
  })
})

describe('화면 맞춤(viewport)', () => {
  it('화면을 기기 끝까지 채운다(viewport-fit=cover) — 아래 고정 막대의 안전 영역 여백은 CSS 가 비운다', () => {
    // themeColor: 폰 브라우저의 주소창·상태 표시줄을 바탕색(#f6f3ed)과 같게.
    expect(viewport).toEqual({ width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f3ed' })
  })
})

describe('검사지 링크의 미리보기', () => {
  // 사장님이 카카오톡으로 검사지 링크를 보낼 때 보이는 미리보기다. 정하지 않으면 첫 화면(app/layout.tsx)의 '예약 신청' 이 보인다.
  // Next 는 openGraph 를 통째로 덮으므로 그림도 다시 적어야 한다.
  it('검사지 제목·설명과 미리보기 그림을 가진다', () => {
    const title = '히스하우스 심층 행동 분석 검사지'
    const description = '교육미용 상담을 위해 반려견에 대해 알려 주세요.'
    expect(surveyLinkMetadata).toEqual({ title, description, openGraph: { title, description, images: ['/hisshaus/og-shop.jpg'] } })
  })
})

describe('찾을 수 없는 주소', () => {
  it('제목·안내·처음으로 링크를 해요체로 보여 준다', () => {
    const { container } = render(<NotFoundPage />)
    expect(screen.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeInTheDocument()
    expect(screen.getByText('주소를 다시 확인해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(container.textContent).not.toMatch(/입니다|됩니다|십시오/)
  })
})

describe('서버에서 그릴 때', () => {
  it('세션이 필요한 화면은 저장소를 읽지 않고 아무것도 그리지 않는다', () => {
    saveSession(session)
    const read = vi.spyOn(Storage.prototype, 'getItem')
    expect(renderToString(<Done />)).toBe('')
    expect(read).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
