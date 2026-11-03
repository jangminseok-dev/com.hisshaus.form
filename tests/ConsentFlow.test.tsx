import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConsentFlow } from '../components/ConsentFlow'
import { PAGES } from '../lib/consent-docs'
import type { Prepared } from '../lib/consent-store'
import { todayKst } from '../lib/format'
import type { postForResult as PostForResult } from '../lib/post'
import { decodeSignature } from '../lib/signature'

const postForResult = vi.hoisted(() => vi.fn<typeof PostForResult>())
vi.mock('../lib/post', () => ({ postForResult }))

const TOKEN = `CnSt123456-${'0'.repeat(32)}`
const PREPARED: Prepared = {
  id: 'CnSt123456',
  applyId: 'Ab3dE5gH7j',
  bundle: 'behavior',
  programName: '짖음 줄이기',
  goal: '초인종 소리에 짖지 않기',
  classTime: '',
  groomingParts: [],
  shown: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티' },
  createdAt: '2026-11-03 10:00:00',
}
const EMAIL = 'hana@example.com'
const CREDIT = 'ⓒ 어글리독 All rights reserved'
const FAILED = '지금은 보낼 수 없어요. 잠시 뒤 다시 눌러 주세요.'
// 'PDF' 를 base64 로. 내려받기는 이 바이트를 그대로 Blob 에 담는다.
const PDF_BASE64 = btoa('%PDF-1.7')

const open = (over: Partial<{ prepared: Prepared; device: boolean }> = {}) =>
  render(<ConsentFlow token={TOKEN} prepared={over.prepared ?? PREPARED} device={over.device ?? false} />)

const heading = () => screen.getByRole('heading', { level: 2 })
const button = (name: string) => screen.getByRole('button', { name })
const typeInto = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

/** 사인 칸을 끈다. jsdom 은 캔버스를 그리지 않으므로 칸 크기만 정해 준다. */
function draw() {
  const canvas = screen.getByLabelText('서명 칸')
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100, x: 0, y: 0, toJSON() {},
  })
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 40, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 120, clientY: 70, pointerId: 1 })
}

/** 정보 확인에서 이메일을 적고 세 장에 모두 동의해 서명 단계까지 간다. */
function goToSign() {
  typeInto('사본을 받을 이메일', EMAIL)
  fireEvent.click(button('다음'))
  for (const id of ['agreement', 'behavior', 'guidelines'] as const) {
    fireEvent.click(screen.getByLabelText(PAGES[id].agreeLabel))
    fireEvent.click(button('다음'))
  }
}

/** 서명 단계에서 사인하고 전자 서명에 동의한 뒤 서명하기. */
async function signAndSubmit() {
  draw()
  fireEvent.click(screen.getByLabelText('전자 방식으로 서명하는 데 동의해요'))
  await act(async () => {
    fireEvent.click(button('서명하기'))
  })
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  postForResult.mockReset()
  postForResult.mockResolvedValue({ result: 'ok', data: { pdf: PDF_BASE64, mailed: true } })
})
afterEach(() => vi.restoreAllMocks())

