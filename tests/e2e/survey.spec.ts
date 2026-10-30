import { expect, test, type Page } from '@playwright/test'

import { allQuestions } from '../../forms/rules'
import { surveyForm } from '../../forms/survey'
import { sheetHeader } from '../../lib/sheet-row'
import { fakeState, forgedSurveyPath, resetFake, surveyPath } from './fake'
import {
  choose,
  expectGroup,
  expectNoHorizontalOverflow,
  fillGroup,
  fillUntil,
  goNext,
  setText,
  submitSurvey,
  writeApply,
} from './fill'

// 진짜 슬랙·시트는 부르지 않는다. 제출은 가짜 서비스(fake-services.mjs)가 받고, 테스트가 받은 것을 읽는다.
test.beforeEach(async ({ request }) => {
  await resetFake(request)
})

const groups = surveyForm.groups
const CLOSED = '이미 제출된 검사지예요'
const LOCKED = '검사지는 받은 링크로 열어 주세요'

test('검사지를 몇 묶음 쓰고 닫았다 열면 쓰던 묶음으로 돌아온다', async ({ page }) => {
  const link = surveyPath()
  await page.goto(link)
  await fillUntil(page, 'd')
  const fourth = groups[3]
  await expect(page.locator('[data-group] h2')).toHaveText(fourth.title)
  // 진행 표시(k / N)는 두지 않는다.
  await expect(page.getByText(/\d+ \/ \d+/)).toHaveCount(0)

  // 새로 고침.
  await page.reload()
  await expectGroup(page, 'd')
  await expect(page.locator('[data-group] h2')).toHaveText(fourth.title)

  // 탭을 닫고 새 탭에서 같은 링크를 다시 연다(방문 기록도 새로 시작한다). 링크는 몇 번을 열어도 막히지 않는다.
  const context = page.context()
  await page.close()
  const again = await context.newPage()
  await again.goto(link)
  await expectGroup(again, 'd')
  await expect(again.locator('[data-group] h2')).toHaveText(fourth.title)
  // 앞 묶음에 쓴 답도 돌아와 있다.
  await again.locator('[data-action="back"]').click()
  await expectGroup(again, 'c')
  await expect(again.locator('[data-question="q13"] textarea')).toHaveValue('가나다')
})

test('다른 링크로 열면 쓰던 검사지가 섞이지 않고 처음부터다', async ({ page }) => {
  await page.goto(surveyPath())
  await fillUntil(page, 'c')
  await page.goto(surveyPath())
  await expectGroup(page, 'a')
  await expect(page.locator('[data-question="q1"] input')).toHaveValue('')
})

test('공격성이 아니오면 공격행동 문항이 하나도 안 보이고 바로 다음 묶음으로 넘어간다. 네면 48개 목록이 열린다', async ({ page }) => {
  await page.goto(surveyPath())
  await fillUntil(page, 'k')

  await choose(page, 'q83_has', '아니오')
  await expect(page.locator('[data-question="q83"]')).toHaveCount(0)
  await expect(page.locator('[data-question="q84"]')).toHaveCount(0)
  await goNext(page)
  await expectGroup(page, 'l')

  await page.locator('[data-action="back"]').click()
  await expectGroup(page, 'k')
  await choose(page, 'q83_has', '네')
  await expect(page.locator('[data-question="q83"]')).toBeVisible()
  await expect(page.locator('[data-question="q83"]')).toHaveAttribute('data-required', 'true')
  // q84·q85 는 원래 선택 문항이다.
  for (const id of ['q84', 'q85']) {
    await expect(page.locator(`[data-question="${id}"]`)).not.toHaveAttribute('data-required', 'true')
  }
})

