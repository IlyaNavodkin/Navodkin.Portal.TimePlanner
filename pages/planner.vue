<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"

import type { CreateTimelineRequest, TimelineItemDto, UpdateTimelineRequest } from "~/features/timeline/types"
import type { TimelineCreatePayloadModel, TimelineUpdatePayloadModel } from "~/composables/my-test-timeline/types"

interface TimelineGridBlockModel {
  id: string
  employeeExternalId: string
  employeeName: string
  startIndex: number
  endIndex: number
  lane: number
}

interface TimelineGridRowModel {
  id: string
  projectExternalId: string
  chargeExternalId: string
  projectName: string
  chargeName: string
  label: string
  lanesCount: number
  blocks: TimelineGridBlockModel[]
}

interface TimelineBlockLayout {
  id: string
  employeeExternalId: string
  employeeName: string
  startIndex: number
  endIndex: number
  lane: number
}

const { state, actions } = useTimelinePlanner()
const toast = useToast()

const managerId = state.managerId
const year = state.year
const managers = state.managers
const employees = state.employees
const projects = state.projects
const charges = state.charges
const timelines = state.timelines

const timelinesLoading = state.timelinesLoading
const managersLoading = state.managersLoading

const managersError = state.managersError
const employeesError = state.employeesError
const projectsError = state.projectsError
const chargesError = state.chargesError
const timelinesError = state.timelinesError

const isBootstrapped = ref(false)
const deleteSubmittingId = ref("")
const resizeSavingTimelineId = ref("")
const resizeSuccessTimelineId = ref("")
const resizeErrorTimelineId = ref("")
const resizeErrorToastId = ref<string | number | null>(null)
const optimisticTimelineDaysById = ref<Record<string, string[]>>({})

