import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'

import { shop } from '../content/shop'
import { BASE_PATH } from '../lib/base-path'
import './globals.css'

// 쓰는 굵기 셋의 subset 만 직접 싣는다(외부 도메인 요청 없음).
const pretendard = localFont({
  src: [
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Regular.subset.woff2', weight: '400' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-SemiBold.subset.woff2', weight: '600' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Bold.subset.woff2', weight: '700' },
  ],
  display: 'swap',
})

// 카카오톡 같은 곳에 링크를 붙였을 때 보이는 미리보기. 사진은 public/og.jpg 다.
// 미리보기 그림 주소에는 Next 가 basePath 를 붙이지 않아서 직접 붙인다.
export const metadata: Metadata = {
  title: shop.ogTitle,
  description: shop.ogDescription,
  openGraph: {
    title: shop.ogTitle,
    description: shop.ogDescription,
    images: [`${BASE_PATH}/og.jpg`],
  },
}

// viewportFit 'cover': 화면을 기기 화면 끝까지 채운다(아이폰의 홈 표시줄 자리 포함). 가려질 수 있는 자리는 안전 영역 여백으로
// 비우는데, 아래 고정 막대(StepForm·첫 화면)와 화면 아래 여백이 이미 env(safe-area-inset-bottom) 을 더한다. 실기기 확인 항목이다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.className}>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
