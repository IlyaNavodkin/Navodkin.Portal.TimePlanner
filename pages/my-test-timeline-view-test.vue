<script setup lang="ts">
import { computed, ref } from "vue"
import { addIsoDays } from "~/composables/my-test-timeline/useMyTimelineDate"
import type {
  TimelineCreatePayloadModel,
  TimelineGridBlockModel,
  TimelineGridRowModel,
  TimelineUpdatePayloadModel,
} from "~/composables/my-test-timeline/types"

function buildDays(startDay: string, count: number): string[] {
  const result: string[] = []
  for (let index = 0; index < count; index += 1) {
    result.push(addIsoDays(startDay, index))
  }
  return result
}

const days = ref(buildDays("2026-01-01", 730))
const dayToIndex = computed(() => new Map(days.value.map((day, index) => [day, index])))

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
      { id: "tl-1", employeeName: "Alice", startIndex: 8, endIndex: 26, lane: 0 },
      { id: "tl-2", employeeName: "Bob", startIndex: 20, endIndex: 44, lane: 1 },
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
      { id: "tl-3", employeeName: "Carol", startIndex: 52, endIndex: 83, lane: 0 },
      { id: "tl-4", employeeName: "David", startIndex: 76, endIndex: 112, lane: 1 },
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
    blocks: [{ id: "tl-5", employeeName: "Elena", startIndex: 140, endIndex: 168, lane: 0 }],
  },
  {
    id: "p3::c4",
    projectExternalId: "p3",
    chargeExternalId: "c4",
    projectName: "Orion",
    chargeName: "DevOps",
    label: "Orion / DevOps",
    lanesCount: 1,
    blocks: [{ id: "tl-6", employeeName: "Frank", startIndex: 210, endIndex: 248, lane: 0 }],
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

function handleCreate(payload: TimelineCreatePayloadModel): void {
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
  row.blocks.push({
    id: `tl-${nextTimelineSequence}`,
    employeeName: payload.employeeName?.trim() || `Auto ${nextTimelineSequence}`,
    comment: payload.comment?.trim() || "",
    startIndex: dayIndex,
    endIndex,
    lane,
  })
  nextTimelineSequence += 1
  recomputeLanesCount(row)
  pushLog(`create: row=${row.chargeName}, ${startDay}..${days.value[endIndex]}`)
}

function handleUpdate(payload: TimelineUpdatePayloadModel): void {
  const target = findRowAndBlock(payload.timelineId)
  if (!target) {
    return
  }

  const startIndex = dayToIndex.value.get(payload.startDay)
  const endIndex = dayToIndex.value.get(payload.endDay)
  if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
    return
  }

  target.block.employeeName = payload.employeeName
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
          <h1 class="text-xl font-semibold">MyTestTimelineView Test Page</h1>
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
