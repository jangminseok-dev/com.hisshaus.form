import Link from 'next/link'

import { shop } from '../content/shop'
import styles from './Landing.module.css'

/**
 * 첫 화면: 로고 줄, 큰 사진, 제목과 안내, 작성할 양식 둘(예약 신청서·검사지), 정보 줄(위치·영업시간·예약금·인스타그램).
 * 사진은 next/image 가 아니라 평범한 img 다. 이미지 최적화 사용량을 쓰지 않고, 사진은 크기가 정해진 한 장이다.
 */
export function Landing() {
  return (
    <div className={styles.page}>
      <header data-section="head" className={styles.head}>
        <span className={styles.wordmark}>{shop.name}</span>
      </header>

      <div data-section="hero" className={styles.hero}>
        <img className={styles.photo} src={shop.heroImage} alt={`${shop.nameKo} 매장`} width={1200} height={900} />
      </div>

      <section data-section="intro" className={styles.intro}>
        <h1 className={styles.title}>예약 신청</h1>
        <p>신청서를 보내 주시면 확인한 뒤 연락드려요.</p>
        <p>연락하면서 예약 날짜와 시간을 확정한 뒤, 예약금을 입금해 주시면 예약이 완료돼요.</p>
        <p>아이가 편안하게 케어받을 수 있도록 충분히 상담한 뒤 예약을 진행해요.</p>
      </section>

      {/* 링크 이름은 제목 줄(aria-labelledby), 설명 줄은 설명(aria-describedby)이다. 이름에 다 넣으면 낭독이 길어진다. */}
      <nav data-section="choices" aria-label="작성할 양식" className={styles.choices}>
        <Link className={styles.choice} href="/apply" aria-labelledby="choice-apply" aria-describedby="choice-apply-desc">
          <span className={styles.choiceText}>
            <span id="choice-apply" className={styles.choiceTitle}>
              예약 신청서
            </span>
            <span id="choice-apply-desc" className={styles.choiceDesc}>
              미용, 데이케어, 호텔, 교육미용 상담을 예약해요
            </span>
          </span>
          <Chevron />
        </Link>
        <Link className={styles.choice} href="/survey" aria-labelledby="choice-survey" aria-describedby="choice-survey-desc">
          <span className={styles.choiceText}>
            <span id="choice-survey" className={styles.choiceTitle}>
              심층 행동 분석 검사지
            </span>
            <span id="choice-survey-desc" className={styles.choiceDesc}>
              교육미용 상담 전에 반려견의 행동을 미리 알려 주세요
            </span>
          </span>
          <Chevron />
        </Link>
      </nav>

      <dl data-section="info" className={styles.info}>
        <div className={styles.row}>
          <dt>위치</dt>
          <dd>
            {/* 새 탭으로 연다. 신청서를 쓰다 돌아와도 이 화면이 그대로 있다. */}
            <a className={styles.mapLink} href={shop.mapUrl} target="_blank" rel="noopener noreferrer">
              {shop.address}
            </a>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>영업시간</dt>
          <dd className={styles.lines}>{shop.hours}</dd>
        </div>
        <div className={styles.row}>
          <dt>예약금</dt>
          <dd className={styles.lines}>{shop.deposit}</dd>
        </div>
        <div className={styles.row}>
          <dt>소식</dt>
          <dd>
            <a
              className={styles.social}
              href={shop.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${shop.nameKo} 인스타그램`}
            >
              <InstagramIcon />
              <span aria-hidden="true">@{shop.instagramHandle}</span>
            </a>
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** 인스타그램 모양(둥근 네모·원·점). 외부 그림을 부르지 않으려고 직접 그린다. 글자색을 따른다. */
function InstagramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 양식 줄 오른쪽의 › . 글자색을 따른다. */
function Chevron() {
  return (
    <svg
      className={styles.chevron}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
