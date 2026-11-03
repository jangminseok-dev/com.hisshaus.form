import { describe, expect, it } from 'vitest'

import config from '../next.config'

describe('응답 헤더', () => {
  it('검사지 경로는 저장하지 않고, 검색에 잡히지 않고, 다른 사이트로 주소를 넘기지 않는다', async () => {
    const rules = await config.headers!()
    const survey = rules.find((r) => r.source === '/survey/:path*')!
    expect(survey.headers).toEqual(
      expect.arrayContaining([
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ]),
    )
  })

  it('신청서·API 는 저장하지 않기만 한다(첫 화면은 링크로 퍼뜨리는 공개 페이지다)', async () => {
    const rules = await config.headers!()
    for (const source of ['/apply/:path*', '/api/:path*']) {
      expect(rules.find((r) => r.source === source)?.headers).toEqual([{ key: 'Cache-Control', value: 'private, no-store' }])
    }
    expect(rules.map((r) => r.source).sort()).toEqual(['/admin/:path*', '/api/:path*', '/apply/:path*', '/consent/:path*', '/survey/:path*'])
  })

  it('사장님 화면과 동의서 경로도 저장하지 않고, 검색에 잡히지 않고, 다른 사이트로 주소를 넘기지 않는다', async () => {
    const rules = await config.headers!()
    for (const source of ['/admin/:path*', '/consent/:path*']) {
      expect(rules.find((r) => r.source === source)!.headers).toEqual(
        expect.arrayContaining([
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ]),
      )
    }
  })
})

describe('배포 묶음', () => {
  it('동의서 PDF 를 만드는 서명 API 와 사장님 화면은 원본 PDF 둘과 글꼴을 함께 싣는다', () => {
    // lib/consent-pdf.ts 가 읽는 파일 셋
    const files = [
      './content/consent-agreement.pdf',
      './content/consent-guidelines.pdf',
      './node_modules/pretendard/dist/public/static/Pretendard-Regular.otf',
    ]
    for (const route of ['/api/consent', '/admin']) {
      expect([...(config.outputFileTracingIncludes?.[route] ?? [])].sort(), route).toEqual(files)
    }
  })
})
