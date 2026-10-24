import type { NextConfig } from 'next'

import { BASE_PATH } from './lib/base-path'

const noStore = [{ key: 'Cache-Control', value: 'private, no-store' }]

const config: NextConfig = {
  basePath: BASE_PATH,
  poweredByHeader: false,
  agentRules: false,
  logging: { incomingRequests: false },
  // 도메인 첫 주소(chagocnote.com/)는 아직 비어 있어서 신청서 첫 화면으로 보낸다. 나중에 플랫폼이 이 주소를 맡으면 지운다.
  async redirects() {
    return [{ source: '/', destination: BASE_PATH, basePath: false, permanent: false }]
  },
  // basePath 가 있으면 source 앞에 저절로 붙는다(/hisshaus/apply/...).
  async headers() {
    return ['/apply/:path*', '/survey/:path*', '/api/:path*'].map((source) => ({
      source,
      headers: noStore,
    }))
  },
}

export default config
