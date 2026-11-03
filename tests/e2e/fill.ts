import { expect, type Locator, type Page } from '@playwright/test'

import { TRAINING_SERVICE } from '../../forms/apply'
import { isOpenDay } from '../../lib/slots'

// e2e 가 같이 쓰는 도우미. 화면의 표지(data-group·data-question·data-action)와 역할(role)로만 찾는다.

export const GUARDIAN = '김하나'
export const PHONE = '010-1234-5678'

/** 한국 시각의 오늘에서 days 일 뒤, YYYY-MM-DD. 화면·서버가 쓰는 todayKst 와 같은 기준이다. */
function kstDate(days: number): string {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * 도우미가 날짜 문항에 넣는 값(오늘+7일부터 첫 여는 날 — 쉬는 날은 달력에서 누를 수 없다).
 * 한 번만 구해서, 실행 중 자정을 넘겨도 넣은 값과 단언하는 값이 같다.
 */
export const WISH_DATE = Array.from({ length: 7 }, (_, i) => kstDate(7 + i)).find((d) => isOpenDay(d))!

const question = (page: Page, id: string) => page.locator(`[data-question="${id}"]`)

/** 지금 보이는 묶음의 id. */
export async function currentGroup(page: Page): Promise<string> {
  return (await page.locator('[data-group]').getAttribute('data-group')) ?? ''
}

export async function expectGroup(page: Page, id: string): Promise<void> {
  await expect(page.locator('[data-group]')).toHaveAttribute('data-group', id)
}

/** 글 입력 문항에 값을 쓴다. */
export async function setText(page: Page, id: string, value: string): Promise<void> {
  await question(page, id).locator('input, textarea').fill(value)
}

/** 칩 문항에서 선택지 하나를 누른다(단일은 radio, 복수는 checkbox). */
export async function choose(page: Page, id: string, option: string): Promise<void> {
  const q = question(page, id)
  await q
    .getByRole('radio', { name: option, exact: true })
    .or(q.getByRole('checkbox', { name: option, exact: true }))
    .click()
}

type Kind = 'consent' | 'single' | 'multi' | 'date' | 'long' | 'phone' | 'email' | 'short' | 'unknown'

/** 달력을 열어 date(YYYY-MM-DD)를 고른다. 그 달이 보일 때까지 다음 달을 누른다(도우미 날짜는 오늘+7일이라 많아야 한 번). */
export async function pickDate(q: Locator, date: string): Promise<void> {
  await q.getByRole('combobox').click()
  const dialog = q.getByRole('dialog')
  for (let i = 0; i < 3; i++) {
    const day = dialog.locator(`[data-date="${date}"]:not([data-outside])`)
    if ((await day.count()) > 0) {
      await day.click()
      await expect(q.getByRole('combobox')).toHaveAttribute('data-value', date)
      return
    }
    await dialog.getByRole('button', { name: '다음 달' }).click()
  }
  throw new Error(`달력에서 ${date} 를 찾지 못했다`)
}

/**
 * 지금 묶음에서 아직 비어 있는 필수 문항. 필수 여부는 문항 뿌리의 data-required 이고, 유형은 DOM 모양으로 알아낸다.
 * 이미 값이 있는 문항(미리 채운 값, 복원된 값, 테스트가 먼저 쓴 값)은 건드리지 않으려고 뺀다.
 */
async function emptyRequired(page: Page): Promise<{ id: string; kind: Kind }[]> {
  return page.locator('[data-question]').evaluateAll((roots) =>
    roots.flatMap((root): { id: string; kind: Kind }[] => {
      if (root.getAttribute('data-required') !== 'true') return []
      const id = root.getAttribute('data-question') ?? ''
      const input = (type: string) => root.querySelector<HTMLInputElement>(`input[type="${type}"]`)
      const area = root.querySelector<HTMLTextAreaElement>('textarea')
      const checked = (selector: string) => root.querySelector(`${selector}[aria-checked="true"]`) !== null
      const text = (el: HTMLInputElement | null) => (el?.value ?? '').trim() !== ''

      let kind: Kind
      let filled: boolean
      if (input('checkbox')) [kind, filled] = ['consent', input('checkbox')!.checked]
      else if (root.querySelector('[role="radiogroup"]')) [kind, filled] = ['single', checked('[role="radio"]')]
      else if (root.querySelector('[role="group"]')) [kind, filled] = ['multi', checked('[role="checkbox"]')]
      else if (root.querySelector('input[data-value]'))
        [kind, filled] = ['date', (root.querySelector<HTMLInputElement>('input[data-value]')!.dataset.value ?? '') !== '']
      else if (area) [kind, filled] = ['long', area.value.trim() !== '']
      else if (input('tel')) [kind, filled] = ['phone', text(input('tel'))]
      else if (input('email')) [kind, filled] = ['email', text(input('email'))]
      else if (input('text')) [kind, filled] = ['short', text(input('text'))]
      else [kind, filled] = ['unknown', false]
      return filled ? [] : [{ id, kind }]
    }),
  )
}

async function fillOne(page: Page, id: string, kind: Kind): Promise<void> {
  const q = question(page, id)
  switch (kind) {
    case 'consent':
      return q.locator('input[type="checkbox"]').check()
    case 'single':
      return q.locator('[role="radio"]').first().click()
    case 'multi':
      return q.locator('[role="checkbox"]').first().click()
    case 'date':
      return pickDate(q, WISH_DATE)
    case 'long':
      return q.locator('textarea').fill('가나다')
    case 'phone':
      return q.locator('input[type="tel"]').fill('01012345678')
    case 'email':
      return q.locator('input[type="email"]').fill('a@b.co')
    case 'short':
      return q.locator('input[type="text"]').fill('가나다')
    case 'unknown':
      throw new Error(`알 수 없는 모양의 필수 문항: ${id}`)
  }
}

/** 지금 묶음의 비어 있는 필수 문항을 유효한 값으로 채운다. 채우다 새로 드러난 필수 문항까지 한 번 더 본다. */
export async function fillGroup(page: Page): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const todo = await emptyRequired(page)
    if (todo.length === 0) return
    for (const { id, kind } of todo) await fillOne(page, id, kind)
  }
  const left = await emptyRequired(page)
  if (left.length > 0) throw new Error(`채우지 못한 필수 문항: ${left.map((q) => q.id).join(', ')}`)
}

