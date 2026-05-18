import { computed, ref, type Ref } from "vue"
import type { TimelineGridRowModel, TimelineProjectGroupModel } from "./types"

export function useMyTimelineHierarchy(rows: Ref<TimelineGridRowModel[]>) {
  const collapsedProjectIds = ref<Set<string>>(new Set())

  const groupedRows = computed<TimelineProjectGroupModel[]>(() => {
    const groups = new Map<string, TimelineProjectGroupModel>()

    for (const row of rows.value) {
      const existing = groups.get(row.projectExternalId)
      if (existing) {
        existing.rows.push(row)
        continue
      }

      groups.set(row.projectExternalId, {
        projectExternalId: row.projectExternalId,
        projectName: row.projectName,
        rows: [row],
      })
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((left, right) => left.chargeName.localeCompare(right.chargeName)),
      }))
      .sort((left, right) => left.projectName.localeCompare(right.projectName))
  })

  function isProjectCollapsed(projectExternalId: string): boolean {
    return collapsedProjectIds.value.has(projectExternalId)
  }

  function toggleProject(projectExternalId: string): void {
    const next = new Set(collapsedProjectIds.value)
    if (next.has(projectExternalId)) {
      next.delete(projectExternalId)
    } else {
      next.add(projectExternalId)
    }
    collapsedProjectIds.value = next
  }

  function collapseAllProjects(): void {
    collapsedProjectIds.value = new Set(groupedRows.value.map((group) => group.projectExternalId))
  }

  function expandAllProjects(): void {
    collapsedProjectIds.value = new Set()
  }

  return {
    collapsedProjectIds,
    groupedRows,
    isProjectCollapsed,
    toggleProject,
    collapseAllProjects,
    expandAllProjects,
  }
}
