<script setup lang="ts">
import { computed, ref } from "vue"

interface TimelineGridBlockModel {
  id: string
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

function buildDays(start: string, count: number): string[] {
  const result: string[] = []
  for (let index = 0; index < count; index += 1) {
    result.push(addIsoDays(start, index))
  }
  return result
}

const days = ref(buildDays("2026-01-01", 365))
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
      { id: "tl-1", employeeName: "Alice", startIndex: 10, endIndex: 28, lane: 0 },
      { id: "tl-2", employeeName: "Bob", startIndex: 20, endIndex: 42, lane: 1 },
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
      { id: "tl-3", employeeName: "Carol", startIndex: 60, endIndex: 90, lane: 0 },
      { id: "tl-4", employeeName: "David", startIndex: 78, endIndex: 110, lane: 1 },
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
    blocks: [{ id: "tl-5", employeeName: "Elena", startIndex: 145, endIndex: 165, lane: 0 }],
  },
])

const savingTimelineId = ref("")
const successTimelineId = ref("")
const errorTimelineId = ref("")
const forceResizeError = ref(false)
const eventLog = ref<string[]>([])
let nextTimelineSequence = 100

function pushLog(message: string): void {
  const timestamp = new Date().toLocaleTimeString("ru-RU")
  eventLog.value = [`[${timestamp}] ${message}`, ...eventLog.value].slice(0, 20)
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

function handleCreate(payload: { row: TimelineGridRowModel; day: string }): void {
  const row = rows.value.find((item) => item.id === payload.row.id)
  if (!row) {
    return
  }

  const dayIndex = dayToIndex.value.get(payload.day)
  if (dayIndex === undefined) {
    return
  }

  const endIndex = Math.min(dayIndex + 6, days.value.length - 1)
  const lane = findLaneForRange(row, dayIndex, endIndex)
  row.blocks.push({
    id: `tl-${nextTimelineSequence}`,
    employeeName: `Auto ${nextTimelineSequence}`,
    startIndex: dayIndex,
    endIndex,
    lane,
  })
  nextTimelineSequence += 1
  recomputeLanesCount(row)

  pushLog(`create: row=${row.chargeName}, day=${payload.day}`)
}

function handleEdit(timelineId: string): void {
  const target = findRowAndBlock(timelineId)
  if (!target) {
    return
  }

  target.block.employeeName = `${target.block.employeeName}*`
  pushLog(`edit: id=${timelineId}`)
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

  await new Promise((resolve) => {
    setTimeout(resolve, 280)
  })

  if (forceResizeError.value) {
    savingTimelineId.value = ""
    errorTimelineId.value = payload.timelineId
    pushLog(`resize-error: id=${payload.timelineId}`)
    setTimeout(() => {
      if (errorTimelineId.value === payload.timelineId) {
        errorTimelineId.value = ""
      }
    }, 700)
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
  }, 700)
}
</script>

<template>
  <div class="min-h-screen w-full space-y-4 px-3 py-4 md:px-5 lg:px-6">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-xl font-semibold">Timeline Grid Test</h1>
          <UBadge color="neutral" variant="soft">{{ rows.length }} rows / {{ days.length }} days</UBadge>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-3">
        <USwitch v-model="forceResizeError" />
        <span class="text-sm text-muted">Force resize error</span>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-eraser"
          @click="eventLog = []"
        >
          Clear log
        </UButton>
      </div>
    </UCard>

    <TimelineGridVis
      :days="days"
      :rows="rows"
      :saving-timeline-id="savingTimelineId"
      :success-timeline-id="successTimelineId"
      :error-timeline-id="errorTimelineId"
      @create="handleCreate"
      @edit="handleEdit"
      @delete="handleDelete"
      @resize="handleResize"
    />

    <UCard>
      <template #header>
        <h2 class="text-base font-semibold">Event log</h2>
      </template>

      <div v-if="eventLog.length === 0" class="text-sm text-muted">No events yet.</div>
      <div v-else class="space-y-2">
        <div v-for="item in eventLog" :key="item" class="rounded border border-default px-3 py-2 text-xs text-toned">
          {{ item }}
        </div>
      </div>
    </UCard>
  </div>
</template>
