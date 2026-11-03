'use client'

import { ConsentField } from './ConsentField'
import { DateField } from './DateField'
import { LongField } from './LongField'
import { MultiChoice } from './MultiChoice'
import type { FieldProps } from './parts'
import { ShortField } from './ShortField'
import { SingleChoice } from './SingleChoice'
import { TimeField } from './TimeField'

/** 문항 유형에 맞는 입력을 고른다. 유형별 분기는 여기 한 곳뿐이고, StepForm 은 이것만 그린다. date 는 time 문항의 짝 날짜 답이다. */
export function Field({ today, date, holidays, ...props }: FieldProps & { today: string; date?: string; holidays?: readonly string[] }) {
  switch (props.q.type) {
    case 'short':
    case 'phone':
    case 'email':
      return <ShortField {...props} />
    case 'long':
      return <LongField {...props} />
    case 'single':
      return <SingleChoice {...props} />
    case 'multi':
      return <MultiChoice {...props} />
    case 'date':
      return <DateField {...props} today={today} holidays={holidays} />
    case 'time':
      return <TimeField {...props} date={date} />
    case 'consent':
      return <ConsentField {...props} />
  }
}
