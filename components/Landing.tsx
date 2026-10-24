import Link from 'next/link'

import { shop } from '../content/shop'
import styles from './Landing.module.css'

/**
 * 첫 화면: 매장 이름, 큰 사진, 제목과 안내, 정보 줄(위치·영업시간·예약금), 아래 고정 버튼.
 * 사진은 next/image 가 아니라 평범한 img 다. 이미지 최적화 사용량을 쓰지 않고, 사진은 크기가 정해진 한 장이다.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <header data-section="head" className={styles.head}>
        {shop.name}
      </header>

      <div data-section="hero">
        <img className={styles.photo} src={shop.heroImage} alt={`${shop.nameKo} 매장`} width={1200} height={900} />
      </div>

      <section data-section="intro" className={styles.intro}>
        <h1 className={styles.title}>예약 신청서</h1>
        <p>이 신청서는 예약 확정이 아니에요. 신청서를 확인한 뒤 따로 연락드리고, 최종 안내를 받으면 예약이 확정돼요.</p>
        <p>아이의 편안한 케어를 위해 충분히 상담한 뒤 예약을 진행해요.</p>
      </section>

      <dl data-section="info" className={styles.info}>
        <div className={styles.row}>
          <dt>위치</dt>
          <dd>{shop.address}</dd>
        </div>
        <div className={styles.row}>
          <dt>영업시간</dt>
          <dd>{shop.hours}</dd>
        </div>
        <div className={styles.row}>
          <dt>예약금</dt>
          <dd>{shop.deposit}</dd>
        </div>
      </dl>

      <div data-section="cta" className={styles.cta}>
        <Link className={styles.button} href="/apply">
          예약 신청하기
        </Link>
      </div>
    </div>
  )
}
