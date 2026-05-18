<script setup lang="ts">
import { computed, ref } from "vue"

interface TimelineGridBlockModel {
  id: string
  employeeExternalId: string
  employeeName: string
  comment?: string
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

function toIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addIsoDays(isoDay: string, delta: number): string {
  const source = new Date(`${isoDay}T00:00:00Z`)
  source.setUTCDate(source.getUTCDate() + delta)
  return toIsoDateUtc(source)
}

function buildDaysForYearRange(startYear: number, endYear: number): string[] {
  const fromYear = Math.min(startYear, endYear)
  const toYear = Math.max(startYear, endYear)
  const startDay = `${fromYear}-01-01`
  const endDay = `${toYear}-12-31`
  const result: string[] = []
  let cursor = startDay

  while (cursor <= endDay) {
    result.push(cursor)
    cursor = addIsoDays(cursor, 1)
  }

  return result
}

const YEAR_RANGE_START = 1990
const YEAR_RANGE_END = 2030
const BASE_DAY = "2026-01-01"
const employees = ref([
  { id: "emp-1", name: "Alice" },
  { id: "emp-2", name: "Bob" },
  { id: "emp-3", name: "Carol" },
  { id: "emp-4", name: "David" },
  { id: "emp-5", name: "Elena" },
  { id: "emp-6", name: "Frank" },
])
const employeeNameById = computed(() => new Map(employees.value.map((item) => [item.id, item.name])))

const days = ref(buildDaysForYearRange(YEAR_RANGE_START, YEAR_RANGE_END))
const baseDayIndex = days.value.findIndex((day) => day === BASE_DAY)
const dayToIndex = computed(() => new Map(days.value.map((day, index) => [day, index])))

function fromBaseOffsets(
  id: string,
  employeeExternalId: string,
  employeeName: string,
  startOffset: number,
  endOffset: number,
  lane: number,
): TimelineGridBlockModel {
  const safeBaseDayIndex = baseDayIndex < 0 ? 0 : baseDayIndex
  return {
    id,
    employeeExternalId,
    employeeName,
    startIndex: safeBaseDayIndex + startOffset,
    endIndex: safeBaseDayIndex + endOffset,
    lane,
  }
}

const rows = ref<TimelineGridRowModel[]>([
  {
    id: "p1::c1",
    projectExternalId: "p1",
    chargeExternalId: "c1",
    projectName: "Apollo",
    chargeName: "Frontend",
    label: "Apollo / Frontend",
    lanesCount: 2,
    blocks: [
      fromBaseOffsets("tl-1", "emp-1", "Alice", 8, 26, 0),
      fromBaseOffsets("tl-2", "emp-2", "Bob", 20, 44, 1),
    ],
  },
  {
    id: "p1::c2",
    projectExternalId: "p1",
    chargeExternalId: "c2",
    projectName: "Apollo",
    chargeName: "Backend",
    label: "Apollo / Backend",
    lanesCount: 2,
    blocks: [
      fromBaseOffsets("tl-3", "emp-3", "Carol", 52, 83, 0),
      fromBaseOffsets("tl-4", "emp-4", "David", 76, 112, 1),
    ],
  },
  {
    id: "p2::c3",
    projectExternalId: "p2",
    chargeExternalId: "c3",
    projectName: "Mercury",
    chargeName: "QA",
    label: "Mercury / QA",
    lanesCount: 1,
    blocks: [fromBaseOffsets("tl-5", "emp-5", "Elena", 140, 168, 0)],
  },
  {
    id: "p3::c4",
    projectExternalId: "p3",
    chargeExternalId: "c4",
    projectName: "Orion",
    chargeName: "DevOps",
    label: "Orion / DevOps",
    lanesCount: 1,
    blocks: [fromBaseOffsets("tl-6", "emp-6", "Frank", 210, 248, 0)],
  },
])

const savingTimelineId = ref("")
const successTimelineId = ref("")
const errorTimelineId = ref("")
const forceResizeError = ref(false)
const eventLog = ref<string[]>([])
let nextTimelineSequence = 200

function pushLog(message: string): void {
  const timestamp = new Date().toLocaleTimeString("ru-RU")
  eventLog.value = [`[${timestamp}] ${message}`, ...eventLog.value].slice(0, 24)
}

function findRowAndBlock(timelineId: string): { row: TimelineGridRowModel; block: TimelineGridBlockModel } | null {
  for (const row of rows.value) {
    const block = row.blocks.find((item) => item.id === timelineId)
    if (!block) {
      continue
    }

    return { row, block }
  }

  return null
}

function recomputeLanesCount(row: TimelineGridRowModel): void {
  row.lanesCount = Math.max(1, ...row.blocks.map((block) => block.lane + 1))
}

function findLaneForRange(
  row: TimelineGridRowModel,
  startIndex: number,
  endIndex: number,
  ignoreTimelineId = "",
): number {
  const laneEndByIndex: number[] = []

  const sorted = [...row.blocks].sort((left, right) => {
    if (left.startIndex === right.startIndex) {
      return left.endIndex - right.endIndex
    }
    return left.startIndex - right.startIndex
  })

  for (const block of sorted) {
    if (ignoreTimelineId && block.id === ignoreTimelineId) {
      continue
    }

    const laneIndex = laneEndByIndex.findIndex((laneEnd) => laneEnd < block.startIndex)
    if (laneIndex === -1) {
      laneEndByIndex.push(block.endIndex)
      continue
    }

    laneEndByIndex[laneIndex] = block.endIndex
  }

  const targetLane = laneEndByIndex.findIndex((laneEnd) => laneEnd < startIndex)
  return targetLane === -1 ? laneEndByIndex.length : targetLane
}

function handleCreate(payload: {
  row: TimelineGridRowModel
  day: string
  startDay?: string
  endDay?: string
  employeeExternalId?: string
  comment?: string
}): void {
  const row = rows.value.find((item) => item.id === payload.row.id)
  if (!row) {
    return
  }

  const startDay = payload.startDay ?? payload.day
  const dayIndex = dayToIndex.value.get(startDay)
  if (dayIndex === undefined) {
    return
  }

  const requestedEndIndex = payload.endDay ? dayToIndex.value.get(payload.endDay) : undefined
  const endIndex = requestedEndIndex === undefined
    ? Math.min(dayIndex + 6, days.value.length - 1)
    : Math.max(dayIndex, requestedEndIndex)
  const lane = findLaneForRange(row, dayIndex, endIndex)
  const employeeExternalId = payload.employeeExternalId ?? "emp-1"
  row.blocks.push({
    id: `tl-${nextTimelineSequence}`,
    employeeExternalId,
    employeeName: employeeNameById.value.get(employeeExternalId) ?? `Auto ${nextTimelineSequence}`,
    comment: payload.comment?.trim() || "",
    startIndex: dayIndex,
    endIndex,
    lane,
  })
  nextTimelineSequence += 1
  recomputeLanesCount(row)
  pushLog(`create: row=${row.chargeName}, ${startDay}..${days.value[endIndex]}`)
}

function handleUpdate(payload: {
  timelineId: string
  employeeExternalId: string
  comment: string
  startDay: string
  endDay: string
}): void {
  const target = findRowAndBlock(payload.timelineId)
  if (!target) {
    return
  }

  const startIndex = dayToIndex.value.get(payload.startDay)
  const endIndex = dayToIndex.value.get(payload.endDay)
  if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
    return
  }

