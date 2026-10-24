import { TRAINING_SERVICE } from '../forms/apply'

/** 예약금. 교육미용 상담이 들어 있으면 50,000원, 그 밖은 10,000원. 첫 화면 안내(content/shop.ts 의 deposit)와 맞춘다. */
export function depositOf(services: readonly string[]): string {
  return services.includes(TRAINING_SERVICE) ? '50,000원' : '10,000원'
}
