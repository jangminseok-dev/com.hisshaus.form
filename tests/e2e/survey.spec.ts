import { expect, test } from '@playwright/test'

import { surveyForm } from '../../forms/survey'
import { sheetHeader } from '../../lib/sheet-row'
import { fakeState, resetFake } from './fake'
import {
  choose,
  expectGroup,
  expectNoHorizontalOverflow,
  fillUntil,
  goNext,
  recordGroups,
  setText,
  submitSurvey,
  writeApply,
} from './fill'

// 진짜 슬랙·시트는 부르지 않는다. 제출은 가짜 서비스(fake-services.mjs)가 받고, 테스트가 받은 것을 읽는다.
test.beforeEach(async ({ request }) => {
  await resetFake(request)
})

const groups = surveyForm.groups

test('검사지를 몇 묶음 쓰고 닫았다 열면 쓰던 묶음으로 돌아온다', async ({ page }) => {
  await page.goto('/hisshaus/survey')
  await fillUntil(page, 'd')
  const fourth = groups[3]
  await expect(page.locator('[data-group] h2')).toHaveText(fourth.title)
  // 진행 표시(k / N)는 두지 않는다.
  await expect(page.getByText(/\d+ \/ \d+/)).toHaveCount(0)

  // 새로 고침.
  await page.reload()
  await expectGroup(page, 'd')
  await expect(page.locator('[data-group] h2')).toHaveText(fourth.title)

  // 탭을 닫고 새 탭에서 다시 연다(방문 기록도 새로 시작한다).
  const context = page.context()
  await page.close()
  const again = await context.newPage()
  await again.goto('/hisshaus/survey')
  await expectGroup(again, 'd')
  await expect(again.locator('[data-group] h2')).toHaveText(fourth.title)
  // 앞 묶음에 쓴 답도 돌아와 있다.
  await again.locator('[data-action="back"]').click()
  await expectGroup(again, 'c')
  await expect(again.locator('[data-question="q13"] textarea')).toHaveValue('가나다')
})

test('q83 에서 없음만 고르고 나머지를 비워도 다음 묶음으로 넘어간다', async ({ page }) => {
  await page.goto('/hisshaus/survey')
  await fillUntil(page, 'k')

  await choose(page, 'q83', '없음')
  // q84·q85 는 원래 선택 문항이다. 비워 둔다.
  for (const id of ['q84', 'q85']) {
    const q = page.locator(`[data-question="${id}"]`)
    await expect(q.getByText('선택', { exact: true })).toBeVisible()
    await expect(q.locator('[aria-checked="true"]')).toHaveCount(0)
  }
  await goNext(page)
  await expectGroup(page, 'l')
})

test('q2 에서 동의하지 않음을 고르면 버튼이 막힌다', async ({ page }) => {
  await page.goto('/hisshaus/survey')
  await expectGroup(page, 'a')
  await setText(page, 'q1', 'a@b.co')

  const refuse = '동의하지 않으면 검사지를 진행할 수 없어요'
  await choose(page, 'q2', '동의하지 않음 (서비스 이용 불가)')
  await expect(page.getByText(refuse)).toBeVisible()
  const next = page.locator('[data-action="next"]')
  await expect(next).toHaveAttribute('aria-disabled', 'true')
  // 누를 수는 있지만(막힌 곳으로 데려간다) 넘어가지 않는다.
  await next.click({ force: true })
  await expectGroup(page, 'a')
  await expect(page.getByText(refuse)).toBeVisible()

  // 동의함으로 바꾸면 풀린다.
  await choose(page, 'q2', '동의함')
  await expect(page.getByText(refuse)).toHaveCount(0)
  await goNext(page)
  await expectGroup(page, 'b')
})

test('끝까지 제출하면 검사지 탭에 한 줄, 슬랙은 한 통 이상이고 머리글에 반려견 이름이 있다', async ({ page, request }) => {
  await page.goto('/hisshaus/survey')
  await fillUntil(page, 'b')
  await setText(page, 'q3', '김하나')
  await setText(page, 'q7', '보리')
  await submitSurvey(page)

  await expect(page).toHaveURL(/\/survey\/done$/)
  await expect(page.getByRole('heading', { name: '검사지가 접수되었어요' })).toBeVisible()

  const { sheets, slack } = await fakeState(request)
  expect(sheets).toHaveLength(1)
  expect(sheets[0].range).toBe("'검사지'!A1")
  expect(sheets[0].query).toEqual({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' })
  expect(sheets[0].authorization).toBe('Bearer e2e-token')
  const header = sheetHeader(surveyForm)
  const [row] = sheets[0].values
  expect(row).toHaveLength(header.length)
  expect(row[header.indexOf('의뢰인 성함')]).toBe('김하나')
  expect(row[header.indexOf('반려견의 이름')]).toBe('보리')

  expect(slack.length).toBeGreaterThanOrEqual(1)
  for (const message of slack) {
    const head = message.blocks[0]
    expect(head.type).toBe('header')
    expect(head.type === 'header' ? head.text.text : '').toContain('보리')
  }
})

test('검사지를 낸 뒤 완료 화면에서 뒤로 두 번이면 지난 칸을 건너뛰어 양식을 떠난다', async ({ page, request }) => {
  await writeApply(page, { training: true })
  await expect(page).toHaveURL(/\/apply\/training$/)
  await page.getByRole('button', { name: '검사지 작성 시작' }).click()
  await expectGroup(page, 'a')
  await submitSurvey(page)
  await expect(page).toHaveURL(/\/survey\/done$/)
  await expect(page.getByRole('heading', { name: '검사지가 접수되었어요' })).toBeVisible()

  // 신청서에서 이어 쓴 검사지는 같은 신청 ID 로 두 탭이 이어진다.
  const { sheets, slack } = await fakeState(request)
  expect(sheets.map((s) => s.range)).toEqual(["'예약신청'!A1", "'검사지'!A1"])
  const applyId = sheets[0].values[0][1]
  expect(sheets[1].values[0][1]).toBe(applyId)
  const survey = slack.slice(1)
  expect(survey.length).toBeGreaterThanOrEqual(1)
  expect(JSON.stringify(survey[0].blocks)).toContain(`예약 신청 ${applyId}의 검사지예요`)

  // 첫 번째 뒤로: 새 검사지(처음 묶음). 지난 검사지의 묶음으로 뛰지 않는다.
  await page.goBack()
  await expect(page).toHaveURL(/\/survey$/)
  await expectGroup(page, 'a')
  const seen = await recordGroups(page)

  // 두 번째 뒤로: 지난 검사지가 남긴 칸을 모두 건너뛴다. 검사지를 낸 세션이라 검사지 안내는 완료 화면으로 보낸다.
  await page.goBack()
  await expect(page).toHaveURL(/\/apply\/done$/)
  await expect(page.getByRole('heading', { name: '신청이 접수되었어요' })).toBeVisible()
  expect(await seen()).toEqual(['a'])
})

test('폭 320 에서 검사지의 모든 묶음, 긴 선택지의 k·l 묶음에도 가로 넘침이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/hisshaus/survey')
  await fillUntil(page, 'l', () => expectNoHorizontalOverflow(page, 320))
})

test('검사지 주소의 링크 미리보기는 검사지 제목·설명과 그림이다', async ({ page }) => {
  await page.goto('/hisshaus/survey')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '히스하우스 심층 행동 분석 검사지')
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', '교육미용 상담을 위해 반려견에 대해 알려 주세요.')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\.jpg$/)
})
