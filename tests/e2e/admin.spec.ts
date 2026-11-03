import { expect, test } from '@playwright/test'

import { E2E_ADMIN_PASSWORD, fakeState, resetFake } from './fake'

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
