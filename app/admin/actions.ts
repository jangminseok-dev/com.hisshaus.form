'use server'

import { redirect } from 'next/navigation'

import { readSession, requireAdmin, writeSession } from '../../lib/admin-guard'
import { checkPassword, checkPin, MAX_PIN_FAILS, SESSION_DAYS } from '../../lib/admin-session'
import { mailAddress } from '../../lib/config'
import { cancelConsent, createConsent, resendConsentMail } from '../../lib/consent-admin'
import { consentIdOf, newConsentId } from '../../lib/consent-link'
import { isSubmissionId } from '../../lib/id'
import { sendMail } from '../../lib/mail'

export type ActionState = { error?: string }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!checkPassword(form.get('password'))) {
    // 비밀번호를 연달아 시도하는 속도를 늦춘다.
    await wait(1000)
    return { error: '비밀번호가 맞지 않아요' }
  }
  await writeSession({ exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000, locked: false, fails: 0 })
  redirect('/admin')
}

export async function logout(): Promise<void> {
  await writeSession(null)
  redirect('/admin')
}

/** 잠긴 세션에서만 PIN 을 받는다. 5번 틀리면 로그아웃해서 비밀번호부터 다시 넣게 한다. */
export async function unlock(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await readSession()
  if (!session || !session.locked) redirect('/admin')
  if (checkPin(form.get('pin'))) {
    await writeSession({ ...session, locked: false, fails: 0 })
    redirect('/admin')
  }
  // PIN 도 비밀번호처럼 연달아 시도하는 속도를 늦춘다.
  await wait(1000)
  const fails = session.fails + 1
  if (fails >= MAX_PIN_FAILS) {
    await writeSession(null)
    redirect('/admin')
  }
  await writeSession({ ...session, fails })
  return { error: 'PIN 이 맞지 않아요' }
}

/** 운영에서 네이버 발송이 되는지 확인하는 시험 메일. 사장님 자기 주소로 보낸다. */
export async function sendTestMail(): Promise<ActionState & { ok?: boolean }> {
  await requireAdmin()
  try {
    await sendMail({
      to: mailAddress(),
      subject: '[히스하우스] 메일 설정 시험',
      text: '이 메일이 보이면 동의서 사본을 보낼 수 있어요.',
    })
    return { ok: true }
  } catch {
    console.error('메일 전송 실패', 'test')
    return { error: '메일을 보내지 못했어요. 네이버 메일 설정을 확인해 주세요.' }
  }
}

const isSheetError = (e: unknown) => e instanceof Error && e.message === 'sheets'

const SHEET_WRITE_ERROR = '지금은 시트에 쓸 수 없어요. 잠시 뒤 다시 눌러 주세요.'

export type CreateState = ActionState & { errors?: Record<string, string>; id?: string; url?: string }

const str = (form: FormData, key: string) => {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

/** 동의서를 만든다(시트에 준비 줄). 성공하면 보호자에게 보낼 링크를 돌려준다. */
export async function createConsentAction(_prev: CreateState, form: FormData): Promise<CreateState> {
  await requireAdmin()
  const applyId = str(form, 'applyId')
  const id = newConsentId()
  try {
    const out = await createConsent(
      {
        applyId: isSubmissionId(applyId) ? applyId : '',
        bundle: str(form, 'bundle'),
        programName: str(form, 'programName'),
        goal: str(form, 'goal'),
        classTime: str(form, 'classTime'),
        groomingParts: form.getAll('groomingParts').filter((v): v is string => typeof v === 'string'),
        shown: {
          guardianName: str(form, 'guardianName'),
          phone: str(form, 'phone'),
          petName: str(form, 'petName'),
          breed: str(form, 'breed'),
        },
      },
      { id },
    )
    return out
  } catch (e) {
    // 시트 오류만 안내한다. 그 밖의 예외(비밀값 없음 등)는 그대로 던져 오류 화면이 뜨게 한다.
    if (!isSheetError(e)) throw e
    console.error('시트 저장 실패', id)
    return { error: SHEET_WRITE_ERROR }
  }
}

/** 서명 전인 동의서를 취소한다. */
export async function cancelConsentAction(id: string): Promise<{ result?: 'ok' | 'not-found' | 'signed'; error?: string }> {
  await requireAdmin()
  try {
    return { result: await cancelConsent(id) }
  } catch (e) {
    if (!isSheetError(e)) throw e
    console.error('시트 저장 실패', id)
    return { error: SHEET_WRITE_ERROR }
  }
}

/**
 * 매장 아이패드로 바로 서명받는다. 사장님 로그인은 그대로 두고 기기를 잠근 뒤(실패 횟수 0) 서명 화면으로 보낸다.
 * 잠긴 동안 사장님 화면·액션은 requireAdmin 이 /admin(PIN 화면)으로 보낸다. 틀린 링크면 잠그지 않는다.
 */
export async function startDeviceSign(token: string): Promise<ActionState> {
  const session = await requireAdmin()
  if (consentIdOf(token) === null) return { error: '링크가 올바르지 않아요.' }
  await writeSession({ ...session, locked: true, fails: 0 })
  redirect(`/consent/${token}`)
}

/** 서명했는데 메일이 실패한(또는 메일 줄이 없는) 동의서의 PDF 를 다시 만들어 실패한 통만 다시 보낸다. */
export async function resendConsentMailAction(
  id: string,
): Promise<{ result?: { archive: boolean; guardian: boolean } | 'not-signed' | 'already-sent'; error?: string }> {
  await requireAdmin()
  try {
    return { result: await resendConsentMail(id) }
  } catch (e) {
    // 시트 읽기 실패만 안내한다(사장님이 화면에서 바로 본다). PDF 실패 등은 그대로 던져 오류 화면이 뜨게 한다.
    if (!isSheetError(e)) throw e
    return { error: '지금은 시트를 읽을 수 없어요. 잠시 뒤 다시 눌러 주세요.' }
  }
}
