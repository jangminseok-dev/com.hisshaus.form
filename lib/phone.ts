/**
 * 국내 전화번호에 하이픈을 넣는다. 숫자만으로 0 으로 시작할 때만 손대고, +82 처럼 국가 번호가 있거나 글자가 섞이면 그대로 둔다.
 * 02 는 2자리 지역번호, 그 밖은 3자리. 가운데는 남는 길이에 따라 3 또는 4자리. 예) 01012345678 → 010-1234-5678, 0212345678 → 02-1234-5678.
 */
export function formatKoreanPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!/^0\d+$/.test(raw.replace(/-/g, '')) || digits.length < 3) return raw
  const head = digits.startsWith('02') ? 2 : 3
  const rest = digits.slice(head)
  if (rest.length <= 4) return rest.length === 0 ? digits : `${digits.slice(0, head)}-${rest}`
  const mid = rest.length <= 7 ? 3 : 4
  const tail = rest.slice(mid)
  return tail.length === 0
    ? `${digits.slice(0, head)}-${rest.slice(0, mid)}`
    : `${digits.slice(0, head)}-${rest.slice(0, mid)}-${tail.slice(0, 4)}`
}
