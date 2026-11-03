import { ApplyFlow } from '../../components/ApplyFlow'
import { holidays } from '../../lib/holidays'

// 공휴일 목록(달력에서 막을 날)을 한 시간마다 새로 받는다. 받기가 실패하면 빈 목록이라 화요일만 막는다.
export const revalidate = 3600

export default async function Page() {
  return <ApplyFlow holidays={await holidays()} />
}