describe('ConsentFlow', () => {
  it('정보 → 장마다 동의 → 서명 순서이고, 체크·사인 전에는 다음·서명하기가 막힌다', () => {
    open()
    // ① 정보 확인: 신청서 값이 채워져 있고 이메일은 비어 있다.
    expect(heading()).toHaveTextContent('계약서에 이렇게 들어가요')
    expect(screen.getByText('틀린 곳이 있으면 고쳐 주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('보호자 성함')).toHaveValue('김하나')
    expect(screen.getByLabelText('연락처')).toHaveValue('010-1234-5678')
    expect(screen.getByLabelText('반려견 이름')).toHaveValue('보리')
    expect(screen.getByLabelText('견종')).toHaveValue('말티')
    expect(screen.getByLabelText('사본을 받을 이메일')).toHaveValue('')
    expect(
      screen.getByText('동의서 사본을 보내고 서명 기록을 남기려고 이메일, 서명, 서명한 기기 정보와 시각을 받아요. 서명일부터 5년 동안 보관한 뒤 지워요.'),
    ).toBeInTheDocument()

    // 비어 있거나 서버가 받지 않을 값이면 넘어가지 않고 칸 아래에 알린다(휴대폰 010, 주소 하나).
    fireEvent.click(button('다음'))
    expect(heading()).toHaveTextContent('계약서에 이렇게 들어가요')
    expect(screen.getByText('꼭 적어 주세요')).toBeInTheDocument()
    typeInto('사본을 받을 이메일', 'hana@example')
    typeInto('연락처', '02-123-4567')
    fireEvent.click(button('다음'))
    expect(screen.getByText('이메일을 다시 확인해 주세요')).toBeInTheDocument()
    expect(screen.getByText('휴대폰 번호(010)로 적어 주세요')).toBeInTheDocument()
    expect(heading()).toHaveTextContent('계약서에 이렇게 들어가요')
    typeInto('사본을 받을 이메일', EMAIL)
    typeInto('연락처', '01012345678')
    fireEvent.click(button('다음'))

    // ② 장마다: 묶음의 장 순서대로, 체크해야 다음이 열린다.
    for (const id of ['agreement', 'behavior', 'guidelines'] as const) {
      expect(heading()).toHaveTextContent(PAGES[id].title)
      expect(screen.getByRole('img', { name: PAGES[id].title })).toHaveAttribute('src', PAGES[id].image)
      expect(button('다음')).toBeDisabled()
      fireEvent.click(screen.getByLabelText(PAGES[id].agreeLabel))
      expect(button('다음')).toBeEnabled()
      if (id === 'behavior') {
        // 이전으로 돌아갔다 와도 켠 체크는 그대로다.
        fireEvent.click(button('이전'))
        expect(heading()).toHaveTextContent(PAGES.agreement.title)
        fireEvent.click(button('다음'))
        expect(screen.getByLabelText(PAGES.behavior.agreeLabel)).toBeChecked()
      }
      fireEvent.click(button('다음'))
    }

    // ③ 서명: 사인과 전자 서명 동의가 모두 있어야 서명하기가 열린다.
    expect(screen.getByText(`이 주소로 사본을 보내요: ${EMAIL}`)).toBeInTheDocument()
    expect(button('서명하기')).toBeDisabled()
    draw()
    expect(button('서명하기')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('전자 방식으로 서명하는 데 동의해요'))
    expect(button('서명하기')).toBeEnabled()
    fireEvent.click(button('다시 그리기'))
    expect(button('서명하기')).toBeDisabled()
  })

  it('장 그림 위에 보호자·사장님 값과 오늘 날짜를 얹고, 글로 읽기에 장 글이 있다', () => {
    open()
    typeInto('견종', '말티즈')
    typeInto('사본을 받을 이메일', EMAIL)
    fireEvent.click(button('다음'))
    fireEvent.click(screen.getByLabelText(PAGES.agreement.agreeLabel))
    fireEvent.click(button('다음'))

    const field = (key: string) => document.querySelector(`[data-field="${key}"]`)
    const [year, month, day] = todayKst().split('-')
    expect(field('guardianName')).toHaveTextContent('김하나')
    expect(field('phoneMid')).toHaveTextContent('1234')
    expect(field('phoneLast')).toHaveTextContent('5678')
    expect(field('petName')).toHaveTextContent('보리')
    expect(field('breed')).toHaveTextContent('말티즈')
    expect(field('programName')).toHaveTextContent('짖음 줄이기')
    expect(field('goal')).toHaveTextContent('초인종 소리에 짖지 않기')
    expect(field('manager')).toHaveTextContent('히스하우스')
    expect(field('signerName')).toHaveTextContent('김하나')
    expect(field('yearSuffix')).toHaveTextContent(year.slice(2))
    expect(field('month')).toHaveTextContent(String(Number(month)))
    expect(field('day')).toHaveTextContent(String(Number(day)))
    // 사인 칸은 비워 둔다.
    expect(field('signature')).toBeNull()

    const details = screen.getByText('글로 읽기').closest('details')!
    expect(details.textContent).toContain('목표')
  })

  it('미용 묶음은 고른 부위 칸에만 체크를 얹는다', () => {
    open({ prepared: { ...PREPARED, bundle: 'generalGrooming', programName: '', goal: '', groomingParts: ['등', '귀청소'] } })
    typeInto('사본을 받을 이메일', EMAIL)
    fireEvent.click(button('다음'))
    expect(heading()).toHaveTextContent(PAGES.generalGrooming.title)
    expect(document.querySelector('[data-field="part:등"]')).toHaveTextContent('✓')
    expect(document.querySelector('[data-field="part:귀청소"]')).toHaveTextContent('✓')
    expect(document.querySelector('[data-field="part:배"]')).toBeNull()
  })

  it('보낼 때 묶음의 모든 장 ID 와 esign: true, 사인을 담는다', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof PostForResult>>) => void
    postForResult.mockReturnValue(new Promise((r) => (resolve = r)))
    open()
    typeInto('견종', ' 말티즈 ')
    goToSign()
    await signAndSubmit()

    expect(postForResult).toHaveBeenCalledTimes(1)
    const [url, body] = postForResult.mock.calls[0]
    expect(url).toBe('/api/consent')
    expect(body).toEqual({
      token: TOKEN,
      info: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈', email: EMAIL },
      agreed: ['agreement', 'behavior', 'guidelines'],
      esign: true,
      signature: expect.any(String),
      website: '',
    })
    expect(decodeSignature((body as { signature: string }).signature)).not.toBeNull()
    // 보내는 동안은 막히고 이전으로도 못 간다.
    expect(screen.getByRole('button', { name: /보내는 중/ })).toBeDisabled()
    expect(button('이전')).toBeDisabled()

    await act(async () => resolve({ result: 'ok', data: { pdf: PDF_BASE64, mailed: true } }))
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
  })

  it('완료 화면은 사본 결과에 따라 문구가 다르고 PDF 내려받기가 있다', async () => {
    const createObjectURL = vi.fn(() => 'blob:consent')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })

    open()
    goToSign()
    await signAndSubmit()
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
    expect(screen.getByText('메일로 사본을 보냈어요')).toBeInTheDocument()
    expect(screen.queryByText('기기를 사장님께 돌려주세요')).toBeNull()

    fireEvent.click(button('PDF 내려받기'))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe('%PDF-1.7')
    expect(clicked).toHaveLength(1)
    expect(clicked[0].href).toBe('blob:consent')
    expect(clicked[0].download).toBe(`히스하우스_동의서_행동수정 트레이닝_보리_${todayKst().replace(/-/g, '')}.pdf`)
  })

  it('사본 메일이 실패했으면 곧 다시 보낸다고 하고, 이미 서명된 재시도면 내려받기 없이 메일로 보내 드린다고 한다', async () => {
    postForResult.mockResolvedValue({ result: 'ok', data: { pdf: PDF_BASE64, mailed: false } })
    const first = open()
    goToSign()
    await signAndSubmit()
    expect(screen.getByText('사본 메일은 곧 다시 보내 드릴게요')).toBeInTheDocument()
    expect(screen.queryByText('메일로 사본을 보냈어요')).toBeNull()
    expect(button('PDF 내려받기')).toBeInTheDocument()
    first.unmount()

    postForResult.mockResolvedValue({ result: 'ok', data: { mailed: false } })
    open()
    goToSign()
    await signAndSubmit()
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
    expect(screen.getByText('사본은 메일로 보내 드려요. 받지 못했다면 카카오톡 채널로 알려 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF 내려받기' })).toBeNull()
    expect(screen.queryByText('사본 메일은 곧 다시 보내 드릴게요')).toBeNull()
  })

  it('카카오톡 인앱 브라우저면 내려받기 버튼은 두고 그 아래에 내려받기가 안 될 수 있다고 알린다', async () => {
    const KAKAO_NOTE = '카카오톡 안에서는 내려받기가 안 될 수 있어요. 메일로 받은 사본을 확인해 주세요.'
    const ua = vi.spyOn(navigator, 'userAgent', 'get')
    // 사본을 보냈으면 메일로 받은 사본을 보라고 한다. 대소문자는 가리지 않는다.
    ua.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.9.0')
    const first = open()
    goToSign()
    await signAndSubmit()
    expect(button('PDF 내려받기')).toBeInTheDocument()
    expect(screen.getByText(KAKAO_NOTE)).toBeInTheDocument()
    first.unmount()

    // 사본 메일이 실패했으면 실패 줄을 그대로 두고, 메일로 받았다고 하지 않는다.
    ua.mockReturnValue('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 kakaotalk/25.9.0')
    postForResult.mockResolvedValue({ result: 'ok', data: { pdf: PDF_BASE64, mailed: false } })
    const second = open()
    goToSign()
    await signAndSubmit()
    expect(button('PDF 내려받기')).toBeInTheDocument()
    expect(screen.getByText('사본 메일은 곧 다시 보내 드릴게요')).toBeInTheDocument()
    expect(screen.getByText('카카오톡 안에서는 내려받기가 안 될 수 있어요.')).toBeInTheDocument()
    expect(screen.queryByText(KAKAO_NOTE)).toBeNull()
    second.unmount()

    // 다른 브라우저에는 이 안내가 없다.
    ua.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    postForResult.mockResolvedValue({ result: 'ok', data: { pdf: PDF_BASE64, mailed: true } })
    open()
    goToSign()
    await signAndSubmit()
    expect(button('PDF 내려받기')).toBeInTheDocument()
    expect(screen.queryByText(/카카오톡 안에서는/)).toBeNull()
  })

  it('아이패드(device)면 완료 화면에 내려받기 대신 기기를 돌려 달라고 한다', async () => {
    open({ device: true })
    goToSign()
    await signAndSubmit()
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PDF 내려받기' })).toBeNull()
    expect(screen.getByText('기기를 사장님께 돌려주세요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '사장님 화면으로' }).getAttribute('href')).toMatch(/\/admin$/)
  })

  it('모든 단계 맨 아래에 출처 문구가 있다', async () => {
    open()
    const creditIsLast = () => {
      const credit = screen.getByText(CREDIT)
      // 화면 안 마지막 글(아래 고정 버튼 막대 앞)이다.
      const texts = Array.from(document.querySelectorAll('[data-step] p, [data-step] details, [data-step] figure'))
      expect(texts.at(-1)).toBe(credit)
    }
    creditIsLast()
    typeInto('사본을 받을 이메일', EMAIL)
    fireEvent.click(button('다음'))
    for (const id of ['agreement', 'behavior', 'guidelines'] as const) {
      creditIsLast()
      fireEvent.click(screen.getByLabelText(PAGES[id].agreeLabel))
      fireEvent.click(button('다음'))
    }
    creditIsLast()
    await signAndSubmit()
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
    creditIsLast()
  })

  it('서버가 거절하면 그 오류를 가진 단계로 돌아가 알린다', async () => {
    postForResult.mockResolvedValueOnce({ result: 'invalid', data: { errors: [{ questionId: 'email', message: '이메일을 다시 확인해 주세요' }] } })
    open()
    goToSign()
    await signAndSubmit()
    expect(heading()).toHaveTextContent('계약서에 이렇게 들어가요')
    const email = screen.getByLabelText('사본을 받을 이메일').closest('[data-question]') as HTMLElement
    expect(within(email).getByText('이메일을 다시 확인해 주세요')).toBeInTheDocument()

    // 고치면 서버 오류는 사라진다. 다시 서명 단계로 가면 체크·사인이 남아 있다.
    typeInto('사본을 받을 이메일', 'hana2@example.com')
    expect(within(email).queryByText('이메일을 다시 확인해 주세요')).toBeNull()

    postForResult.mockResolvedValueOnce({ result: 'invalid', data: { errors: [{ questionId: 'signature', message: '사인해 주세요' }] } })
    fireEvent.click(button('다음'))
    for (const id of ['agreement', 'behavior', 'guidelines'] as const) {
      expect(screen.getByLabelText(PAGES[id].agreeLabel)).toBeChecked()
      fireEvent.click(button('다음'))
    }
    await act(async () => {
      fireEvent.click(button('서명하기'))
    })
    expect(heading()).toHaveTextContent('마지막으로 사인해 주세요')
    expect(screen.getByText('사인해 주세요')).toBeInTheDocument()

    postForResult.mockResolvedValueOnce({ result: 'invalid', data: { errors: [{ questionId: 'agreed', message: '모든 문서에 동의해 주세요' }] } })
    await act(async () => {
      fireEvent.click(button('서명하기'))
    })
    expect(heading()).toHaveTextContent(PAGES.agreement.title)
    expect(screen.getByText('모든 문서에 동의해 주세요')).toBeInTheDocument()
  })

  it('닫힌 링크면 열 수 없다는 안내로 바뀐다', async () => {
    postForResult.mockResolvedValue({ result: 'closed' })
    open()
    goToSign()
    await signAndSubmit()
    expect(screen.getByRole('heading', { name: '열 수 없는 동의서예요' })).toBeInTheDocument()
  })

  it('보내지 못하면 다시 눌러 달라고 하고, 다시 누르면 또 보낸다', async () => {
    postForResult.mockResolvedValueOnce({ result: 'failed' })
    open()
    goToSign()
    await signAndSubmit()
    expect(screen.getByRole('alert')).toHaveTextContent(FAILED)
    expect(button('서명하기')).toBeEnabled()
    await act(async () => {
      fireEvent.click(button('서명하기'))
    })
    expect(postForResult).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: '서명이 끝났어요' })).toBeInTheDocument()
  })

  it('신청서 없이 만든 동의서는 칸이 비어 있고 보호자가 다 적는다', () => {
    open({ prepared: { ...PREPARED, applyId: '', shown: null } })
    for (const label of ['보호자 성함', '연락처', '반려견 이름', '견종', '사본을 받을 이메일']) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
    fireEvent.click(button('다음'))
    expect(screen.getAllByText('꼭 적어 주세요')).toHaveLength(5)
  })
})

