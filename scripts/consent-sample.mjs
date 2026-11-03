// 동의서 PDF 표본 다섯(묶음마다 하나)을 임시 폴더에 만들고 경로와 크기를 찍는다. 칸 위치를 눈으로 볼 때 쓴다.
//   pnpm exec tsx scripts/consent-sample.mjs
// 그림으로 보려면: pdftoppm -png -r 80 <경로> <접두어>
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUNDLES, GROOMING_PARTS, PAGES } from '../lib/consent-docs'
import { buildConsentPdf } from '../lib/consent-pdf'
import { encodeSignature } from '../lib/signature'

// 손으로 쓴 듯한 짧은 사인: '김' 비슷한 획 셋과 밑줄(600×200 캔버스, 위가 0)
const wave = (x0, x1, y, amp) => Array.from({ length: 12 }, (_, i) => [Math.round(x0 + ((x1 - x0) * i) / 11), Math.round(y + amp * Math.sin(i))])
const signature = encodeSignature([
  [[60, 50], [170, 50], [150, 120], [120, 160]],
  [[230, 40], [230, 170]],
  [[300, 60], [400, 60], [400, 140], [300, 140], [300, 60]],
  wave(80, 560, 185, 6),
])

// 사장님 칸은 상한 길이(Task 9: 프로그램 명 30자·수업 목표 60자·수업 시간 30자) 그대로
const owner = {
  programName: '짖음과 분리불안을 함께 다루는 행동수정 집중 과정 7주',
  goal: '초인종이 울려도 짖지 않고 매트에서 기다리기, 보호자가 나갈 때 울지 않고 혼자 쉬기, 산책 줄 당기지 않기',
  classTime: '매주 토요일 오전 10시부터 11시까지 여덟 번 진행함',
  groomingParts: [GROOMING_PARTS[0], GROOMING_PARTS[3], GROOMING_PARTS[4], GROOMING_PARTS[8], GROOMING_PARTS[14]],
}
console.log(`사장님 칸 글자 수: ${owner.programName.length}·${owner.goal.length}·${owner.classTime.length}`)

for (const bundle of BUNDLES) {
  const { bytes, docHash, fileHash } = await buildConsentPdf({
    bundle: bundle.id,
    consentId: 'CnSt12345678',
    applyId: 'Ab3dE5gH9k',
    guardian: { guardianName: '김하나', phone: '010-1234-5678', petName: '보리', breed: '말티즈', email: 'hana@example.com' },
    owner,
    signature,
    signedAt: '2026-11-03 14:05:09',
    device: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    agreed: [...bundle.pages.map((id) => `${PAGES[id].title} — ${PAGES[id].agreeLabel}`), '전자 방식으로 서명하는 데 동의해요'],
    changes: bundle.id === 'behavior' ? ['견종 말티 → 말티즈'] : [],
  })
  const file = join(tmpdir(), `consent-sample-${bundle.id}.pdf`)
  writeFileSync(file, bytes)
  console.log(`${file}  ${(bytes.length / 1024).toFixed(1)}KB  내용 ${docHash.slice(0, 12)}…  파일 ${fileHash.slice(0, 12)}…`)
}
