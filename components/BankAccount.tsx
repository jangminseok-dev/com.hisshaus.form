'use client'

import { useState } from 'react'

import { shop } from '../content/shop'
import styles from './Screen.module.css'

/** 예약금 입금 계좌 한 줄과 복사 버튼. 폰에서 계좌번호를 옮겨 적지 않아도 되게 한다. 복사가 막힌 환경에서는 글만 보인다. */
export function BankAccount() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(shop.bankAccount.number.replace(/-/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 복사가 막혔다(권한 없음·옛 브라우저). 글은 그대로 보이니 손으로 옮긴다.
    }
  }
  return (
    <p className={styles.account}>
      <span>
        {shop.bankAccount.bank} <span className={styles.accountNumber}>{shop.bankAccount.number}</span>
      </span>
      <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
        {copied ? '복사했어요' : '계좌번호 복사'}
      </button>
    </p>
  )
}
