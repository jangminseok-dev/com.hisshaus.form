import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONSENT_TEXT } from '../content/consent-text'
import { BASE_PATH } from '../lib/base-path'
import {
  BUNDLES,
  GROOMING_PARTS,
  LAYOUT,
  PAGE_SIZE,
  PAGES,
  bundleOf,
  type FieldBox,
  type PageId,
} from '../lib/consent-docs'

const PAGE_IDS = Object.keys(PAGES) as PageId[]
const keysOf = (id: PageId) => LAYOUT[id].map((b) => b.key)

describe('동의서 묶음과 장', () => {
  it('묶음 다섯은 사장님이 정한 장과 순서다', () => {
    expect(BUNDLES.map((b) => [b.label, b.pages])).toEqual([
      ['행동수정 트레이닝', ['agreement', 'behavior', 'guidelines']],
      ['신뢰쌓기', ['agreement', 'trust', 'guidelines']],
      ['그루밍 트레이닝', ['agreement', 'groomingTraining', 'guidelines']],
      ['교육 중단 미용 동의서', ['unfinishedGrooming']],
      ['일반 미용', ['generalGrooming']],
    ])
  })

  it('묶음마다 사장님이 채울 칸이 정해져 있고, bundleOf 는 모르는 ID 에 undefined 다', () => {
    expect(BUNDLES.map((b) => [b.id, b.ownerFields])).toEqual([
      ['behavior', ['programName', 'goal']],
      ['trust', ['classTime']],
      ['groomingTraining', []],
      ['unfinishedGrooming', ['groomingParts']],
      ['generalGrooming', ['groomingParts']],
    ])
    expect(bundleOf('trust')?.label).toBe('신뢰쌓기')
    expect(bundleOf('agreement')).toBeUndefined()
    expect(bundleOf('')).toBeUndefined()
  })

  it('장은 원본 PDF 의 제목·위치 그대로이고, 안내사항만 사인 없이 확인해요', () => {
    expect(PAGE_IDS.map((id) => [id, PAGES[id].title, PAGES[id].source, PAGES[id].index])).toEqual([
      ['agreement', '반려견 교육 서약서', 'agreement', 0],
      ['behavior', '히스하우스 행동수정 프로그램 계약서', 'agreement', 1],
      ['trust', '신뢰쌓기 프로그램 계약서', 'agreement', 2],
      ['groomingTraining', '히스하우스 그루밍 트레이닝 프로그램 계약서', 'agreement', 3],
      ['unfinishedGrooming', '교육을 마치지 않은 상태의 반려견의 미용 동의서', 'agreement', 4],
      ['generalGrooming', '교육을 하지 않은 상태의 반려견의 미용 동의서', 'agreement', 5],
      ['guidelines', '교육미용 안내사항', 'guidelines', 0],
    ])
    for (const id of PAGE_IDS) {
      const page = PAGES[id]
      expect(page.id).toBe(id)
      expect([page.signed, page.agreeLabel]).toEqual(
        id === 'guidelines' ? [false, '확인했어요'] : [true, '읽고 동의해요'],
      )
      expect(page.image).toBe(`${BASE_PATH}/consent-v1-${id}.png`)
      // 장 그림과 글은 scripts/consent-pages.mjs 가 원본에서 만든 것이다
      expect(existsSync(join(process.cwd(), 'public', `consent-v1-${id}.png`))).toBe(true)
      expect(CONSENT_TEXT[id]).toContain(page.title)
    }
  })
})

describe('칸 좌표', () => {
  it('사인하는 장마다 작성일·보호자 성함·서명 칸이 있고, 2~6장에는 의뢰인·반려견 칸이 있다', () => {
    for (const id of PAGE_IDS.filter((p) => PAGES[p].signed)) {
      const keys = keysOf(id)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys).toEqual(expect.arrayContaining(['yearSuffix', 'month', 'day', 'signerName', 'signature']))
      const guardian = ['guardianName', 'phoneMid', 'phoneLast', 'petName', 'breed']
      if (id === 'agreement') expect(keys.filter((k) => guardian.includes(k))).toEqual([])
      else expect(keys).toEqual(expect.arrayContaining(guardian))
      // 1·4장은 교육 담당자에 '히스하우스' 가 이미 인쇄돼 있다
      expect(keys.includes('manager')).toBe(id !== 'agreement' && id !== 'groomingTraining')
    }
  })

  it('2장은 프로그램 명·수업 목표, 3장은 수업 시간, 5·6장은 미용 부위 15칸이 있다', () => {
    expect(GROOMING_PARTS).toEqual([
      '등', '배', '앞다리', '뒷다리', '발톱깎기', '발바닥털정리', '항문낭압출', '귀청소',
      '목욕&드라이', '얼굴컷트', '눈앞컷트', '귀바깥털', '발등', '생식기털', '항문털',
    ])
    const owner = (id: PageId) =>
      keysOf(id).filter((k) => k === 'programName' || k === 'goal' || k === 'classTime' || k.startsWith('part:'))
    const parts = GROOMING_PARTS.map((p) => `part:${p}`)
    expect(owner('agreement')).toEqual([])
    expect(owner('behavior')).toEqual(['programName', 'goal'])
    expect(owner('trust')).toEqual(['classTime'])
    expect(owner('groomingTraining')).toEqual([])
    expect(owner('unfinishedGrooming')).toEqual(parts)
    expect(owner('generalGrooming')).toEqual(parts)
  })

  it('모든 칸은 페이지 안에 있고 같은 장의 칸끼리 겹치지 않는다', () => {
    const overlap = (a: FieldBox, b: FieldBox) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    for (const id of PAGE_IDS) {
      const boxes = LAYOUT[id]
      for (const b of boxes) {
        expect(b.w, `${id} ${b.key}`).toBeGreaterThan(0)
        expect(b.h, `${id} ${b.key}`).toBeGreaterThan(0)
        expect(b.size, `${id} ${b.key}`).toBeGreaterThan(0)
        expect(b.x >= 0 && b.y >= 0, `${id} ${b.key}`).toBe(true)
        expect(b.x + b.w <= PAGE_SIZE.w && b.y + b.h <= PAGE_SIZE.h, `${id} ${b.key}`).toBe(true)
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap(boxes[i], boxes[j]), `${id} ${boxes[i].key} ↔ ${boxes[j].key}`).toBe(false)
        }
      }
    }
  })

  it('안내사항에는 칸이 없다', () => {
    expect(LAYOUT.guidelines).toEqual([])
  })
})