  target.block.employeeExternalId = payload.employeeExternalId
  target.block.employeeName = employeeNameById.value.get(payload.employeeExternalId) ?? target.block.employeeName
  target.block.comment = payload.comment
  target.block.startIndex = startIndex
  target.block.endIndex = endIndex
  target.block.lane = findLaneForRange(target.row, startIndex, endIndex, payload.timelineId)
  recomputeLanesCount(target.row)
  pushLog(`update: id=${payload.timelineId}, ${payload.startDay}..${payload.endDay}`)
}

function handleDelete(timelineId: string): void {
  const target = findRowAndBlock(timelineId)
  if (!target) {
    return
  }

  target.row.blocks = target.row.blocks.filter((item) => item.id !== timelineId)
  recomputeLanesCount(target.row)
  pushLog(`delete: id=${timelineId}`)
}

async function handleResize(payload: { timelineId: string; days: string[] }): Promise<void> {
  if (payload.days.length === 0) {
    return
  }

  const target = findRowAndBlock(payload.timelineId)
  if (!target) {
    return
  }

  savingTimelineId.value = payload.timelineId
  successTimelineId.value = ""
  errorTimelineId.value = ""

  await new Promise((resolve) => setTimeout(resolve, 220))

  if (forceResizeError.value) {
    savingTimelineId.value = ""
    errorTimelineId.value = payload.timelineId
    pushLog(`resize-error: id=${payload.timelineId}`)
    setTimeout(() => {
      if (errorTimelineId.value === payload.timelineId) {
        errorTimelineId.value = ""
      }
    }, 650)
    return
  }

  const sorted = [...payload.days].sort((left, right) => left.localeCompare(right))
  const nextStart = dayToIndex.value.get(sorted[0])
  const nextEnd = dayToIndex.value.get(sorted[sorted.length - 1])
  if (nextStart === undefined || nextEnd === undefined) {
    savingTimelineId.value = ""
    return
  }

  target.block.startIndex = nextStart
  target.block.endIndex = nextEnd
  target.block.lane = findLaneForRange(target.row, nextStart, nextEnd, target.block.id)
  recomputeLanesCount(target.row)

  savingTimelineId.value = ""
  successTimelineId.value = payload.timelineId
  pushLog(`resize: id=${payload.timelineId}, ${sorted[0]}..${sorted[sorted.length - 1]}`)

  setTimeout(() => {
    if (successTimelineId.value === payload.timelineId) {
      successTimelineId.value = ""
    }
  }, 650)
}
</script>

<template>
  <div class="min-h-screen w-full space-y-4 px-3 py-4 md:px-5 lg:px-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-xl font-semibold">My Test Timeline Page</h1>
          <UBadge color="neutral" variant="soft">{{ rows.length }} rows / {{ days.length }} days</UBadge>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <USwitch v-model="forceResizeError" />
        <span class="text-sm text-muted">Force resize error</span>
        <UButton color="neutral" variant="soft" icon="i-lucide-eraser" @click="eventLog = []">
          Clear log
        </UButton>
      </div>
    </UCard>

    <MyTestTimelineView
      :days="days"
      :rows="rows"
      :employees="employees"
      :year-range-start="YEAR_RANGE_START"
      :year-range-end="YEAR_RANGE_END"
      :saving-timeline-id="savingTimelineId"
      :success-timeline-id="successTimelineId"
      :error-timeline-id="errorTimelineId"
      @create="handleCreate"
      @update="handleUpdate"
      @delete="handleDelete"
      @resize="handleResize"
    />

    <UCard>
      <template #header>
        <h2 class="text-base font-semibold">Event log</h2>
      </template>

      <div v-if="eventLog.length === 0" class="text-sm text-muted">No events yet.</div>
      <div v-else class="space-y-2">
        <div
          v-for="item in eventLog"
          :key="item"
          class="rounded border border-default px-3 py-2 text-xs text-toned"
        >
          {{ item }}
        </div>
      </div>
    </UCard>
  </div>
</template>
