import { readFileSync } from 'node:fs'

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { E2E_ADMIN_PASSWORD, fakeState, resetFake } from './fake'
import { drawSignature, expectNoHorizontalOverflow, GUARDIAN, PHONE, writeApply } from './fill'

// 보호자 서명 화면. 사장님이 사장님 화면에서 만든 링크를 보호자가 연다. 가짜 시트·메일·슬랙만 쓴다.

const ADMIN = '/hisshaus/admin'
const EMAIL = 'hana@example.com'
const BEHAVIOR_PAGES = ['반려견 교육 서약서', '히스하우스 행동수정 프로그램 계약서', '교육미용 안내사항']

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
}

/** 링크 만들기를 누르고 만들어진 링크의 경로(/hisshaus/consent/…)를 돌려준다. */
async function createLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: '링크 만들기' }).click()
  const link = page.getByLabel('동의서 링크')
  await expect(link).toHaveValue(/\/hisshaus\/consent\/[A-Za-z0-9]{10}-[0-9a-f]{32}$/)
  return new URL(await link.inputValue()).pathname
}

/** 신청서를 내고, 사장님이 그 신청으로 '행동수정 트레이닝' 링크를 만든다. 가짜 서비스는 비우고 시작한다. */
async function behaviorLinkFromApply(page: Page, request: APIRequestContext): Promise<string> {
  await resetFake(request)
  await writeApply(page)
  await expect.poll(async () => (await fakeState(request)).sheets.filter((s) => s.range.startsWith("'예약신청'")).length).toBe(1)
  await login(page)
  await page.getByRole('link', { name: new RegExp(GUARDIAN) }).click()
  await page.getByRole('button', { name: '행동수정 트레이닝', exact: true }).click()
  await page.getByLabel('프로그램 명').fill('짖음 줄이기')
  await page.getByLabel('수업 목표').fill('초인종 소리에 짖지 않기')
  return createLink(page)
}

/** 신청서 없이 '일반 미용' 링크를 만든다(보호자가 칸을 다 적는다). */
async function groomingLinkWithoutApply(page: Page): Promise<string> {
  await login(page)
  await page.getByRole('link', { name: '신청서 없이 새로 만들기' }).click()
  await page.getByRole('button', { name: '일반 미용', exact: true }).click()
  await page.getByRole('button', { name: '등', exact: true }).click()
  return createLink(page)
}

const title = (page: Page, name: string) => page.getByRole('heading', { level: 2, name })

async function next(page: Page): Promise<void> {
  await page.locator('[data-action="next"]').click()
}

/** 정보 확인부터 완료까지: 견종을 고치고 이메일을 적고, 세 장에 동의하고, 사인해 서명하기. */
async function signBehavior(page: Page, path: string, beforeDraw?: () => Promise<void>): Promise<void> {
  await page.goto(path)
  await expect(title(page, '계약서에 이렇게 들어가요')).toBeVisible()
  // 신청서 값이 채워져 있다.
  await expect(page.getByLabel('보호자 성함')).toHaveValue(GUARDIAN)
  await expect(page.getByLabel('연락처')).toHaveValue(PHONE)
  await expect(page.getByLabel('반려견 이름')).toHaveValue('보리')
  await expect(page.getByLabel('견종')).toHaveValue('가나다')
  await page.getByLabel('견종').fill('말티즈')
  await page.getByLabel('사본을 받을 이메일').fill(EMAIL)
  await next(page)

  for (const name of BEHAVIOR_PAGES) {
    await expect(title(page, name)).toBeVisible()
    // 장 그림이 실제로 열린다(그림 주소에 basePath 가 붙었다).
    const image = page.getByRole('img', { name })
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
    await expect(page.locator('[data-action="next"]')).toBeDisabled()
    if (name === BEHAVIOR_PAGES[1]) {
      // 고친 견종과 사장님이 채운 칸이 장 위에 얹혀 있다.
      await expect(page.locator('[data-field="breed"]')).toHaveText('말티즈')
      await expect(page.locator('[data-field="programName"]')).toHaveText('짖음 줄이기')
      await expect(page.locator('[data-field="phoneLast"]')).toHaveText('5678')
      await expect(page.locator('[data-field="signature"]')).toHaveCount(0)
    }
    await page.getByLabel(name === '교육미용 안내사항' ? '확인했어요' : '읽고 동의해요').check()
    await next(page)
  }

  await expect(title(page, '마지막으로 사인해 주세요')).toBeVisible()
  await expect(page.getByText(`이 주소로 사본을 보내요: ${EMAIL}`)).toBeVisible()
  const submit = page.getByRole('button', { name: '서명하기' })
  await expect(submit).toBeDisabled()
  await beforeDraw?.()
  await drawSignature(page)
  await page.getByLabel('전자 방식으로 서명하는 데 동의해요').check()
  await submit.click()
  await expect(page.getByRole('heading', { name: '서명이 끝났어요' })).toBeVisible()
}

