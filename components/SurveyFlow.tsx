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
  // 제출이 접수됐다. 다음 화면이 그려지기 전의 입력·뒤로 가기로 초안이 되살아나지 않게 그 뒤의 초안 저장은 버린다.
  const submitted = useRef(false)
  const [start, setStart] = useState<{ initial: Draft; session: ApplySession | null; today: string; fromApply: boolean } | null>(null)

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
      // 신청 완료·검사지 안내 화면에서 넘어왔으면 주소에 ?from=apply 가 있다. 첫 묶음의 이전은 그때만 완료 화면으로 돌아가고,
      // 첫 화면이나 링크로 바로 열었으면(지난 신청 세션이 남아 있어도) 첫 화면으로 간다.
      fromApply: new URLSearchParams(window.location.search).get('from') === 'apply',
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
  const { initial, session, today, fromApply } = start

  async function submit(answers: Answers) {
    const result = await postJson('/api/survey', {
      submissionId: initial.submissionId,
      answers,
      applyId: session?.submissionId,
      website: website.current?.value ?? '',
    })
    if (result !== 'ok') return result
    submitted.current = true

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
        onDraft={(d) => {
          if (!submitted.current) saveDraft('survey', { ...d, applyId: initial.applyId })
        }}
        onSubmit={submit}
        onBackFromFirst={() => router.push(fromApply && session ? '/apply/done' : '/')}
      />
      <Honeypot ref={website} />
    </>
  )
}