describe('postForResult', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const reply = (status: number, body?: object) => new Response(body === undefined ? null : JSON.stringify(body), { status })
  const real = async () => (await vi.importActual<typeof import('../lib/post')>('../lib/post')).postForResult

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('200 은 본문을 읽고, 400 은 invalid(오류 목록), 409 는 closed, 그 밖과 거부는 failed 다', async () => {
    const post = await real()
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true, pdf: 'AAAA', mailed: true }))
    expect(await post('/api/consent', { a: 1 })).toEqual({ result: 'ok', data: { ok: true, pdf: 'AAAA', mailed: true } })
    expect(fetchMock.mock.calls[0][0]).toBe('/hisshaus/api/consent')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ a: 1 }) })

    fetchMock.mockResolvedValueOnce(reply(400, { ok: false, errors: [{ questionId: 'email', message: 'x' }] }))
    expect(await post('/api/consent', {})).toEqual({ result: 'invalid', data: { ok: false, errors: [{ questionId: 'email', message: 'x' }] } })
    fetchMock.mockResolvedValueOnce(reply(400))
    expect(await post('/api/consent', {})).toEqual({ result: 'invalid' })
    fetchMock.mockResolvedValueOnce(reply(409, { ok: false }))
    expect(await post('/api/consent', {})).toEqual({ result: 'closed' })
    fetchMock.mockResolvedValueOnce(reply(503, { ok: false }))
    expect(await post('/api/consent', {})).toEqual({ result: 'failed' })
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    expect(await post('/api/consent', {})).toEqual({ result: 'failed' })
  })
})
