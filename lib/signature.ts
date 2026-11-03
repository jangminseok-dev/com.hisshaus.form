/* 손으로 그린 사인의 글자 표현. 시트 한 칸(4000자 이내)에 담고, 나중에 PDF 에 선으로 그린다.
   형식: 점은 `x,y` 를 공백으로, 획은 `;` 로 잇는다. 예) "10,20 15,25;30,40 31,42"
   좌표는 논리 상자(가로 0..600, 세로 0..200) 안의 정수다. */

export const SIG_W = 600
export const SIG_H = 200
export const SIG_MAX_CHARS = 4000

export type Stroke = [number, number][]

export function encodeSignature(strokes: Stroke[]): string {
  return strokes.map((stroke) => stroke.map(([x, y]) => `${x},${y}`).join(' ')).join(';')
}

const POINT = /^(\d{1,3}),(\d{1,3})$/

/** 올바른 사인이면 획 목록, 아니면 null. 한 점짜리 획은 선이 되지 못하므로 버린다. */
export function decodeSignature(s: unknown): Stroke[] | null {
  if (typeof s !== 'string' || s.length === 0 || s.length > SIG_MAX_CHARS) return null
  const strokes: Stroke[] = []
  for (const part of s.split(';')) {
    const stroke: Stroke = []
    for (const token of part.split(' ')) {
      const m = POINT.exec(token)
      if (!m) return null
      const x = Number(m[1])
      const y = Number(m[2])
      if (x > SIG_W || y > SIG_H) return null
      stroke.push([x, y])
    }
    if (stroke.length >= 2) strokes.push(stroke)
  }
  return strokes.length > 0 ? strokes : null
}

/** 앞서 남긴 점에서 minGap 픽셀보다 가까운 점을 버린다. 첫 점과 끝 점은 남긴다. */
export function simplify(stroke: Stroke, minGap = 3): Stroke {
  if (stroke.length <= 2) return stroke.map(([x, y]) => [x, y])
  const out: Stroke = [stroke[0]]
  for (let i = 1; i < stroke.length - 1; i++) {
    const [px, py] = out[out.length - 1]
    if (Math.hypot(stroke[i][0] - px, stroke[i][1] - py) >= minGap) out.push(stroke[i])
  }
  out.push(stroke[stroke.length - 1])
  return out
}