function parseIsoDate(isoDate: string): Date | null {
  if (!isoDate) {
    return null
  }

  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function formatIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getDaysInRange(fromDate: string, toDate: string): string[] {
  const start = parseIsoDate(fromDate)
  const end = parseIsoDate(toDate)
  if (!start || !end || start > end) {
    return []
  }

  const result: string[] = []
  const cursor = new Date(start)

  while (cursor <= end) {
    result.push(formatIsoDateUtc(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return result
}

function getYearRange(currentYear: number): { from: string; to: string } {
  return {
    from: `${currentYear}-01-01`,
    to: `${currentYear}-12-31`,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Не удалось сохранить изменения timeline."
}

function sortIsoDays(days: string[]): string[] {
  return [...days].sort((left, right) => left.localeCompare(right))
}

function getTimelineLayouts(
  items: TimelineItemDto[],
  dayToIndex: Map<string, number>,
  employeeNameById: Map<string, string>,
): { blocks: TimelineBlockLayout[]; lanesCount: number } {
  const normalized = items
    .map((timeline) => {
      const indexes = timeline.days
        .map((day) => dayToIndex.get(day))
        .filter((value): value is number => value !== undefined)

      if (indexes.length === 0) {
        return null
      }

      return {
        id: timeline.id,
        employeeExternalId: timeline.employeeExternalId,
        employeeName: employeeNameById.get(timeline.employeeExternalId) ?? timeline.employeeExternalId,
        startIndex: Math.min(...indexes),
        endIndex: Math.max(...indexes),
      }
    })
    .filter((item): item is Omit<TimelineBlockLayout, "lane"> => item !== null)
    .sort((left, right) => {
      if (left.startIndex === right.startIndex) {
        return left.endIndex - right.endIndex
      }

      return left.startIndex - right.startIndex
    })

  const laneEnds: number[] = []
  const blocks: TimelineBlockLayout[] = []

  for (const block of normalized) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < block.startIndex)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(block.endIndex)
    } else {
      laneEnds[lane] = block.endIndex
    }

    blocks.push({
      ...block,
      lane,
    })
  }

  return {
    blocks,
    lanesCount: Math.max(laneEnds.length, 1),
  }
}

const managerOptions = computed(() =>
  managers.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
)

const dayList = computed(() => {
  const range = getYearRange(year.value)
  return getDaysInRange(range.from, range.to)
})
const dayToIndex = computed(() => new Map(dayList.value.map((day, index) => [day, index])))

const projectNameById = computed(() => {
  const result = new Map<string, string>()
  for (const project of projects.value) {
    result.set(project.id, project.name)
  }
  return result
})

const chargeNameById = computed(() => {
  const result = new Map<string, string>()
  for (const charge of charges.value) {
    result.set(charge.id, charge.name)
  }
  return result
})

const employeeNameById = computed(() => {
  const result = new Map<string, string>()
  for (const employee of employees.value) {
    result.set(employee.id, employee.name)
  }
  return result
})

const timelinesForView = computed<TimelineItemDto[]>(() =>
  timelines.value.map((timeline) => {
    const optimisticDays = optimisticTimelineDaysById.value[timeline.id]
    if (!optimisticDays) {
      return timeline
    }

    return {
      ...timeline,
      days: [...optimisticDays],
    }
  }),
)

const timelineById = computed(() => {
  const result = new Map<string, TimelineItemDto>()
  for (const timeline of timelinesForView.value) {
    result.set(timeline.id, timeline)
  }
  return result
})

const timelineRows = computed<TimelineGridRowModel[]>(() => {
  if (!managerId.value) {
    return []
  }

  const timelinesByKey = new Map<string, TimelineItemDto[]>()
  for (const timeline of timelinesForView.value) {
    const key = `${timeline.projectExternalId}::${timeline.chargeExternalId}`
    const bucket = timelinesByKey.get(key) ?? []
    bucket.push(timeline)
    timelinesByKey.set(key, bucket)
  }

  const rows: TimelineGridRowModel[] = []
  for (const charge of charges.value) {
    const projectExternalId = charge.projectId
    const chargeExternalId = charge.id
    const key = `${projectExternalId}::${chargeExternalId}`
    const projectName = projectNameById.value.get(projectExternalId) ?? projectExternalId
    const chargeName = chargeNameById.value.get(chargeExternalId) ?? chargeExternalId
    const rowTimelines = timelinesByKey.get(key) ?? []
    const { blocks, lanesCount } = getTimelineLayouts(
      rowTimelines,
      dayToIndex.value,
      employeeNameById.value,
    )

    rows.push({
      id: key,
      projectExternalId,
      chargeExternalId,
      projectName,
      chargeName,
      label: `${projectName} / ${chargeName}`,
      lanesCount,
      blocks,
    })
  }

  rows.sort((left, right) => {
    if (left.projectName === right.projectName) {
      return left.chargeName.localeCompare(right.chargeName)
    }

    return left.projectName.localeCompare(right.projectName)
  })
  return rows
})

async function handleCreateFromTimelineView(payload: TimelineCreatePayloadModel): Promise<void> {
  if (!managerId.value) {
    toast.add({
      title: "Select manager first",
      color: "error",
      duration: 2200,
    })
    return
  }

  const startDay = payload.startDay ?? payload.day
  const endDay = payload.endDay ?? payload.day
  const days = getDaysInRange(startDay, endDay)
  if (days.length === 0) {
    toast.add({
      title: "Invalid date range",
      color: "error",
      duration: 2200,
    })
    return
  }

  const employeeExternalId = payload.employeeExternalId?.trim() ?? ""
  if (!employeeExternalId) {
    toast.add({
      title: "Employee is required",
      color: "error",
      duration: 2200,
    })
    return
  }

  const request: CreateTimelineRequest = {
    projectExternalId: payload.row.projectExternalId,
    chargeExternalId: payload.row.chargeExternalId,
    managerExternalId: managerId.value,
    employeeExternalId,
    days,
    comment: payload.comment?.trim() || undefined,
  }

  try {
    await actions.createTimeline(request)
  } catch (error) {
    toast.add({
      title: "Failed to create timeline",
      description: getErrorMessage(error),
      color: "error",
      duration: 2600,
    })
  }
}

async function handleUpdateFromTimelineView(payload: TimelineUpdatePayloadModel): Promise<void> {
  const timeline = timelineById.value.get(payload.timelineId)
  if (!timeline) {
    return
  }

  const days = getDaysInRange(payload.startDay, payload.endDay)
  if (days.length === 0) {
    toast.add({
      title: "Invalid date range",
      color: "error",
      duration: 2200,
    })
    return
  }

  const employeeExternalId = payload.employeeExternalId.trim()
  if (!employeeExternalId) {
    toast.add({
      title: "Employee is required",
      color: "error",
      duration: 2200,
    })
    return
  }

  const request: UpdateTimelineRequest = {}
  const currentDays = sortIsoDays(timeline.days)
  if (days.join("|") !== currentDays.join("|")) {
    request.days = days
  }

  if (employeeExternalId !== timeline.employeeExternalId) {
    request.employeeExternalId = employeeExternalId
  }

  if (payload.projectExternalId !== timeline.projectExternalId) {
    request.projectExternalId = payload.projectExternalId
  }

  if (payload.chargeExternalId !== timeline.chargeExternalId) {
    request.chargeExternalId = payload.chargeExternalId
  }

  const nextComment = payload.comment.trim()
  if (nextComment) {
    request.comment = nextComment
  }

  if (Object.keys(request).length === 0) {
    return
  }

  try {
    await actions.updateTimeline(payload.timelineId, request)
  } catch (error) {
    toast.add({
      title: "Failed to update timeline",
      description: getErrorMessage(error),
      color: "error",
      duration: 2600,
    })
  }
}
async function deleteTimeline(id: string): Promise<void> {
  if (!id || deleteSubmittingId.value) {
    return
  }

  if (import.meta.client && !window.confirm("Удалить timeline?")) {
    return
  }

  deleteSubmittingId.value = id
  try {
    await actions.deleteTimeline(id)
  } finally {
    deleteSubmittingId.value = ""
  }
}

async function resizeTimeline(payload: { timelineId: string; days: string[] }): Promise<void> {
  if (!payload.timelineId || payload.days.length === 0) {
    return
  }

  const timelineBeforeSave = timelineById.value.get(payload.timelineId)
  const rollbackDays = timelineBeforeSave ? [...timelineBeforeSave.days] : []
  optimisticTimelineDaysById.value = {
    ...optimisticTimelineDaysById.value,
    [payload.timelineId]: [...payload.days],
  }

  resizeSavingTimelineId.value = payload.timelineId
  resizeErrorTimelineId.value = ""
  resizeSuccessTimelineId.value = ""

  try {
    await actions.updateTimeline(payload.timelineId, { days: payload.days })
    resizeSuccessTimelineId.value = payload.timelineId
    if (resizeErrorToastId.value !== null) {
      toast.remove(resizeErrorToastId.value)
      resizeErrorToastId.value = null
    }
    toast.add({
      title: "Timeline обновлен",
      description: "Изменения сохранены.",
      color: "success",
      duration: 1600,
    })
    setTimeout(() => {
      if (resizeSuccessTimelineId.value === payload.timelineId) {
        resizeSuccessTimelineId.value = ""
      }
    }, 700)

    const { [payload.timelineId]: _removed, ...rest } = optimisticTimelineDaysById.value
    optimisticTimelineDaysById.value = rest
  } catch (error) {
    if (rollbackDays.length > 0) {
      optimisticTimelineDaysById.value = {
        ...optimisticTimelineDaysById.value,
        [payload.timelineId]: rollbackDays,
      }
    }

    const reason = getErrorMessage(error)
    resizeErrorTimelineId.value = payload.timelineId
    setTimeout(() => {
      if (resizeErrorTimelineId.value === payload.timelineId) {
        resizeErrorTimelineId.value = ""
      }
    }, 700)

    if (resizeErrorToastId.value !== null) {
      toast.remove(resizeErrorToastId.value)
    }

    const nextToast = toast.add({
      title: "Ошибка сохранения timeline",
      description: reason,
      color: "error",
      duration: 0,
      actions: [
        {
          label: "Повторить",
          color: "error",
          variant: "soft",
          onClick: () => {
            if (resizeErrorToastId.value !== null) {
              toast.remove(resizeErrorToastId.value)
              resizeErrorToastId.value = null
            }
            void resizeTimeline(payload)
          },
        },
      ],
    })
    resizeErrorToastId.value = nextToast.id

    console.error("Failed to resize timeline:", error)
    try {
      await actions.loadTimeline()
    } finally {
      const { [payload.timelineId]: _removed, ...rest } = optimisticTimelineDaysById.value
      optimisticTimelineDaysById.value = rest
    }
  } finally {
    if (resizeSavingTimelineId.value === payload.timelineId) {
      resizeSavingTimelineId.value = ""
    }
  }
}

watch(
  () => managerId.value,
  async (nextManagerId, previousManagerId) => {
    if (!isBootstrapped.value || nextManagerId === previousManagerId) {
      return
    }

    await actions.loadEmployeesByManager(nextManagerId)
    await actions.loadTimeline()
  },
)

watch(
  () => year.value,
  async (nextYear, previousYear) => {
    if (!isBootstrapped.value || nextYear === previousYear || !managerId.value) {
      return
    }

    await actions.loadTimeline()
  },
)

onMounted(async () => {
  await actions.loadInitial()
  isBootstrapped.value = true
})
</script>

<template>
  <div class="min-h-screen w-full space-y-4 px-3 py-4 md:px-5 lg:px-6">
    <UCard>
      <template #header>
        <h1 class="text-xl font-semibold">Timeline Planner</h1>
      </template>

      <div class="rounded-lg border border-default p-3">
        <div class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
          Input data
        </div>
        <div class="grid gap-4 md:grid-cols-[2fr_auto] md:items-end">
          <UFormField label="Manager" class="w-full">
            <USelect
              v-model="managerId"
              :items="managerOptions"
              value-key="value"
              label-key="label"
              :loading="managersLoading"
              placeholder="Select manager"
              class="w-full"
            />
          </UFormField>

          <div class="flex items-end md:justify-self-start">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="timelinesLoading"
              @click="actions.loadTimeline()"
            >
              Refresh timeline
            </UButton>
          </div>
        </div>
      </div>

      <MyTestTimelineView
        class="mt-4"
        :days="dayList"
        :rows="timelineRows"
        :employees="employees"
        :year-range-start="2000"
        :year-range-end="2030"
        :saving-timeline-id="resizeSavingTimelineId"
        :success-timeline-id="resizeSuccessTimelineId"
        :error-timeline-id="resizeErrorTimelineId"
        @create="handleCreateFromTimelineView"
        @update="handleUpdateFromTimelineView"
        @delete="deleteTimeline"
        @resize="resizeTimeline"
      />
    </UCard>

    <UAlert
      v-if="managersError || employeesError || projectsError || chargesError || timelinesError"
      color="error"
      variant="soft"
      title="Ошибка загрузки данных"
      :description="
        timelinesError || managersError || employeesError || projectsError || chargesError || 'Unknown error'
      "
    />

  </div>
</template>

