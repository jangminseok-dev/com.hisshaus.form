import { expect, test, type Page } from '@playwright/test'

import { applyForm, TRAINING_SERVICE } from '../../forms/apply'
import { sheetHeader } from '../../lib/sheet-row'
import type { SlackMessage } from '../../lib/slack-blocks'
import { fakeState, resetFake, WEB_PORT } from './fake'
import {
  bodyText,
  choose,
  expectGroup,
  expectNoHorizontalOverflow,
  fillGroup,
  GUARDIAN,
  goNext,
  openApply,
  PHONE,
  recordGroups,
  setText,
  WISH_DATE,
  writeApply,
} from './fill'

// 진짜 슬랙·시트는 부르지 않는다. 제출은 가짜 서비스(fake-services.mjs)가 받고, 테스트가 받은 것을 읽는다.
test.beforeEach(async ({ request }) => {
  await resetFake(request)
})

const done = (page: Page) => page.getByRole('heading', { name: '신청이 접수되었어요' })
const FORBIDDEN = /입니다|됩니다|십시오/

/** 슬랙 통의 mrkdwn 본문(섹션 글)을 한 덩이로. */
function mrkdwn(message: SlackMessage): string {
  return message.blocks.flatMap((b) => (b.type === 'section' ? [b.text.text] : [])).join('\n')
}

