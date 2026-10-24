import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { viewport } from '../app/layout'
import NotFoundPage from '../app/not-found'
import { metadata as surveyMetadata } from '../app/survey/page'
import { Done } from '../components/Done'
import { Landing } from '../components/Landing'
import { SurveyDone } from '../components/SurveyDone'
import { TrainingIntro } from '../components/TrainingIntro'
import { shop } from '../content/shop'
import { TRAINING_SERVICE } from '../forms/apply'
import { loadDraft, loadSession, saveDraft, saveSession, type ApplySession } from '../lib/draft'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
// next/font/local 은 Next 컴파일러가 바꿔 쓰는 함수라 그대로 부르면 던진다. app/layout.tsx 를 읽으려고 대신한다.
vi.mock('next/font/local', () => ({ default: () => ({ className: 'font' }) }))

const fetchMock = vi.fn<typeof fetch>()
const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })

const session: ApplySession = {
  submissionId: 'Ab3dE5gH7j',
  guardianName: '김하나',
  guardianPhone: '010-1234-5678',
  petName: '보리',
  services: ['Grooming 미용', TRAINING_SERVICE],
  wish: '10월 28일 (수) 오전',
  training: true,
  surveyDone: false,
}

/** 테스트가 풀어 줄 때까지 끝나지 않는 Promise. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const section = (name: string) => document.querySelector<HTMLElement>(`[data-section="${name}"]`)!

beforeEach(() => {
  localStorage.clear()
  router.push.mockReset()
  router.replace.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(reply(200, { ok: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('첫 화면', () => {
  it('매장 이름·제목과 양식 둘·사진·안내·정보 순서로 있다 — 할 일(양식 선택)이 사진보다 위다', () => {
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
    expect(within(section('lead')).getByText('작성할 양식을 골라 주세요.')).toBeInTheDocument()
    // 안내는 한 문단이다(잡초 뽑기). 상세 순서는 완료 화면에 있다.
    const paragraphs = Array.from(section('intro').querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toEqual(['신청서를 보내 주시면 확인하고 연락드려요. 날짜와 시간을 정하고 예약금을 입금하면 예약이 완료돼요.'])

    // 양식 둘은 링크 이름이 제목 줄이고(설명 줄은 이름에 들어가지 않는다) 각자 양식으로 간다.
    const choices = within(section('choices')).getAllByRole('link')
    expect(choices.map((l) => [l.textContent?.includes('예약 신청서') ? '예약 신청서' : '검사지', l.getAttribute('href')])).toEqual([
      ['예약 신청서', '/apply'],
      ['검사지', '/survey'],
    ])
    expect(within(section('choices')).getByRole('link', { name: '예약 신청서' })).toHaveAttribute('href', '/apply')
    expect(within(section('choices')).getByRole('link', { name: '심층 행동 분석 검사지' })).toHaveAttribute('href', '/survey')
    // 설명 줄은 이름이 아니라 설명으로 들린다.
    expect(within(section('choices')).getByRole('link', { name: '예약 신청서' })).toHaveAccessibleDescription(
      '미용, 데이케어, 호텔, 교육미용 상담을 예약해요',
    )
    expect(within(section('choices')).getByRole('link', { name: '심층 행동 분석 검사지' })).toHaveAccessibleDescription(
      '교육미용 상담 전에 반려견의 행동을 미리 알려 주세요',
    )
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

describe('검사지 안내', () => {
  it('세션이 없으면 첫 화면으로 보내고 아무것도 그리지 않는다', () => {
    const { container } = render(<TrainingIntro />)
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(container).toBeEmptyDOMElement()
  })

  // 이미 취소했거나 검사지를 낸 사람이 주소로 다시 열어 '교육미용은 아니에요' 를 또 누르면 취소 알림이 한 통 더 간다.
  it('교육미용을 취소한 세션이면 검사지 안내는 완료로 보낸다', () => {
    saveSession({ ...session, training: false })
    const { container } = render(<TrainingIntro />)

    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith('/apply/done')
    // 안내를 잠깐도 보이지 않는다(눌러서 취소 알림을 또 보낼 버튼이 없다).
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('검사지를 이미 냈으면 검사지 안내는 완료로 보낸다', () => {
    saveSession({ ...session, surveyDone: true })
    const { container } = render(<TrainingIntro />)

    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledWith('/apply/done')
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('제목·문단·상자·버튼이 있다', async () => {
    saveSession(session)
    render(<TrainingIntro />)

    expect(await screen.findByRole('heading', { level: 1, name: '심층 행동 분석 검사지를 이어서 작성해요' })).toBeInTheDocument()
    expect(screen.getByText('중간에 창을 닫아도 쓰던 자리가 저장돼요.')).toBeInTheDocument()
    expect(
      screen.getByText(
        '예약 신청은 여기서 먼저 접수돼요. 검사지를 다 못 써도 신청은 히스하우스에 전달돼요. 검사지는 나중에 같은 링크로 이어서 쓸 수 있어요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '검사지 작성 시작' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '교육미용은 아니에요' })).toBeEnabled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('검사지 안내에 문항 수가 없다', async () => {
    saveSession(session)
    const { container } = render(<TrainingIntro />)
    await screen.findByRole('heading', { level: 1 })
    expect(container.textContent).not.toContain('98')
    expect(container.textContent).not.toMatch(/문항|소요|\d\s*분/)
    expect(container.textContent).not.toContain('입니다')
    expect(container.textContent).not.toContain('됩니다')
  })

  it('검사지 작성 시작은 검사지로 간다', async () => {
    saveSession(session)
    render(<TrainingIntro />)
    fireEvent.click(await screen.findByRole('button', { name: '검사지 작성 시작' }))
    expect(router.push).toHaveBeenCalledWith('/survey?from=apply')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('교육미용은 아니에요 를 누르면 취소 요청을 보내고 세션을 고치고 완료로 간다', async () => {
    saveSession(session)
    saveDraft('survey', { answers: { q3: '김하나' }, groupIndex: 2, submissionId: session.submissionId, key: 'Qq3dE5gH7j' })
    render(<TrainingIntro />)

    fireEvent.click(await screen.findByRole('button', { name: '교육미용은 아니에요' }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
    // 세션을 고쳐도(training:false) 안내의 가드가 완료로 한 번 더 보내지 않는다.
    expect(router.replace).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/hisshaus/api/apply/cancel-training')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual({
      submissionId: session.submissionId,
      petName: '보리',
      guardianName: '김하나',
    })
    // 교육미용이 아니니 쓰던 검사지 초안은 버린다.
    expect(loadSession()).toEqual({ ...session, training: false })
    expect(loadDraft('survey')).toBeNull()
    // 이동은 방문 기록에 안내 화면을 남기지 않는다.
    expect(router.push).not.toHaveBeenCalled()
  })

  it.each([
    ['서버가 실패를 주면', () => fetchMock.mockResolvedValue(reply(503, { ok: false }))],
    ['서버 오류에 본문이 없으면', () => fetchMock.mockResolvedValue(reply(500))],
    ['네트워크가 끊기면', () => fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))],
    ['시간이 초과되면', () => fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))],
  ])('교육미용은 아니에요 를 누르면 취소 요청 뒤 실패해도 완료로 간다 — %s', async (_name, fail) => {
    saveSession(session)
    fail()
    render(<TrainingIntro />)

    fireEvent.click(await screen.findByRole('button', { name: '교육미용은 아니에요' }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
    expect(loadSession()).toEqual({ ...session, training: false })
  })

  it('취소 요청을 보내는 동안 두 버튼이 막히고 한 번만 보낸다', async () => {
    saveSession(session)
    const sending = deferred<Response>()
    fetchMock.mockReturnValue(sending.promise)
    render(<TrainingIntro />)
    const cancel = await screen.findByRole('button', { name: '교육미용은 아니에요' })
    const start = screen.getByRole('button', { name: '검사지 작성 시작' })

    fireEvent.click(cancel)
    expect(cancel).toBeDisabled()
    expect(start).toBeDisabled()
    fireEvent.click(cancel)
    fireEvent.click(start)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()

    await act(async () => sending.resolve(reply(200, { ok: true })))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/apply/done'))
  })

  it('취소 요청에 35초 시간 제한을 건다', async () => {
    saveSession(session)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    render(<TrainingIntro />)
    fireEvent.click(await screen.findByRole('button', { name: '교육미용은 아니에요' }))
    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    expect(timeout).toHaveBeenCalledWith(35_000)
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
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

  it('교육미용이고 검사지를 안 썼으면 이어서 쓰기 링크가 있다', async () => {
    saveSession(session)
    render(<Done />)
    const link = await screen.findByRole('link', { name: '검사지 이어서 쓰기' })
    expect(link).toHaveAttribute('href', '/survey?from=apply')
  })

  it.each([
    ['교육미용이 아니면', { training: false, surveyDone: false }],
    ['검사지를 이미 썼으면', { training: true, surveyDone: true }],
  ])('%s 이어서 쓰기 링크가 없다', async (_name, over) => {
    saveSession({ ...session, ...over })
    render(<Done />)
    await screen.findByRole('heading', { level: 1, name: '보리의 신청서가 잘 도착했어요' })
    expect(screen.queryByRole('link', { name: '검사지 이어서 쓰기' })).not.toBeInTheDocument()
    // 확인은 첫 화면으로 가고, 세션과 검사지 초안을 지운다(공용 기기에서 다음 사람이 완료 화면을 못 본다).
    saveDraft('survey', { answers: { q3: '김하나' }, groupIndex: 0, submissionId: session.submissionId, key: 'Kk3dE5gH7j' })
    const ok = screen.getByRole('link', { name: '확인' })
    expect(ok).toHaveAttribute('href', '/')
    fireEvent.click(ok)
    expect(loadSession()).toBeNull()
    expect(loadDraft('survey')).toBeNull()
  })

  it('검사지 이어서 쓰기는 세션을 지우지 않는다(검사지가 신청 ID 를 이어받아야 한다)', async () => {
    saveSession(session)
    render(<Done />)
    fireEvent.click(await screen.findByRole('link', { name: '검사지 이어서 쓰기' }))
    expect(loadSession()).not.toBeNull()
  })

  it('교육미용이고 검사지를 안 썼으면 검사지 링크와 함께 확인도 있다', async () => {
    saveSession(session)
    render(<Done />)
    await screen.findByRole('link', { name: '검사지 이어서 쓰기' })
    expect(screen.getByRole('link', { name: '확인' })).toHaveAttribute('href', '/')
  })

  it('서비스가 하나여도 요약이 이어진다', async () => {
    saveSession({ ...session, services: ['Hotel 호텔'], training: false })
    render(<Done />)
    expect(await screen.findByText('Hotel 호텔 · 10월 28일 (수) 오전 희망')).toBeInTheDocument()
  })
})

describe('검사지 완료 화면', () => {
  it('신청서를 내고 이어서 쓴 경우: 신청과 함께 전달됐다고 알리고 다음 순서와 처음으로 링크가 있다', async () => {
    saveSession({ ...session, surveyDone: true })
    const { container } = render(<SurveyDone />)
    expect(screen.getByRole('heading', { level: 1, name: '보리의 검사지가 잘 도착했어요' })).toBeInTheDocument()
    expect(await screen.findByText('예약 신청과 함께 히스하우스에 전달됐어요.')).toBeInTheDocument()
    expect(screen.getByText('3. 확정된 뒤 예약금 50,000원을 아래 계좌로 입금해 주세요')).toBeInTheDocument()
    expect(screen.getByText('553-910109-67607')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '다음 순서' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: '예약 신청서 쓰기' })).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('입니다')
    expect(container.textContent).not.toContain('됩니다')
  })

  it('검사지만 바로 쓴 경우(세션 없음): 신청서도 써 달라고 안내하고 신청서 링크가 있다', async () => {
    render(<SurveyDone />)
    expect(await screen.findByRole('link', { name: '예약 신청서 쓰기' })).toHaveAttribute('href', '/apply')
    expect(screen.getByText(/검사지만으로는 예약이 잡히지 않아요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '처음으로' })).toHaveAttribute('href', '/')
    expect(screen.queryByText(/예약 신청과 함께/)).not.toBeInTheDocument()
    // 처음으로 = 끝. 남은 초안을 지운다.
    saveDraft('survey', { answers: { q3: '김하나' }, groupIndex: 2, submissionId: 'Ab3dE5gH7j', key: 'Kk3dE5gH7j' })
    fireEvent.click(screen.getByRole('link', { name: '처음으로' }))
    expect(loadDraft('survey')).toBeNull()
  })
})

describe('화면 맞춤(viewport)', () => {
  it('화면을 기기 끝까지 채운다(viewport-fit=cover) — 아래 고정 막대의 안전 영역 여백은 CSS 가 비운다', () => {
    // themeColor: 폰 브라우저의 주소창·상태 표시줄을 바탕색(#f6f3ed)과 같게.
    expect(viewport).toEqual({ width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f6f3ed' })
  })
})

describe('검사지 주소의 링크 미리보기', () => {
  // 사장님이 카카오톡으로 /survey 만 보낼 때 보이는 미리보기다. 정하지 않으면 첫 화면(app/layout.tsx)의 '예약 신청' 이 보인다.
  // Next 는 openGraph 를 통째로 덮으므로 그림도 다시 적어야 한다.
  it('검사지 제목·설명과 미리보기 그림을 가진다', () => {
    const title = '히스하우스 심층 행동 분석 검사지'
    const description = '교육미용 상담을 위해 반려견에 대해 알려 주세요.'
    expect(surveyMetadata).toEqual({ title, description, openGraph: { title, description, images: ['/hisshaus/og-shop.jpg'] } })
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
    expect(renderToString(<TrainingIntro />)).toBe('')
    expect(read).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
