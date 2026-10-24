import { shop } from '../content/shop'
import styles from './Screen.module.css'

/** 카카오톡 채널 채팅으로 가는 보조 버튼. 폰에서는 카카오톡 앱의 채널 채팅이 바로 열린다. 완료 화면 둘이 쓴다. */
export function KakaoLink() {
  return (
    <a className={styles.secondary} href={shop.kakaoChatUrl} target="_blank" rel="noopener noreferrer">
      <KakaoIcon />
      카카오톡 채널로 문의하기
    </a>
  )
}

/** 말풍선 모양. 외부 그림을 부르지 않으려고 직접 그린다. 글자색을 따른다. */
export function KakaoIcon() {
  return (
    <svg className={styles.icon} width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 3C5.6 3 2 5.8 2 9.3c0 2.2 1.5 4.2 3.7 5.3l-.9 3.3c-.1.3.2.5.5.4l3.9-2.6c.3 0 .5.1.8.1 4.4 0 8-2.8 8-6.5S14.4 3 10 3z" />
    </svg>
  )
}
