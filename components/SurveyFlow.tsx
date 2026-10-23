'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { surveyForm } from '../forms/survey'
import type { Answers } from '../forms/types'
import { clearDraft, loadDraft, loadSession, saveDraft, saveSession, type ApplySession, type Draft } from '../lib/draft'
import { todayKst } from '../lib/format'
import { newSubmissionId } from '../lib/id'
import { postJson } from '../lib/post'
import { Honeypot } from './Honeypot'
import { StepForm } from './StepForm'

/**
 * 심층 행동 분석 검사지. 신청서를 쓴 뒤 이어서 열 수도 있고, `/survey` 를 바로 열어도 된다(신청 세션 없이).
 * 초안·세션·오늘 날짜는 브라우저에서만 알 수 있어서 마운트 뒤에 읽고, 읽기 전에는 아무것도 그리지 않는다.
 *
 * 세션이 있으면 새 초안의 신청 ID 는 신청서의 것을 그대로 쓴다(시트의 두 탭이 같은 ID 로 이어진다). 의뢰인 성함·연락처와
 * 반려견 이름은 신청서에서 쓴 값으로 미리 채우고, 초안에 그 신청 ID 를 applyId 로 적어 둔다.
 */
export function SurveyFlow() {
  const router = useRouter()
  const website = useRef<HTMLInputElement>(null)
  const [start, setStart] = useState<{ initial: Draft; session: ApplySession | null; today: string } | null>(null)

  useEffect(() => {
    const session = loadSession()
    let initial = loadDraft('survey')
    // 지난 신청 때 쓰던 검사지가 새 신청에 섞이지 않게, 다른 신청에 묶인 초안은 버린다. 세션 없이 쓰기 시작한 초안(applyId
    // 없음)은 나중에 신청 세션이 생겨도 버리지 않고 그대로 이어 쓴다(미리 채우기는 새 초안에만 한다).
    if (initial?.applyId && session && initial.applyId !== session.submissionId) {
      clearDraft('survey')
      initial = null
    }
    setStart({
      session,
      today: todayKst(),
      initial: initial ?? {
        answers: session ? { q3: session.guardianName, q4: session.guardianPhone, q7: session.petName } : {},
        groupIndex: 0,
        submissionId: session ? session.submissionId : newSubmissionId(),
        // 신청 ID 를 신청서와 같이 쓰므로, 방문 기록 칸의 주인은 새 초안마다 만드는 열쇠로 가린다.
        key: newSubmissionId(),
        applyId: session?.submissionId,
      },
    })
  }, [])

  if (!start) return null
  const { initial, session, today } = start

  async function submit(answers: Answers) {
    const result = await postJson('/api/survey', {
      submissionId: initial.submissionId,
      answers,
      applyId: session?.submissionId,
      website: website.current?.value ?? '',
    })
    if (result !== 'ok') return result

    clearDraft('survey')
    if (session) saveSession({ ...session, surveyDone: true })
    router.replace('/survey/done')
    return 'ok'
  }

  return (
    <>
      <StepForm
        form={surveyForm}
        initial={initial}
        today={today}
        submitLabel="제출하기"
        // StepForm 이 알리는 초안에는 applyId 가 없으니 처음 받은 값을 붙여 저장한다.
        onDraft={(d) => saveDraft('survey', { ...d, applyId: initial.applyId })}
        onSubmit={submit}
        onBackFromFirst={() => router.push(session ? '/apply/done' : '/')}
      />
      <Honeypot ref={website} />
    </>
  )
}
