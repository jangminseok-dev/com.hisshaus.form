import { ApplyFlow } from '../../components/ApplyFlow'
import { holidays } from '../../lib/holidays'

// 공휴일 목록(달력에서 막을 날)을 12시간(43200초)마다 새로 받는다. 받기가 실패하면 빈 목록이라 화요일만 막는다.
// Next 가 빌드 때 읽는 값이라 계산식이 아니라 숫자로 적는다.
export const revalidate = 43200

export default async function Page() {
  return <ApplyFlow holidays={await holidays()} />
}
