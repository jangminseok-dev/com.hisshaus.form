'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { clearDraft, saveSession } from '../lib/draft'
import { postJson } from '../lib/post'
import { useApplySession } from '../lib/use-session'
import styles from './Screen.module.css'

/**
 * 교육미용을 고른 신청이 접수된 뒤, 검사지를 이어서 쓸지 묻는 화면. 신청 세션이 있어야 열린다. 이미 교육미용을 취소했거나 검사지를
 * 낸 세션이 주소로 다시 열면 안내를 보이지 않고 완료 화면으로 보낸다. 그대로 두면 '교육미용은 아니에요' 를 또 눌러 취소 알림이
 * 한 통 더 간다.
 */
export function TrainingIntro() {
  const router = useRouter()
  const session = useApplySession()
  const [busy, setBusy] = useState(false)
  const notNeeded = session !== null && (!session.training || session.surveyDone)

  useEffect(() => {
    if (notNeeded) router.replace('/apply/done')
  }, [notNeeded])

  if (!session || notNeeded) return null

  // 잘못 눌렀을 때 빠져나오는 길이다. 슬랙에 취소 알림을 한 통 보내되, 알림이 실패해도 보호자를 막지 않는다.
  const notTraining = async () => {
    if (busy) return
    setBusy(true)
    await postJson('/api/apply/cancel-training', {
      submissionId: session.submissionId,
      petName: session.petName,
      guardianName: session.guardianName,
    })
    saveSession({ ...session, training: false })
    clearDraft('survey')
    router.replace('/apply/done')
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>심층 행동 분석 검사지를 이어서 작성해요</h1>
      <p className={styles.text}>중간에 창을 닫아도 쓰던 자리가 저장돼요.</p>
      <div className={styles.box}>
        <p>
          예약 신청은 여기서 먼저 접수돼요. 검사지를 다 못 써도 신청은 히스하우스에 전달돼요. 검사지는 나중에 같은 링크로 이어서 쓸 수 있어요.
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => router.push('/survey')}>
          검사지 작성 시작
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={notTraining}>
          교육미용은 아니에요
        </button>
      </div>
    </div>
  )
}
