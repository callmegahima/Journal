import { useCallback } from 'react'
import type { ChecklistGroup } from '@/types'
import { useData } from '@/store/DataContext'
import { groupLabelFor } from '@/lib/checklist'

/** Checklist section names, including the ones the trader renamed. */
export function useGroupLabel(): (group: ChecklistGroup) => string {
  const { data } = useData()
  const labels = data.settings.groupLabels
  return useCallback((group: ChecklistGroup) => groupLabelFor(group, labels), [labels])
}
