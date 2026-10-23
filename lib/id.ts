const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** 브라우저가 만드는 신청 ID. 영숫자 10자. */
export function newSubmissionId(): string {
  const bytes = new Uint8Array(10)
  globalThis.crypto.getRandomValues(bytes)
  // 256 이 62 로 나누어떨어지지 않아 약간 치우치지만, 추측 방지용이 아닌 식별용이라 괜찮다.
  return Array.from(bytes, (b) => CHARS[b % CHARS.length]).join('')
}

export function isSubmissionId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9]{10}$/.test(v)
}
