'use client'

import { ConsentField } from './ConsentField'
import { DateField } from './DateField'
import { LongField } from './LongField'
import { MultiChoice } from './MultiChoice'
import type { FieldProps } from './parts'
import { ShortField } from './ShortField'
import { SingleChoice } from './SingleChoice'

/** 문항 유형에 맞는 입력을 고른다. 유형별 분기는 여기 한 곳뿐이고, StepForm 은 이것만 그린다. */
export function Field({ today, ...props }: FieldProps & { today: string }) {
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
      return <DateField {...props} today={today} />
    case 'consent':
      return <ConsentField {...props} />
  }
}
