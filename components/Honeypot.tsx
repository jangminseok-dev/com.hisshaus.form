import type { Ref } from 'react'

/**
 * 봇을 거르는 숨은 입력. 사람 눈에도 보조 기기에도 안 보이고 탭으로도 닿지 않는다. 서버는 이 값이 있으면 봇으로 보고
 * 성공한 척 기록을 버린다. 그래서 브라우저 자동 채움이 이 칸을 채우면 보호자는 성공 화면을 보지만 기록이 남지 않는다 —
 * 이름(name)을 두지 않고 자동 완성을 꺼서 자동 채움이 양식 칸으로 알아보지 못하게 한다.
 * 보낼 때 ref 로 값을 읽어 `website` 에 싣는다.
 */
export function Honeypot({ ref }: { ref: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      type="text"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}
    />
  )
}
