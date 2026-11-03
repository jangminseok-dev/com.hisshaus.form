import { describe, expect, it } from 'vitest'
import { decodeSignature, encodeSignature, SIG_MAX_CHARS, simplify, type Stroke } from '../lib/signature'

describe('사인 데이터', () => {
  it('인코딩한 사인을 되읽으면 같은 획이다', () => {
    const strokes: Stroke[] = [
      [[10, 20], [15, 25]],
      [[30, 40], [31, 42], [600, 200]],
    ]
    const s = encodeSignature(strokes)
    expect(s).toBe('10,20 15,25;30,40 31,42 600,200')
    expect(decodeSignature(s)).toEqual(strokes)
  })

  it('4000자를 넘거나 상자 밖 점·소수·빈 사인은 null 이다', () => {
    expect(decodeSignature('')).toBeNull()
    expect(decodeSignature(null)).toBeNull()
    expect(decodeSignature(5)).toBeNull()
    expect(decodeSignature('601,0 1,1')).toBeNull()
    expect(decodeSignature('0,201 1,1')).toBeNull()
    expect(decodeSignature('-1,0 1,1')).toBeNull()
    expect(decodeSignature('1.5,2 3,4')).toBeNull()
    expect(decodeSignature('1,2 abc')).toBeNull()
    expect(decodeSignature('1,2  3,4')).toBeNull()
    const long = Array.from({ length: 700 }, (_, i) => `${100 + (i % 2)},${100 + (i % 3)}`).join(' ')
    expect(long.length).toBeGreaterThan(SIG_MAX_CHARS)
    expect(decodeSignature(long)).toBeNull()
  })

  it('두 점 이상인 획이 하나도 없으면 null 이고, 한 점짜리 획은 읽을 때 버린다', () => {
    expect(decodeSignature('5,5')).toBeNull()
    expect(decodeSignature('5,5;6,6')).toBeNull()
    expect(decodeSignature('5,5;10,10 20,20')).toEqual([[[10, 10], [20, 20]]])
  })

  it('simplify 는 3픽셀보다 가까운 점을 버리되 첫 점과 끝 점은 남긴다', () => {
    expect(simplify([[0, 0], [1, 1], [2, 2], [3, 0], [10, 10], [11, 10]])).toEqual([[0, 0], [3, 0], [10, 10], [11, 10]])
    expect(simplify([[5, 5], [6, 5]])).toEqual([[5, 5], [6, 5]])
    expect(simplify([[5, 5]])).toEqual([[5, 5]])
    expect(simplify([])).toEqual([])
  })
})