test('q2 에서 동의하지 않음을 고르면 버튼이 막힌다', async ({ page }) => {
  await page.goto(surveyPath())
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

test('제출하기는 확인 창을 거치고, 다시 볼게요면 그대로 남는다', async ({ page, request }) => {
  await page.goto(surveyPath())
  await fillUntil(page, 'l')
  await fillGroup(page)
  await page.locator('[data-action="submit"]').click()
  const dialog = page.getByRole('alertdialog', { name: '제출하면 답을 고칠 수 없어요. 제출할까요?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '다시 볼게요' })).toBeFocused()
  await dialog.getByRole('button', { name: '다시 볼게요' }).click()
  await expect(dialog).toHaveCount(0)
  await expectGroup(page, 'l')
  expect((await fakeState(request)).sheets).toHaveLength(0)
})

test('끝까지 제출하면 검사지 탭에 링크의 신청 ID 로 한 줄, 슬랙에 그 신청의 검사지라고 오고, 같은 링크는 닫힌다', async ({ page, request }) => {
  const applyId = 'E2eLink001'
  const link = surveyPath(applyId)
  await page.goto(link)
  await fillUntil(page, 'b')
  await setText(page, 'q3', '김하나')
  await setText(page, 'q7', '보리')
  await submitSurvey(page)

  await expect(page).toHaveURL(/\/survey\/done$/)
  await expect(page.getByRole('heading', { name: '검사지가 잘 도착했어요' })).toBeVisible()

  const { sheets, slack } = await fakeState(request)
  expect(sheets).toHaveLength(1)
  expect(sheets[0].range).toBe("'검사지'!A1")
  expect(sheets[0].query).toEqual({ valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' })
  expect(sheets[0].authorization).toBe('Bearer e2e-token')
  const header = sheetHeader(surveyForm)
  const [row] = sheets[0].values
  expect(row).toHaveLength(header.length)
  expect(row[1]).toBe(applyId)
  expect(row[header.indexOf('의뢰인 성함')]).toBe('김하나')
  expect(row[header.indexOf('반려견의 이름')]).toBe('보리')

  expect(slack.length).toBeGreaterThanOrEqual(1)
  for (const message of slack) {
    const head = message.blocks[0]
    expect(head.type).toBe('header')
    expect(head.type === 'header' ? head.text.text : '').toContain('보리')
  }
  expect(JSON.stringify(slack[0].blocks)).toContain(`예약 신청 ${applyId}의 검사지예요`)

  // 같은 링크를 다른 기기(새 브라우저 문맥)에서 열어도 닫혀 있다 — 서버가 시트를 보고 판단한다.
  const other = await page.context().browser()!.newContext()
  const fresh = await other.newPage()
  await fresh.goto(link)
  await expect(fresh.getByRole('heading', { level: 1, name: CLOSED })).toBeVisible()
  await expect(fresh.locator('[data-group]')).toHaveCount(0)
  await other.close()

  // 같은 기기에서 다시 열어도 닫혀 있다.
  await page.goto(link)
  await expect(page.getByRole('heading', { level: 1, name: CLOSED })).toBeVisible()
})

test('교육미용 신청 → 슬랙의 검사지 링크로 열어 내면 두 탭이 같은 신청 ID 로 이어진다', async ({ page, request }) => {
  await writeApply(page, { training: true })
  await expect(page).toHaveURL(/\/apply\/done$/)

  const applied = await fakeState(request)
  const applyId = applied.sheets[0].values[0][1]
  const text = JSON.stringify(applied.slack[0].blocks)
  const path = /https:\/\/chagocnote\.com(\/hisshaus\/survey\/[A-Za-z0-9_-]+)/.exec(text)![1]
  expect(path).toBe(surveyPath(applyId))

  // 사장님이 입금을 확인하고 이 링크를 보냈다. 보호자가 연다(도메인은 e2e 서버로 바꿔 경로만 쓴다).
  await page.goto(path)
  await expectGroup(page, 'a')
  // 신청서 값을 미리 채우지 않는다.
  await fillUntil(page, 'b')
  await expect(page.locator('[data-question="q3"] input')).toHaveValue('')
  await submitSurvey(page)
  await expect(page).toHaveURL(/\/survey\/done$/)

  const { sheets, slack } = await fakeState(request)
  expect(sheets.map((s) => s.range)).toEqual(["'예약신청'!A1", "'검사지'!A1"])
  expect(sheets[1].values[0][1]).toBe(applyId)
  expect(JSON.stringify(slack.slice(1)[0].blocks)).toContain(`예약 신청 ${applyId}의 검사지예요`)
})

test('검사지를 낸 뒤 완료 화면에서 뒤로 가면 닫힌 안내, 한 번 더 뒤로 가면 링크 앞 페이지다', async ({ page }) => {
  await page.goto('/hisshaus')
  await page.goto(surveyPath())
  await submitSurvey(page)
  await expect(page).toHaveURL(/\/survey\/done$/)

  await page.goBack()
  await expect(page).toHaveURL(/\/survey\/[A-Za-z0-9]{10}-/)
  await expect(page.getByRole('heading', { level: 1, name: CLOSED })).toBeVisible()
  await expect(page.locator('[data-group]')).toHaveCount(0)

  // 낸 검사지가 묶음마다 쌓은 칸을 건너뛴다.
  await page.goBack()
  await expect(page).toHaveURL(/\/hisshaus$/)
  await expect(page.getByRole('link', { name: '예약 신청서' })).toBeVisible()
})

test('링크 없이 열거나 틀린 링크로 열면 안내만 보인다 — 틀린 링크는 /survey 로 바뀐다', async ({ page }) => {
  await page.goto('/hisshaus/survey')
  await expect(page.getByRole('heading', { level: 1, name: LOCKED })).toBeVisible()
  await expect(page.locator('[data-group]')).toHaveCount(0)

  const forged = forgedSurveyPath('E2eLink002')
  await page.goto(forged)
  await expect(page).toHaveURL(/\/hisshaus\/survey$/)
  await expect(page.getByRole('heading', { level: 1, name: LOCKED })).toBeVisible()
})

/** 이 페이지를 여는 동안 받은 문서·스크립트 응답 본문을 모은다. */
async function bodiesWhileOpening(page: Page, path: string): Promise<string[]> {
  const pending: Promise<string>[] = []
  const collect = (response: import('@playwright/test').Response) => {
    if (!['document', 'script', 'fetch'].includes(response.request().resourceType())) return
    if (response.status() >= 300 && response.status() < 400) return
    pending.push(response.text().catch(() => ''))
  }
  page.on('response', collect)
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  page.off('response', collect)
  return Promise.all(pending)
}

test('링크 없이 열 수 있는 화면은 검사지 문항 글을 하나도 받지 않는다', async ({ page }) => {
  // 신청서·첫 화면에는 없는 검사지 글 둘. 브라우저로 가는 JS 에는 글자 그대로나 \uXXXX 꼴로 실린다.
  const markers = [allQuestions(surveyForm).find((q) => q.id === 'q83')!.label, '훈련소를 다니다가 도중에 그만두었다.']
  const forms = (m: string) => [m, m.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)]
  const leaks = (bodies: string[]) =>
    markers.filter((m) => bodies.some((b) => forms(m).some((f) => b.toLowerCase().includes(f.toLowerCase()))))

  // 맞는 링크 화면에서는 문항 글을 받는다(이 검사가 헛돌지 않는다는 확인).
  expect(leaks(await bodiesWhileOpening(page, surveyPath()))).toEqual(markers)

  const forged = forgedSurveyPath('E2eLink003')
  for (const path of ['/hisshaus', '/hisshaus/apply', '/hisshaus/survey', forged, '/hisshaus/survey/done']) {
    const fresh = await page.context().browser()!.newContext()
    const tab = await fresh.newPage()
    expect(leaks(await bodiesWhileOpening(tab, path)), path).toEqual([])
    await fresh.close()
  }
})

test('검사지 응답은 검색에 잡히지 않고 다른 사이트로 주소를 넘기지 않는다', async ({ page }) => {
  for (const path of [surveyPath(), '/hisshaus/survey']) {
    const res = await page.goto(path)
    expect(res!.headers()['x-robots-tag'], path).toBe('noindex, nofollow')
    expect(res!.headers()['referrer-policy'], path).toBe('no-referrer')
  }
})

test('폭 320 에서 검사지의 모든 묶음, 긴 선택지의 k·l 묶음에도 가로 넘침이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(surveyPath())
  await fillUntil(page, 'l', () => expectNoHorizontalOverflow(page, 320))
})

test('검사지 링크의 미리보기는 검사지 제목·설명과 그림이다', async ({ page }) => {
  await page.goto(surveyPath())
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', '히스하우스 심층 행동 분석 검사지')
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', '교육미용 상담을 위해 반려견에 대해 알려 주세요.')
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og-shop\.jpg$/)
})
