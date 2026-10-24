'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { applyForm, TRAINING_SERVICE } from '../forms/apply'
import type { Answers } from '../forms/types'
import { clearDraft, loadDraft, saveDraft, saveSession, type Draft } from '../lib/draft'
import { todayKst } from '../lib/format'
import { newSubmissionId } from '../lib/id'
import { postJson } from '../lib/post'
import { pruneStaleAnswers } from '../lib/validate'
import { wishText } from '../lib/wish'
import { Honeypot } from './Honeypot'
import { StepForm } from './StepForm'

function text(a: Answers, id: string): string {
  const v = a[id]
  return typeof v === 'string' ? v : ''
}

function list(a: Answers, id: string): string[] {
  const v = a[id]
  return Array.isArray(v) ? v : []
}

/**
 * 예약 신청서. 초안과 오늘 날짜는 브라우저에서만 알 수 있어서 마운트 뒤에 읽고, 읽기 전에는 아무것도 그리지 않는다
 * (그릴 때 읽으면 서버가 그린 것과 달라 하이드레이션이 어긋나고, 오늘 날짜가 빌드 시각으로 굳는다).
 *
 * 열 때 지난 세션을 지우지 않는다: 완료 화면에서 뒤로 가기로 이 화면이 다시 열려도, 앞으로 가기로 돌아온 완료 화면이
 * 세션을 읽을 수 있어야 한다. 세션은 다음 신청이 접수될 때 덮어쓴다.
 */
export function ApplyFlow() {
  const router = useRouter()
  const website = useRef<HTMLInputElement>(null)
  // 제출이 접수됐다. 다음 화면이 그려지기 전에도 이 화면은 입력·뒤로 가기를 받는데, 그때 초안을 다시 저장하면 다음에 열 때
  // 낸 신청이 되살아나 같은 신청 ID 로 또 보내게 된다. 접수된 뒤의 초안 저장은 버린다.
  const submitted = useRef(false)
  const [start, setStart] = useState<{ initial: Draft; today: string } | null>(null)

  useEffect(() => {
    setStart({
      // 새 초안마다 방문 기록 칸의 주인을 가리는 열쇠를 따로 만든다(신청 ID 와 별개).
      initial: (() => {
        const d = loadDraft('apply')
        // 문항 정의가 바뀐 뒤 남은 옛 답은 버린다.
        return d ? { ...d, answers: pruneStaleAnswers(applyForm, d.answers) } : { answers: {}, groupIndex: 0, submissionId: newSubmissionId(), key: newSubmissionId() }
      })(),
      today: todayKst(),
    })
  }, [])

  if (!start) return null
  const { initial, today } = start

  async function submit(answers: Answers) {
    const result = await postJson('/api/apply', {
      submissionId: initial.submissionId,
      answers,
      website: website.current?.value ?? '',
    })
    if (result !== 'ok') return result
    submitted.current = true

    const services = list(answers, 'services')
    const training = services.includes(TRAINING_SERVICE)
    saveSession({
      submissionId: initial.submissionId,
      guardianName: text(answers, 'guardian_name'),
      guardianPhone: text(answers, 'guardian_phone'),
      petName: text(answers, 'pet_name'),
      services,
      wish: wishText(answers),
      training,
      surveyDone: false,
    })
    clearDraft('apply')
    // 보낸 화면으로 뒤로 가기 한 번에 돌아오지 않도록 방문 기록을 바꿔 쓴다.
    router.replace(training ? '/apply/training' : '/apply/done')
    return 'ok'
  }

  return (
    <>
      <StepForm
        form={applyForm}
        initial={initial}
        today={today}
        submitLabel="신청하기"
        onDraft={(d) => {
          if (!submitted.current) saveDraft('apply', d)
        }}
        onSubmit={submit}
        onBackFromFirst={() => router.push('/')}
      />
      <Honeypot ref={website} />
    </>
  )
}
