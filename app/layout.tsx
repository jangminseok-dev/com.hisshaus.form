import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'

import { shop } from '../content/shop'
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
export const metadata: Metadata = {
  title: shop.ogTitle,
  description: shop.ogDescription,
  openGraph: {
    title: shop.ogTitle,
    description: shop.ogDescription,
    images: ['/og.jpg'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
