import { expect, test, type Page } from '@playwright/test'

import { E2E_ADMIN_PASSWORD, E2E_ADMIN_PIN, fakeState, resetFake } from './fake'
import { drawSignature, GUARDIAN, writeApply } from './fill'

const ADMIN = '/hisshaus/admin'

test('틀린 비밀번호는 막히고, 맞으면 들어가고, 쿠키를 지우면 다시 로그인 화면이다', async ({ page, context }) => {
  await page.goto(ADMIN)
  await expect(page.getByRole('heading', { name: '사장님 화면' })).toBeVisible()

  await page.getByLabel('비밀번호').fill('틀린-비밀번호-입니다')
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByText('비밀번호가 맞지 않아요')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그아웃' })).toHaveCount(0)

  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '사장님 화면' })).toBeVisible()

  // 새로 고쳐도 로그인이 유지되고, 쿠키는 HttpOnly 이며 이 웹의 경로에만 붙는다.
  await page.reload()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  const cookie = (await context.cookies()).find((c) => c.name === 'hh_admin')!
  expect(cookie.httpOnly).toBe(true)
  expect(cookie.path).toBe('/hisshaus')

  await context.clearCookies()
  await page.reload()
  await expect(page.getByLabel('비밀번호')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그아웃' })).toHaveCount(0)
})

test('로그아웃하면 로그인 화면으로 돌아간다', async ({ page }) => {
  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await page.getByRole('button', { name: '로그아웃' }).click()
  await expect(page.getByLabel('비밀번호')).toBeVisible()
})

test('메일 시험 보내기를 누르면 결과 문구가 뜨고 시험 메일이 정확히 한 통 간다', async ({ page, request }) => {
  await resetFake(request)
  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await page.getByRole('button', { name: '메일 시험 보내기' }).click()
  await expect(page.getByRole('status')).toHaveText('보냈어요. hisshaus 메일함을 확인해 주세요.')
  const { mail } = await fakeState(request)
  expect(mail).toHaveLength(1)
  expect(mail[0]).toMatchObject({ to: 'archive@example.invalid', subject: '[히스하우스] 메일 설정 시험' })
})

test('신청서를 골라 일반 미용 동의서를 만들면 링크가 나오고 준비 줄이 붙으며, 취소하면 취소 줄이 붙는다', async ({ page, request }) => {
  await resetFake(request)
  await writeApply(page)
  await expect.poll(async () => (await fakeState(request)).sheets.filter((s) => s.range.startsWith("'예약신청'")).length).toBe(1)

  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()

  // 목록에 방금 낸 신청이 보이고, 검색으로 거를 수 있다.
  const item = page.getByRole('link', { name: new RegExp(GUARDIAN) })
  await expect(item).toBeVisible()
  await page.getByLabel('이름이나 연락처로 찾기').fill('없는이름')
  await expect(item).toHaveCount(0)
  await page.getByLabel('이름이나 연락처로 찾기').fill(GUARDIAN)
  await item.click()

  // 보호자 정보는 신청서 값으로 채워져 있다. 묶음을 안 고르면 막힌다.
  await expect(page.getByLabel('보호자 성함')).toHaveValue(GUARDIAN)
  await page.getByRole('button', { name: '링크 만들기' }).click()
  await expect(page.getByText('문서 묶음을 골라 주세요')).toBeVisible()

  await page.getByRole('button', { name: '일반 미용', exact: true }).click()
  await page.getByRole('button', { name: '링크 만들기' }).click()
  await expect(page.getByText('미용할 부위를 하나 이상 골라 주세요')).toBeVisible()
  await page.getByRole('button', { name: '등', exact: true }).click()
  await page.getByRole('button', { name: '귀청소', exact: true }).click()
  await page.getByRole('button', { name: '링크 만들기' }).click()

  const link = page.getByLabel('동의서 링크')
  await expect(link).toHaveValue(/\/hisshaus\/consent\/[A-Za-z0-9]{10}-[0-9a-f]{32}$/)
  const url = await link.inputValue()
  const id = /consent\/([A-Za-z0-9]{10})-/.exec(url)![1]

  const rows = (await fakeState(request)).sheets.filter((s) => s.range.startsWith("'동의서'")).flatMap((s) => s.values)
  expect(rows).toHaveLength(1)
  expect(rows[0].slice(1, 5)).toEqual(['준비', id, expect.stringMatching(/^[A-Za-z0-9]{10}$/), 'generalGrooming'])
  expect(rows[0][8]).toBe('등, 귀청소')
  expect(rows[0][9]).toBe(GUARDIAN)

  // 홈에 서명 대기로 보이고, 취소 창에서 그대로 두면 아무 일도 없다.
  await page.getByRole('link', { name: '사장님 화면으로' }).click()
  const card = page.locator(`[data-consent="${id}"]`)
  await expect(card).toContainText('일반 미용')
  await expect(card).toContainText('서명 대기')
  await card.getByRole('button', { name: '취소' }).click()
  await expect(page.getByRole('dialog')).toContainText('이 링크를 취소할까요? 보호자가 더 이상 열 수 없어요.')
  await page.getByRole('button', { name: '그대로 두기' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await fakeState(request)).sheets.filter((s) => s.range.startsWith("'동의서'"))).toHaveLength(1)

  await card.getByRole('button', { name: '취소' }).click()
  await page.getByRole('button', { name: '취소하기' }).click()
  await expect(card).toContainText('취소함')
  const after = (await fakeState(request)).sheets.filter((s) => s.range.startsWith("'동의서'")).flatMap((s) => s.values)
  expect(after).toHaveLength(2)
  expect(after[1].slice(1, 3)).toEqual(['취소', id])
})