test('신청서를 끝까지 쓰면 완료 화면이 뜨고 시트 한 줄·슬랙 한 통이 온다', async ({ page, request }) => {
  // 이름에 슬랙이 읽는 글자(< & >)를 넣는다.
  const pet = '보리<3 & 4>'
  await writeApply(page, { pet })

  await expect(page).toHaveURL(/\/apply\/done$/)
  await expect(done(page)).toBeVisible()
  // 이름은 글자 그대로 보이고(HTML 로 읽히지 않는다), 연락처는 가운데가 가려진다.
  await expect(page.getByText(`${pet} · Grooming 미용 · `)).toBeVisible()
  await expect(page.getByText('010-****-5678 로 연락드려요.')).toBeVisible()

  const { sheets, slack } = await fakeState(request)
  expect(sheets).toHaveLength(1)
  expect(slack).toHaveLength(1)

  const header = sheetHeader(applyForm)
  const [row] = sheets[0].values
  expect(row).toHaveLength(header.length)
  const cell = (label: string) => row[header.indexOf(label)]
  expect(cell('접수 시각')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  const applyId = cell('신청 ID')
  expect(applyId).toMatch(/^[A-Za-z0-9]{10}$/)
  expect(cell('보호자 성함')).toBe(GUARDIAN)
  expect(cell('보호자 연락처')).toBe(PHONE)
  expect(cell('개인정보 수집·이용 동의')).toBe('동의')
  expect(cell('반려견 이름')).toBe(pet)
  expect(cell('희망 날짜 1순위')).toBe(WISH_DATE)
  expect(cell('히스하우스 이용 서비스')).toBe('Grooming 미용')

  const [message] = slack
  // 머리글은 평문이라 그대로, 알림 미리보기와 본문(mrkdwn)은 & < > 를 이스케이프한다.
  expect(message.blocks[0]).toEqual({
    type: 'header',
    text: { type: 'plain_text', text: `🐾 새 예약 신청 — ${pet} (${GUARDIAN})` },
  })
  expect(message.text).toContain(`보리&lt;3 &amp; 4&gt; (${GUARDIAN})`)
  expect(mrkdwn(message)).toContain('*반려견 이름*\n보리&lt;3 &amp; 4&gt;')
  expect(mrkdwn(message)).not.toContain('<3')
  // 시트와 슬랙이 같은 신청 ID 로 이어진다.
  expect(JSON.stringify(message.blocks.at(-1))).toContain(applyId)
})

test('시트는 RAW 로, 정해진 탭에, 가짜 토큰으로 쓴다', async ({ page, request }) => {
  await writeApply(page)
  await expect(page).toHaveURL(/\/apply\/done$/)

  const { sheets } = await fakeState(request)
  expect(sheets).toHaveLength(1)
  expect(sheets[0].id).toBe('e2e-sheet')
  expect(sheets[0].range).toBe("'예약신청'!A1")
  expect(sheets[0].query).toEqual({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' })
  expect(sheets[0].authorization).toBe('Bearer e2e-token')
})

test('교육미용을 고르면 검사지 안내로 가고 아니에요를 누르면 취소 알림이 온다', async ({ page, request }) => {
  await writeApply(page, { training: true })

  await expect(page).toHaveURL(/\/apply\/training$/)
  await expect(page.getByRole('heading', { name: '심층 행동 분석 검사지를 이어서 작성해요' })).toBeVisible()
  // 안내까지 왔을 때: 신청은 이미 접수됐다(시트 한 줄, 슬랙 한 통).
  let state = await fakeState(request)
  expect(state.sheets).toHaveLength(1)
  expect(state.slack).toHaveLength(1)
  const applyId = state.sheets[0].values[0][1]

  await page.getByRole('button', { name: '교육미용은 아니에요' }).click()
  await expect(page).toHaveURL(/\/apply\/done$/)
  await expect(done(page)).toBeVisible()
  await expect(page.getByRole('link', { name: '검사지 이어서 쓰기' })).toHaveCount(0)

  state = await fakeState(request)
  expect(state.slack).toHaveLength(2)
  expect(state.slack[1].text).toContain('취소했어요')
  expect(state.slack[1].text).toContain(`보리 (${GUARDIAN})`)
  expect(state.slack[1].text).toContain(applyId)
  // 취소는 슬랙에만 알린다. 시트는 그대로다.
  expect(state.sheets).toHaveLength(1)
})

for (const width of [320, 390]) {
  test(`폭 ${width} 에서 가로 넘침이 없다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '예약 신청서' })).toBeVisible()
    await expectNoHorizontalOverflow(page, width)

    await page.getByRole('link', { name: '예약 신청하기' }).click()
    for (const group of ['guardian', 'pet', 'visit']) {
      await expectGroup(page, group)
      await expectNoHorizontalOverflow(page, width)
      await fillGroup(page)
      if (group !== 'visit') await goNext(page)
    }
    await page.locator('[data-action="submit"]').click()
    await expect(done(page)).toBeVisible()
    await expectNoHorizontalOverflow(page, width)
  })
}

test('브라우저 뒤로 가기는 이전 묶음으로 간다', async ({ page }) => {
  await openApply(page)
  await setText(page, 'guardian_name', GUARDIAN)
  await fillGroup(page)
  await goNext(page)
  await expectGroup(page, 'pet')

  await page.goBack()
  await expectGroup(page, 'guardian')
  await expect(page).toHaveURL(/\/apply$/)
  await expect(page.locator('[data-question="guardian_name"] input')).toHaveValue(GUARDIAN)

  await page.goForward()
  await expectGroup(page, 'pet')

  // 화면의 ‹ 도 같은 길이다.
  await page.locator('[data-action="back"]').click()
  await expectGroup(page, 'guardian')
  // 처음 묶음에서 더 뒤로 가면 양식을 떠난다.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: '예약 신청하기' })).toBeVisible()
})

test('새로 고침으로 복원된 뒤 이전은 앞 묶음으로 간다', async ({ page }) => {
  await openApply(page)
  await fillGroup(page)
  await goNext(page)
  await setText(page, 'pet_name', '보리')

  await page.reload()
  await expectGroup(page, 'pet')
  await expect(page.locator('[data-question="pet_name"] input')).toHaveValue('보리')

  await page.locator('[data-action="back"]').click()
  await expectGroup(page, 'guardian')
  // 양식을 떠나지 않았다.
  await expect(page).toHaveURL(/\/apply$/)

  // 처음 묶음의 ‹ 는 첫 화면으로 간다.
  await page.locator('[data-action="back"]').click()
  await expect(page).toHaveURL(/\/$/)
})

test('완료 화면에서 뒤로 가도 세션이 남아 앞으로 가면 완료 화면이 다시 보인다', async ({ page }) => {
  await writeApply(page)
  await expect(done(page)).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/apply$/)
  await expectGroup(page, 'guardian')
  expect(await page.evaluate(() => localStorage.getItem('hh.session'))).not.toBeNull()

  await page.goForward()
  await expect(page).toHaveURL(/\/apply\/done$/)
  await expect(done(page)).toBeVisible()
})

test('신청을 마치고 완료 화면에서 뒤로 두 번이면 양식을 떠난다', async ({ page }) => {
  await writeApply(page)
  await expect(done(page)).toBeVisible()

  // 첫 번째 뒤로: 새 신청서(처음 묶음, 빈 칸). 지난 신청의 묶음으로 뛰지 않는다.
  await page.goBack()
  await expect(page).toHaveURL(/\/apply$/)
  await expectGroup(page, 'guardian')
  await expect(page.locator('[data-question="guardian_name"] input')).toHaveValue('')
  const seen = await recordGroups(page)

  // 두 번째 뒤로: 지난 신청이 남긴 칸을 건너뛰어 첫 화면까지 간다.
  await page.goBack()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: '예약 신청하기' })).toBeVisible()
  expect(await seen()).toEqual(['guardian'])
})

test('화면 어디에도 입니다 체가 없다', async ({ page }) => {
  // 신청서 화면 틀의 문구만 본다(검사지 질문은 원문 그대로라 뺀다). 화면마다 있어야 할 글을 함께 단언해 빈 화면을 걸러 낸다.
  const expectHaeyo = async (mustHave: string) => {
    const text = await bodyText(page)
    expect(text).toContain(mustHave)
    expect(text).not.toMatch(FORBIDDEN)
  }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '예약 신청서' })).toBeVisible()
  await expectHaeyo('예약 확정이 아니에요')

  await page.getByRole('link', { name: '예약 신청하기' }).click()
  for (const [group, title] of [
    ['guardian', '보호자'],
    ['pet', '반려견'],
    ['visit', '희망 일시·서비스'],
  ]) {
    await expectGroup(page, group)
    await expectHaeyo(title)
    await fillGroup(page)
    if (group !== 'visit') await goNext(page)
  }

  // 교육미용을 골라 검사지 안내를 본다.
  await choose(page, 'services', TRAINING_SERVICE)
  await page.locator('[data-action="submit"]').click()
  await expect(page).toHaveURL(/\/apply\/training$/)
  await expect(page.getByRole('heading', { name: '심층 행동 분석 검사지를 이어서 작성해요' })).toBeVisible()
  await expectHaeyo('검사지는 나중에 같은 링크로 이어서 쓸 수 있어요')

  // 완료 화면(검사지 링크가 있는 쪽)과 취소한 뒤의 완료 화면.
  await page.goto('/apply/done')
  await expect(done(page)).toBeVisible()
  await expect(page.getByRole('link', { name: '검사지 이어서 쓰기' })).toBeVisible()
  await expectHaeyo('입금이 확인되면 예약이 확정돼요')

  await page.goto('/apply/training')
  await page.getByRole('button', { name: '교육미용은 아니에요' }).click()
  await expect(done(page)).toBeVisible()
  await expect(page.getByRole('link', { name: '검사지 이어서 쓰기' })).toHaveCount(0)
  await expectHaeyo('다음 순서')
})

test('브라우저는 이 웹 밖으로 요청을 보내지 않는다', async ({ page }) => {
  // 외부 스크립트·글꼴·분석 도구가 없다는 제약을 실제 브라우저로 확인한다: 첫 화면부터 완료 화면까지 부른 곳은 이 웹뿐이다.
  const hosts = new Set<string>()
  page.on('request', (request) => hosts.add(new URL(request.url()).host))
  await writeApply(page)
  await expect(done(page)).toBeVisible()
  expect([...hosts]).toEqual([`localhost:${WEB_PORT}`])
})

test('허니팟은 비어 있고 name 이 없다', async ({ page }) => {
  await openApply(page)
  const honeypot = page.locator('input[aria-hidden="true"]')
  await expect(honeypot).toHaveCount(1)
  await expect(honeypot).toHaveValue('')
  // name 이 없어야 브라우저 자동 채움이 이 칸을 양식 칸으로 알아보지 못한다.
  expect(await honeypot.getAttribute('name')).toBeNull()
  await expect(honeypot).toHaveAttribute('autocomplete', 'off')
  await expect(honeypot).toHaveAttribute('tabindex', '-1')

  // 보호자가 칸을 채워도 비어 있다.
  await fillGroup(page)
  await expect(honeypot).toHaveValue('')
})

test('viewport 는 기기 화면 끝까지 채운다(viewport-fit=cover)', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
})

test('첫 화면에 og:image 가 있다', async ({ page, request }) => {
  await page.goto('/')
  const meta = page.locator('meta[property="og:image"]')
  await expect(meta).toHaveAttribute('content', /\/og\.jpg$/)
  // 가리키는 그림이 실제로 열린다(주소의 호스트는 배포 주소에 따라 달라지므로 경로로 부른다).
  const res = await request.get(new URL((await meta.getAttribute('content'))!).pathname)
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/jpeg')
})