/** `다음` 을 눌러 다음 묶음으로 간다. 막혀 있으면(aria-disabled) 누를 수 있게 될 때까지 기다리다 시간이 다 된다. */
export async function goNext(page: Page): Promise<void> {
  const before = await currentGroup(page)
  await page.locator('[data-action="next"]').click()
  await expect(page.locator('[data-group]')).not.toHaveAttribute('data-group', before)
}

/** 묶음을 하나씩 채우고 넘기며 target 묶음에 닿을 때까지 간다. onGroup 은 닿은 묶음마다(target 포함) 부른다. */
export async function fillUntil(page: Page, target: string, onGroup?: () => Promise<void>): Promise<void> {
  for (;;) {
    await onGroup?.()
    if ((await currentGroup(page)) === target) return
    await fillGroup(page)
    await goNext(page)
  }
}

/** 첫 화면에서 `예약 신청서` 링크를 눌러 신청서의 첫 묶음을 연다. */
export async function openApply(page: Page): Promise<void> {
  await page.goto('/hisshaus')
  await page.getByRole('link', { name: '예약 신청서' }).click()
  await expectGroup(page, 'guardian')
}

/**
 * 첫 화면부터 신청서를 끝까지 채우고 `신청하기` 를 누른다. 결과 화면은 기다리지 않는다.
 * 이용 안내에서 고른 서비스의 묶음(기본은 도우미가 첫 선택지인 미용을, training 이면 교육미용만)과 예약금 안내를 거친다.
 */
export async function writeApply(page: Page, o: { pet?: string; training?: boolean } = {}): Promise<void> {
  await openApply(page)
  await setText(page, 'guardian_name', GUARDIAN)
  await setText(page, 'guardian_phone', PHONE)
  await fillGroup(page)
  await goNext(page)
  await setText(page, 'pet_name', o.pet ?? '보리')
  await fillGroup(page)
  await goNext(page)
  // 반려견 건강
  await fillGroup(page)
  await goNext(page)
  if (o.training) await choose(page, 'services', TRAINING_SERVICE)
  await fillGroup(page)
  await goNext(page)
  await fillUntil(page, 'deposit')
  await fillGroup(page)
  await page.locator('[data-action="submit"]').click()
}

/** 검사지의 지금 묶음부터 마지막 묶음 l 까지 채우고 `제출하기` 를 누른다. 결과 화면은 기다리지 않는다. */
/** 검사지를 끝까지 채우고 제출하기 → 확인 창의 제출하기까지 누른다. */
export async function submitSurvey(page: Page): Promise<void> {
  await fillUntil(page, 'l')
  await fillGroup(page)
  await page.locator('[data-action="submit"]').click()
  await page.locator('[data-action="confirm-submit"]').click()
}

/** 가로로 넘치지 않는다: 문서 전체의 가로 스크롤 폭이 화면 폭 안이다. */
export async function expectNoHorizontalOverflow(page: Page, width: number): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth, `가로 스크롤 폭 ${scrollWidth}px 가 화면 폭 ${width}px 를 넘는다`).toBeLessThanOrEqual(width)
}

/** 지금 화면에 보이는 글 전체(검사지 질문 원문처럼 해요체가 아닌 화면에서는 쓰지 않는다). */
export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText)
}

/** 이 시점부터 화면에 나타난 묶음 id 를 순서대로 기록한다. 읽는 함수를 돌려준다. 화면이 통째로 새로 열리면 기록이 끊긴다. */
export async function recordGroups(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __seenGroups: string[] }).__seenGroups = seen
    const note = () => {
      const id = document.querySelector('[data-group]')?.getAttribute('data-group')
      if (id && seen[seen.length - 1] !== id) seen.push(id)
    }
    note()
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-group'],
    })
  })
  return () => page.evaluate(() => (window as unknown as { __seenGroups: string[] }).__seenGroups)
}
