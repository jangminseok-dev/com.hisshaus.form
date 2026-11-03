import type { NextConfig } from 'next'

import { BASE_PATH } from './lib/base-path'

const noStore = [{ key: 'Cache-Control', value: 'private, no-store' }]

// 동의서 PDF 를 만드는 곳(서명 API, 사장님 화면의 메일 다시 보내기)은 원본 PDF 둘과 한글 글꼴을 파일로 읽는다.
// 코드가 import 하지 않는 파일이라 빌드의 추적에 기대지 않고 배포 묶음에 넣는다. 목록은 lib/consent-pdf.ts 가 읽는 파일과 같다.
const consentPdfFiles = [
  './content/consent-agreement.pdf',
  './content/consent-guidelines.pdf',
  './node_modules/pretendard/dist/public/static/Pretendard-Regular.otf',
]

const config: NextConfig = {
  basePath: BASE_PATH,
  poweredByHeader: false,
  agentRules: false,
  logging: { incomingRequests: false },
  outputFileTracingIncludes: { '/api/consent': consentPdfFiles, '/admin': consentPdfFiles },
  // 도메인 첫 주소(chagocnote.com/)는 아직 비어 있어서 신청서 첫 화면으로 보낸다. 나중에 플랫폼이 이 주소를 맡으면 지운다.
  async redirects() {
    return [{ source: '/', destination: BASE_PATH, basePath: false, permanent: false }]
  },
  // basePath 가 있으면 source 앞에 저절로 붙는다(/hisshaus/apply/...). /survey/:path* 는 /survey 자체도 잡는다.
  // 검사지는 받은 링크로만 여는 페이지라 검색에 잡히지 않게 하고, 다른 사이트로 넘어갈 때 링크 주소가 따라가지 않게 한다.
  async headers() {
    return [
      ...['/apply/:path*', '/api/:path*'].map((source) => ({ source, headers: noStore })),
      // 사장님 화면(/admin)과 보호자 동의서 링크(/consent)도 검사지처럼 숨긴다.
      ...['/survey/:path*', '/admin/:path*', '/consent/:path*'].map((source) => ({
        source,
        headers: [
          ...noStore,
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      })),
    ]
  },
}

export default config
