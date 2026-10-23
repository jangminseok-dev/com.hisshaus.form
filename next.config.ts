import type { NextConfig } from 'next'

const noStore = [{ key: 'Cache-Control', value: 'private, no-store' }]

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  logging: { incomingRequests: false },
  async headers() {
    return ['/apply/:path*', '/survey/:path*', '/api/:path*'].map((source) => ({
      source,
      headers: noStore,
    }))
  },
}

export default config
