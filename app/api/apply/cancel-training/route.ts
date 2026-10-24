import { handle } from '../../../../lib/http'
import { cancelTraining } from '../../../../lib/submit'

export const runtime = 'nodejs'
// 슬랙 전송이 끝난 뒤에 응답하므로 함수 시간 제한을 30초로 올린다.
export const maxDuration = 30

export const POST = (req: Request) => handle(req, cancelTraining)