test('알 수 없는 신청 ID 로 열면 신청서 없이 만들고 안내를 보여 준다', async ({ page }) => {
  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  await page.goto(`${ADMIN}/new?apply=ZZZZZZZZZZ`)
  await expect(page.getByText('신청서를 찾지 못했어요')).toBeVisible()
  await expect(page.getByLabel('보호자 성함')).toHaveValue('')
})

/** 신청서 없이 '일반 미용'(등) 링크를 만들고 그 경로(/hisshaus/consent/…)를 돌려준다. 만든 화면에 머문다. */
async function groomingLink(page: Page): Promise<string> {
  await page.getByRole('link', { name: '신청서 없이 새로 만들기' }).click()
  await page.getByRole('button', { name: '일반 미용', exact: true }).click()
  await page.getByRole('button', { name: '등', exact: true }).click()
  await page.getByRole('button', { name: '링크 만들기' }).click()
  const link = page.getByLabel('동의서 링크')
  await expect(link).toHaveValue(/\/hisshaus\/consent\/[A-Za-z0-9]{10}-[0-9a-f]{32}$/)
  return new URL(await link.inputValue()).pathname
}

const lockedScreen = (page: Page) => page.getByRole('heading', { level: 1, name: '잠겨 있어요' })

test('이 기기에서 바로 서명하면 기기가 잠겨 사장님 화면은 PIN 으로만 열리고, PIN 을 5번 틀리면 로그인부터 다시다', async ({
  page,
  request,
}) => {
  await resetFake(request)
  await page.goto(ADMIN)
  await page.getByLabel('비밀번호').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()

  // 만든 화면에서 '이 기기에서 바로 서명' → 그 동의서의 서명 화면.
  const path = await groomingLink(page)
  await page.getByRole('button', { name: '이 기기에서 바로 서명' }).click()
  await expect(page).toHaveURL(path)
  await expect(page.locator('[data-step="info"]')).toBeVisible()

  // 뒤로 가기로 만든 화면에 가도, 주소창으로 사장님 화면에 가도 PIN 화면만 보인다.
  await page.goBack()
  await expect(lockedScreen(page)).toBeVisible()
  await expect(page.getByLabel('동의서 링크')).toHaveCount(0)
  await page.goto(ADMIN)
  await expect(lockedScreen(page)).toBeVisible()
  await expect(page.getByRole('button', { name: '로그아웃' })).toHaveCount(0)
  await page.goto(`${ADMIN}/new`)
  await expect(lockedScreen(page)).toBeVisible()
  await expect(page.getByRole('button', { name: '링크 만들기' })).toHaveCount(0)

  // 보호자가 아이패드로 적고 동의하고 사인한다.
  await page.goto(path)
  await page.getByLabel('보호자 성함').fill(GUARDIAN)
  await page.getByLabel('연락처').fill('01012345678')
  await page.getByLabel('반려견 이름').fill('보리')
  await page.getByLabel('견종').fill('말티즈')
  await page.getByLabel('사본을 받을 이메일').fill('hana@example.com')
  await page.locator('[data-action="next"]').click()
  await page.getByLabel('읽고 동의해요').check()
  await page.locator('[data-action="next"]').click()
  await drawSignature(page)
  await page.getByLabel('전자 방식으로 서명하는 데 동의해요').check()
  await page.getByRole('button', { name: '서명하기' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '서명이 끝났어요' })).toBeVisible()
  await expect(page.getByText('기기를 사장님께 돌려주세요')).toBeVisible()
  await expect(page.getByRole('button', { name: 'PDF 내려받기' })).toHaveCount(0)
  expect((await fakeState(request)).mail).toHaveLength(2)

  // 새로 고쳐 '이미 서명한 동의서예요' 가 떠도 사장님 화면(PIN)으로 가는 길이 있다.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '이미 서명한 동의서예요' })).toBeVisible()
  await page.getByRole('link', { name: '사장님 화면으로' }).click()
  await expect(lockedScreen(page)).toBeVisible()
  await page.getByLabel('PIN').fill(E2E_ADMIN_PIN)
  await page.getByRole('button', { name: '풀기' }).click()
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  const id = /consent\/([A-Za-z0-9]{10})-/.exec(path)![1]
  await expect(page.locator(`[data-consent="${id}"]`)).toContainText('서명함')

  // 목록의 서명 대기 동의서에서 다시 잠그고, 틀린 PIN 을 5번 넣으면 로그인 화면이다.
  const next = await groomingLink(page)
  const nextId = /consent\/([A-Za-z0-9]{10})-/.exec(next)![1]
  await page.getByRole('link', { name: '사장님 화면으로' }).click()
  await page.locator(`[data-consent="${nextId}"]`).getByRole('button', { name: '이 기기에서 바로 서명' }).click()
  await expect(page).toHaveURL(next)
  await page.goto(ADMIN)
  // 틀린 PIN 은 서버가 1초 기다리므로 그동안 버튼이 막혀 있다. 풀릴 때까지 기다려 한 번씩 넣는다.
  const unlockButton = page.getByRole('button', { name: '풀기' })
  for (let i = 1; i <= 4; i++) {
    await page.getByLabel('PIN').fill('0000')
    await unlockButton.click()
    await expect(unlockButton).toBeDisabled()
    await expect(unlockButton).toBeEnabled()
    await expect(page.getByText('PIN 이 맞지 않아요')).toBeVisible()
  }
  await page.getByLabel('PIN').fill('0000')
  await page.getByRole('button', { name: '풀기' }).click()
  await expect(page.getByLabel('비밀번호')).toBeVisible()
  await expect(lockedScreen(page)).toHaveCount(0)
})
