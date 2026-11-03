import type { CSSProperties } from 'react'

import { CONSENT_TEXT } from '../content/consent-text'
import { type FieldBox, type FieldKey, LAYOUT, PAGE_SIZE, PAGES, type PageId } from '../lib/consent-docs'
import styles from './Consent.module.css'

/** PDF 와 같은 줄 간격(lib/consent-pdf.ts 의 LINE). 칸 높이에 들어가는 줄 수를 PDF 처럼 센다. */
const LINE = 1.2

const pct = (n: number) => `${n * 100}%`

/**
 * PDF 포인트(왼쪽 아래 원점)를 장 그림 위의 % 자리로. 글자 크기는 장 폭에 대한 비율(--fs, 1 = 장 폭의 1%)로 넘기고
 * CSS 가 그림 폭(컨테이너 단위)에 맞춰 키운다.
 */
function boxStyle(box: FieldBox): CSSProperties {
  const lines = Math.max(1, Math.floor(box.h / (box.size * LINE)))
  return {
    left: pct(box.x / PAGE_SIZE.w),
    top: pct(1 - (box.y + box.h) / PAGE_SIZE.h),
    width: pct(box.w / PAGE_SIZE.w),
    height: pct(box.h / PAGE_SIZE.h),
    ['--fs' as string]: (box.size / PAGE_SIZE.w) * 100,
    ['--lines' as string]: lines,
  }
}

/**
 * 동의서 한 장: 원본 장 그림 위에 PDF 와 같은 칸 값을 얹어 서명했을 때의 모습을 보여 준다(사인 칸은 비운다).
 * values 의 키는 LAYOUT 의 칸 이름이고, 미용 부위 칸(`part:등`)은 체크할 칸에만 '✓' 를 넣는다.
 * 얹은 글은 보조 기기에 읽히지 않는다(앞 단계에서 확인한 값이다). 대신 그림 아래 '글로 읽기' 에 장 글 전체가 있다.
 */
export function ConsentPage({ page, values }: { page: PageId; values: Partial<Record<FieldKey, string>> }) {
  const doc = PAGES[page]
  return (
    <div className={styles.page}>
      <div className={styles.sheet}>
        {/* 이 웹의 그림이라 next/image 를 쓰지 않는다(이미지 최적화 사용량을 쓰지 않는다). */}
        <img className={styles.image} src={doc.image} alt={doc.title} width={1240} height={1754} />
        {LAYOUT[page].map((box) => {
          const text = box.key === 'signature' ? undefined : values[box.key]
          if (!text) return null
          const kind = box.key.startsWith('part:') ? 'check' : box.key === 'month' || box.key === 'day' ? 'center' : undefined
          return (
            <span key={box.key} className={styles.value} data-field={box.key} data-kind={kind} style={boxStyle(box)} aria-hidden="true">
              <span className={styles.valueText}>{text}</span>
            </span>
          )
        })}
      </div>
      <details className={styles.read}>
        <summary className={styles.readSummary}>글로 읽기</summary>
        <p className={styles.readText}>{CONSENT_TEXT[page]}</p>
      </details>
    </div>
  )
}