test('신청서로 만든 링크에서 정보를 고치고 세 장에 동의해 사인하면 기록·메일·슬랙이 남고, 다시 열면 이미 서명했다고 한다', async ({
  page,
  context,
  request,
}) => {
  const path = await behaviorLinkFromApply(page, request)
  // 보호자 기기: 사장님 세션이 없다.
  await context.clearCookies()

  await signBehavior(page, path, async () => {
    // 화면이 스크롤될 수 있어야 '끌어도 화면이 밀리지 않음' 을 볼 수 있다. 낮은 화면으로 줄이고 맨 위에서 긋는다.
    await page.setViewportSize({ width: 412, height: 420 })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 100)).toBe(true)
  })
  await expect(page.getByText('메일로 사본을 보냈어요')).toBeVisible()

  // 내려받은 PDF 는 메일 첨부와 같은 이름 꼴이다.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF 내려받기' }).click()])
  expect(download.suggestedFilename()).toMatch(/^히스하우스_동의서_행동수정 트레이닝_보리_\d{8}\.pdf$/)
  expect(readFileSync(await download.path()).subarray(0, 4).toString()).toBe('%PDF')
  await expect(page.getByText('ⓒ 어글리독 All rights reserved')).toBeVisible()

  const state = await fakeState(request)
  const rows = state.sheets.filter((s) => s.range.startsWith("'동의서'")).flatMap((s) => s.values)
  expect(rows.map((r) => r[1])).toEqual(['준비', '서명', '메일'])
  expect(rows[1].slice(9, 14)).toEqual([GUARDIAN, PHONE, '보리', '말티즈', EMAIL])
  expect(rows[1][14]).toBe('견종 가나다 → 말티즈')

  expect(state.mail).toHaveLength(2)
  expect(state.mail.map((m) => m.to).sort()).toEqual(['archive@example.invalid', EMAIL].sort())
  for (const mail of state.mail) {
    expect(Buffer.from(mail.attachment!.base64, 'base64').subarray(0, 4).toString()).toBe('%PDF')
    expect(mail.attachment!.filename).toBe(download.suggestedFilename())
  }

  const slack = state.slack.filter((m) => (m.blocks[0] as { text: { text: string } }).text.text.startsWith('동의서 서명:'))
  expect(slack).toHaveLength(1)
  const text = JSON.stringify(slack[0].blocks)
  expect(text).toContain('보호자가 고친 값')
  expect(text).toContain('견종 가나다 → 말티즈')

  // 같은 링크를 다시 열면 닫혀 있다.
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: '이미 서명한 동의서예요' })).toBeVisible()
  await expect(page.getByText('사본은 메일로 보내 드려요. 받지 못했다면 카카오톡 채널로 알려 주세요.')).toBeVisible()
})

test('취소한 링크는 열 수 없다고 한다', async ({ page, context }) => {
  const path = await groomingLinkWithoutApply(page)
  const id = /consent\/([A-Za-z0-9]{10})-/.exec(path)![1]
  await page.getByRole('link', { name: '사장님 화면으로' }).click()
  const card = page.locator(`[data-consent="${id}"]`)
  await card.getByRole('button', { name: '취소' }).click()
  await page.getByRole('button', { name: '취소하기' }).click()
  await expect(card).toContainText('취소함')

  await context.clearCookies()
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: '열 수 없는 동의서예요' })).toBeVisible()
  await expect(page.getByText('링크가 바뀌었을 수 있어요. 카카오톡 채널로 알려 주세요.')).toBeVisible()
  await expect(page.locator('[data-step]')).toHaveCount(0)
})

test('폭 320 에서 신청서 없이 만든 동의서의 네 단계 모두 가로 넘침이 없다', async ({ page, context }) => {
  const path = await groomingLinkWithoutApply(page)
  await context.clearCookies()
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto(path)

  await expect(page.locator('[data-step="info"]')).toBeVisible()
  // 신청서 없이 만든 동의서는 칸이 비어 있다.
  await expect(page.getByLabel('보호자 성함')).toHaveValue('')
  await expectNoHorizontalOverflow(page, 320)
  await page.getByLabel('보호자 성함').fill(GUARDIAN)
  await page.getByLabel('연락처').fill('01012345678')
  await page.getByLabel('반려견 이름').fill('보리')
  await page.getByLabel('견종').fill('말티즈')
  await page.getByLabel('사본을 받을 이메일').fill(EMAIL)
  await next(page)

  await expect(page.locator('[data-step="page-generalGrooming"]')).toBeVisible()
  await expect(page.locator('[data-field="part:등"]')).toHaveText('✓')
  await page.getByText('글로 읽기').click()
  await expectNoHorizontalOverflow(page, 320)
  await page.getByLabel('읽고 동의해요').check()
  await next(page)

  await expect(page.locator('[data-step="sign"]')).toBeVisible()
  await expectNoHorizontalOverflow(page, 320)
  await drawSignature(page)
  await page.getByLabel('전자 방식으로 서명하는 데 동의해요').check()
  await page.getByRole('button', { name: '서명하기' }).click()

  await expect(page.locator('[data-step="done"]')).toBeVisible()
  await expectNoHorizontalOverflow(page, 320)
})

test.describe('아이패드 폭', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true })

  test('신청서로 만든 링크의 서명 흐름이 막힘 없이 끝난다', async ({ page, context, request }) => {
    const path = await behaviorLinkFromApply(page, request)
    await context.clearCookies()
    await signBehavior(page, path)
    await expect(page.getByRole('button', { name: 'PDF 내려받기' })).toBeVisible()
    await expectNoHorizontalOverflow(page, 820)
    const state = await fakeState(request)
    expect(state.sheets.filter((s) => s.range.startsWith("'동의서'")).flatMap((s) => s.values).map((r) => r[1])).toEqual(['준비', '서명', '메일'])
    expect(state.mail).toHaveLength(2)
  })
})
