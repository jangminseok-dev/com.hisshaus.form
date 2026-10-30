// 이 웹이 열리는 경로다. 운영 주소는 chagocnote.com/hisshaus 이고 next.config.ts 의 basePath 가 이 값을 쓴다.
// Link·router 의 주소에는 Next 가 알아서 붙이지만, fetch 주소와 public 그림 주소에는 이 값을 직접 붙인다.
export const BASE_PATH = '/hisshaus'

// 슬랙에 싣는 검사지 링크처럼 도메인까지 적어야 하는 주소의 앞부분이다. 요청의 Host 는 믿지 않고 이 값을 쓴다.
// 히스하우스 전용 도메인으로 옮기면 이 줄을 고친다.
export const SITE_ORIGIN = 'https://chagocnote.com'
