import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { loadSession, type ApplySession } from './draft'

/**
 * 신청 세션이 있어야 열리는 화면이 쓴다. 세션은 브라우저에만 있어서 그릴 때가 아니라 마운트 뒤에 읽는다: 그릴 때 읽으면
 * 서버가 그린 것과 달라 하이드레이션이 어긋나고, Node 25 서버의 localStorage 는 경고를 찍는다.
 * 읽기 전에는 null 이다. 세션이 없으면(주소를 직접 열었거나 저장소를 비웠다) 첫 화면으로 보낸다.
 */
export function useApplySession(): ApplySession | null {
  const router = useRouter()
  const [session, setSession] = useState<ApplySession | null>(null)
  useEffect(() => {
    const s = loadSession()
    if (s) setSession(s)
    else router.replace('/')
  }, [])
  return session
}
