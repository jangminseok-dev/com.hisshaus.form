import Link from 'next/link'

import { KakaoLink } from './KakaoLink'
import styles from './Screen.module.css'

const COPY = {
  closed: {
    title: '열 수 없는 동의서예요',
    text: '링크가 바뀌었을 수 있어요. 카카오톡 채널로 알려 주세요.',
  },
  signed: {
    title: '이미 서명한 동의서예요',
    // 메일이 실패했을 수도 있어서 보냈다고 단정하지 않는다.
    text: '사본은 메일로 보내 드려요. 받지 못했다면 카카오톡 채널로 알려 주세요.',
  },
  error: {
    title: '지금은 동의서를 열 수 없어요',
    text: '잠시 뒤 다시 열어 주세요.',
  },
}

/**
 * 동의서 서명 화면 대신 보이는 안내. closed: 링크가 틀렸거나 취소됐거나 모르는 동의서다. signed: 이 링크로 이미 서명했다.
 * error: 시트를 못 읽었다(묶음·사장님이 채운 칸이 시트에 있어서 서명 화면을 그릴 수 없다).
 * device 는 사장님이 잠근 매장 아이패드다. 새로 고쳐 이 안내가 떠도 갇히지 않게 사장님 화면(PIN)으로 가는 길을 둔다.
 */
export function ConsentNotice({ kind, device = false }: { kind: 'closed' | 'signed' | 'error'; device?: boolean }) {
  const { title, text } = COPY[kind]
  return (
    <div className={styles.screen} data-notice={kind}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        <KakaoLink />
        <Link className={styles.primary} href="/">
          처음으로
        </Link>
        {device && (
          <Link className={styles.secondary} href="/admin">
            사장님 화면으로
          </Link>
        )}
      </div>
    </div>
  )
}
