'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { surveyForm } from '../forms/survey'
import type { Answers } from '../forms/types'
import { clearDraft, loadDraft, markSurveySent, saveDraft, sentSurveyId, type Draft } from '../lib/draft'
import { todayKst } from '../lib/format'
import { newSubmissionId } from '../lib/id'
import { postJson } from '../lib/post'
import { pruneStaleAnswers } from '../lib/validate'
import { Honeypot } from './Honeypot'
import { StepForm } from './StepForm'
import { SurveyNotice } from './SurveyNotice'

const CONFIRM = '제출하면 답을 고칠 수 없어요. 제출할까요?'

/**
 * 심층 행동 분석 검사지. 사장님이 보낸 링크(app/survey/[token])로만 열린다. 서버가 링크를 확인하고 그 신청 ID 와 링크를 넘긴다.
 * 초안·오늘 날짜는 브라우저에서만 알 수 있어서 마운트 뒤에 읽고, 읽기 전에는 아무것도 그리지 않는다.
 *
 * 초안은 이 링크의 신청 ID 로 묶는다(새 초안의 신청 ID 도 링크의 것이라 시트의 두 탭이 같은 ID 로 이어진다). 다른 링크의 초안과
 * 옛 버전의 초안(applyId 없음)은 버린다. 이 기기에서 이 링크의 검사지를 이미 냈으면 문항 대신 닫힌 안내를 보인다:
 * 완료 화면에서 뒤로 오면 Next 가 캐시해 둔 이 화면이 다시 열리는데, 그때 빈 검사지가 보이면 링크가 닫히지 않은 것처럼 보인다.
 */
export function SurveyFlow({ applyId, token }: { applyId: string; token: string }) {
  const router = useRouter()
  const website = useRef<HTMLInputElement>(null)
  // 제출이 접수됐다. 다음 화면이 그려지기 전의 입력·뒤로 가기로 초안이 되살아나지 않게 그 뒤의 초안 저장은 버린다.
  const submitted = useRef(false)
  const [start, setStart] = useState<{ initial: Draft; today: string } | 'sent' | null>(null)

  useEffect(() => {
    if (sentSurveyId() === applyId) {
      setStart('sent')
      return
    }
    let initial = loadDraft('survey')
    if (initial && initial.applyId !== applyId) {
      clearDraft('survey')
      initial = null
    }
    setStart({
      today: todayKst(),
      initial: initial
        ? // 문항 정의가 바뀐 뒤 남은 옛 답(글 칸이던 문항의 글 등)은 버린다.
          { ...initial, answers: pruneStaleAnswers(surveyForm, initial.answers) }
        : // 방문 기록 칸의 주인은 새 초안마다 만드는 열쇠로 가린다(신청 ID 는 같은 링크면 늘 같다).
          { answers: {}, groupIndex: 0, submissionId: applyId, key: newSubmissionId(), applyId },
    })
  }, [])

  if (!start) return null
  if (start === 'sent') return <SentNotice />
  const { initial, today } = start

  async function submit(answers: Answers) {
    const result = await postJson('/api/survey', { token, answers, website: website.current?.value ?? '' })
    if (result !== 'ok') return result
    submitted.current = true

    clearDraft('survey')
    markSurveySent(applyId)
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
        confirmSubmit={CONFIRM}
        // StepForm 이 알리는 초안에는 applyId 가 없으니 이 링크의 것을 붙여 저장한다.
        onDraft={(d) => {
          if (!submitted.current) saveDraft('survey', { ...d, applyId })
        }}
        onSubmit={submit}
      />
      <Honeypot ref={website} />
    </>
  )
}

/**
 * 이 기기에서 낸 검사지의 링크를 다시 열었다. 닫힌 안내를 보이고, 여기서 뒤로 가기로 낸 검사지가 묶음마다 쌓은 방문 기록 칸에 닿으면
 * 건너뛴다(그 칸들은 모두 같은 주소라 하나씩 누르면 같은 안내만 거듭 보인다). 처음 그릴 때는 건너뛰지 않는다: 완료 화면에서 뒤로 온
 * 보호자가 이 안내를 본다.
 */
function SentNotice() {
  useEffect(() => {
    const skip = (event: PopStateEvent) => {
      if (event.state?.hhForm === surveyForm.id) history.back()
    }
    window.addEventListener('popstate', skip)
    return () => window.removeEventListener('popstate', skip)
  }, [])
  return <SurveyNotice kind="closed" />
}
