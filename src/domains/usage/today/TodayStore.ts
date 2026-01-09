import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'

import { writable } from 'svelte/store'
import { objectHash } from '../../../modules/object-hash/object-hash'

import type { ITrackables } from '../../ledger/ledger-tools'
import { LedgerStore } from '../../ledger/LedgerStore'

import logsToTrackableUsage from '../usage-utils'
import type { TrackableUsageMap } from '../trackable-usage.class'
import { getContextOn } from '../../context/context-utils'
import { TrackableUsage } from '../trackable-usage.class'

type TodayStoreStateType = {
  date: Dayjs
  usage: TrackableUsageMap
  usageHash: string
  showController: boolean
}

type LoadTodayProps = {
  date?: Dayjs | Date | number
  knownTrackables: ITrackables
  showController?: boolean
}

const initialState: TodayStoreStateType = {
  date: dayjs(),
  usage: {},
  usageHash: '',
  showController: false,
}

export const TodayStore = writable(initialState)

export const goBackInTime = () => {
  TodayStore.update((s) => {
    s.showController = true
    return s
  })
}

export const loadToday = async (props: LoadTodayProps) => {
  const date = dayjs(props.date || new Date())
  const logs = await LedgerStore.query({ start: date.startOf('day'), end: date.endOf('day'), caller: 'today-store' })
  const usage = logsToTrackableUsage(logs, { trackables: props.knownTrackables || {}, caller: '$TodayStore.loadToday' })

  // Get active contexts for today (including those with duration that are still active)
  const activeContexts = await getContextOn(date.toDate(), props.knownTrackables || {})
  
  // Add active contexts that aren't already in the usage map
  Object.keys(activeContexts).forEach((contextTag) => {
    if (!usage[contextTag]) {
      const contextUsage = activeContexts[contextTag]
      const trackable = contextUsage.trackable
      const duration = trackable.ctx?.duration || 1
      
      // Find the most recent log date for this context
      let mostRecentDate: Dayjs | null = null
      if (contextUsage.dates && contextUsage.dates.length > 0) {
        // Get the most recent date that's still active today
        const activeDates = contextUsage.dates.filter((loopDate: Dayjs) => {
          const contextStart = dayjs(loopDate).startOf('day')
          const contextEnd = contextStart.add(duration - 1, 'day')
          const checkDate = date.startOf('day')
          return checkDate >= contextStart && checkDate <= contextEnd
        })
        
        if (activeDates.length > 0) {
          // Get the most recent active date
          mostRecentDate = activeDates.reduce((latest: Dayjs, current: Dayjs) => {
            return current.isAfter(latest) ? current : latest
          })
        }
      }
      
      // Calculate remaining days
      let displayValue = '1'
      if (mostRecentDate && duration > 1) {
        const contextStart = mostRecentDate.startOf('day')
        const contextEnd = contextStart.add(duration - 1, 'day')
        const today = date.startOf('day')
        const remainingDays = contextEnd.diff(today, 'day') + 1 // +1 to include today
        
        if (remainingDays > 0) {
          displayValue = remainingDays === 1 ? '1 day left' : `${remainingDays} days left`
        }
      }
      
      // Create a TrackableUsage entry for the active context
      // Use value of 1 to indicate it's active (this makes the card show as colored/active)
      usage[contextTag] = new TrackableUsage({
        trackable: trackable,
        values: [1],
        hours: [],
        dates: [date],
        logs: contextUsage.logs || [],
        positivity: [],
      })
      usage[contextTag].displayValue = displayValue
    } else if (usage[contextTag] && usage[contextTag].trackable.type === 'context') {
      // Update existing context usage to show remaining days
      const trackable = usage[contextTag].trackable
      const duration = trackable.ctx?.duration || 1
      const contextUsage = activeContexts[contextTag]
      
      // Get dates from contextUsage if available, otherwise use dates from usage entry
      const datesToCheck = (contextUsage && contextUsage.dates && contextUsage.dates.length > 0) 
        ? contextUsage.dates 
        : (usage[contextTag].dates || [])
      
      if (duration > 1 && datesToCheck.length > 0) {
        // Find the most recent active date
        const activeDates = datesToCheck.filter((loopDate: Dayjs) => {
          const contextStart = dayjs(loopDate).startOf('day')
          const contextEnd = contextStart.add(duration - 1, 'day')
          const checkDate = date.startOf('day')
          return checkDate >= contextStart && checkDate <= contextEnd
        })
        
        if (activeDates.length > 0) {
          const mostRecentDate = activeDates.reduce((latest: Dayjs, current: Dayjs) => {
            return current.isAfter(latest) ? current : latest
          })
          
          const contextStart = mostRecentDate.startOf('day')
          const contextEnd = contextStart.add(duration - 1, 'day')
          const today = date.startOf('day')
          const remainingDays = contextEnd.diff(today, 'day') + 1 // +1 to include today
          
          if (remainingDays > 0) {
            usage[contextTag].displayValue = remainingDays === 1 ? '1 day left' : `${remainingDays} days left`
          }
        }
      }
    }
  })

  // Update Store
  TodayStore.update((s) => {
    s.date = date
    s.usage = usage
    s.usageHash = objectHash(usage)
    if (props.showController === false) {
      s.showController = false
    }
    return s
  })
}
