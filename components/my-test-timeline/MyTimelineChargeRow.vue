<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import MyTimelineBar from "~/components/my-test-timeline/MyTimelineBar.vue"
import type {
  TimelineBarCommitModel,
  TimelineCreatePayloadModel,
  TimelineGridRowModel,
} from "~/composables/my-test-timeline/types"

const props = defineProps<{
  row: TimelineGridRowModel
  days: string[]
  viewStartIndex: number
  viewEndIndex: number
  pxPerDay: number
  labelColumnWidth: number
  laneHeight: number
  selectedTimelineId: string
  savingTimelineId: string
  successTimelineId: string
  errorTimelineId: string
  createArmed?: boolean
  mode?: "full" | "label" | "track"
}>()

const emit = defineEmits<{
  create: [payload: TimelineCreatePayloadModel]
  resize: [payload: TimelineBarCommitModel]
  edit: [timelineId: string]
  delete: [timelineId: string]
  select: [timelineId: string]
  "arm-create": [rowId: string]
}>()

const trackRef = ref<HTMLElement | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{
  x: number
  y: number
  timelineId: string
} | null>(null)
const todayIso = new Date().toISOString().slice(0, 10)

const rowHeightPx = computed(() => props.laneHeight)
const trackWidthPx = computed(() => Math.max(1, (props.viewEndIndex - props.viewStartIndex + 1) * props.pxPerDay))
const visibleDayIndexes = computed(() => {
  const result: number[] = []
  for (let index = props.viewStartIndex; index <= props.viewEndIndex; index += 1) {
    result.push(index)
  }
  return result
})
const monthBoundaryIndexes = computed(() => {
  const result: number[] = []

  for (const dayIndex of visibleDayIndexes.value) {
    if (dayIndex <= props.viewStartIndex) {
      continue
    }

    const currentDay = props.days[dayIndex]
    const previousDay = props.days[dayIndex - 1]
    if (!currentDay || !previousDay) {
      continue
    }

    if (currentDay.slice(0, 7) !== previousDay.slice(0, 7)) {
      result.push(dayIndex)
    }
  }

  return result
})
const occupiedDayIndexes = computed(() => {
  const occupied = new Set<number>()
  const fromIndex = props.viewStartIndex
  const toIndex = props.viewEndIndex

  for (const block of props.row.blocks) {
    const start = Math.max(fromIndex, block.startIndex)
    const end = Math.min(toIndex, block.endIndex)
    if (start > end) {
      continue
    }

    for (let index = start; index <= end; index += 1) {
      occupied.add(index)
    }
  }

  return occupied
})
const todayDayIndex = computed(() => props.days.findIndex((day) => day === todayIso))
const showTodayHighlight = computed(() =>
  todayDayIndex.value >= props.viewStartIndex && todayDayIndex.value <= props.viewEndIndex,
)
const todayHighlightStyle = computed(() => {
  if (!showTodayHighlight.value) {
    return {}
  }

  return {
    left: `${(todayDayIndex.value - props.viewStartIndex) * props.pxPerDay}px`,
    width: `${props.pxPerDay}px`,
  }
})

const gridBackgroundStyle = computed(() => ({
  width: `${trackWidthPx.value}px`,
  height: `${rowHeightPx.value}px`,
  backgroundImage: [
    `linear-gradient(to right, color-mix(in srgb, var(--ui-border-muted) 80%, transparent) 1px, transparent 1px)`,
    `linear-gradient(to bottom, color-mix(in srgb, var(--ui-border-muted) 80%, transparent) 1px, transparent 1px)`,
  ].join(","),
  backgroundSize: `${props.pxPerDay}px ${props.laneHeight}px`,
}))

function isDayOccupied(dayIndex: number): boolean {
  return occupiedDayIndexes.value.has(dayIndex)
}

function onCreateFromDay(dayIndex: number): void {
  const day = props.days[dayIndex]
  if (!day) {
    return
  }

  emit("create", {
    row: props.row,
    day,
  })
}

function getTopByLane(_lane: number): number {
  return 6
}

function onTrackBackgroundClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) {
    emit("select", "")
    return
  }

  if (target.closest(".my-timeline-bar")) {
    return
  }

  emit("select", "")
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function openContextMenu(payload: { x: number; y: number; timelineId: string }): void {
  contextMenu.value = payload
}

function handleEditFromContextMenu(): void {
  if (!contextMenu.value) {
    return
  }

  emit("edit", contextMenu.value.timelineId)
  closeContextMenu()
}

function handleDeleteFromContextMenu(): void {
  if (!contextMenu.value) {
    return
  }

  emit("delete", contextMenu.value.timelineId)
  closeContextMenu()
}

function handleGlobalPointerDown(event: PointerEvent): void {
  if (!contextMenu.value) {
    return
  }

  const target = event.target
  if (target instanceof Node && contextMenuRef.value?.contains(target)) {
    return
  }

  closeContextMenu()
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closeContextMenu()
  }
}

onMounted(() => {
  if (!import.meta.client) {
    return
  }

  window.addEventListener("pointerdown", handleGlobalPointerDown)
  window.addEventListener("resize", closeContextMenu)
  window.addEventListener("scroll", closeContextMenu, true)
  window.addEventListener("keydown", handleGlobalKeyDown)
})

onBeforeUnmount(() => {
  if (!import.meta.client) {
    return
  }

  window.removeEventListener("pointerdown", handleGlobalPointerDown)
  window.removeEventListener("resize", closeContextMenu)
  window.removeEventListener("scroll", closeContextMenu, true)
  window.removeEventListener("keydown", handleGlobalKeyDown)
})
</script>

<template>
  <div
    v-if="mode === 'label'"
    class="my-timeline-charge-row__label"
    :class="{ 'my-timeline-charge-row__label--create-armed': createArmed }"
    :style="{ width: `${labelColumnWidth}px`, height: `${rowHeightPx}px` }"
    @dblclick="emit('arm-create', row.id)"
  >
    <div class="my-timeline-charge-row__charge">{{ row.chargeName }}</div>
  </div>

  <div
    v-if="mode === 'track'"
    class="my-timeline-charge-row__track-wrap"
    :class="{ 'my-timeline-charge-row__track-wrap--create-armed': createArmed }"
    :style="{ height: `${rowHeightPx}px` }"
    @dblclick="emit('arm-create', row.id)"
  >
    <div
      ref="trackRef"
      class="my-timeline-charge-row__track"
      data-track-area="true"
      :style="{ width: `${trackWidthPx}px`, height: `${rowHeightPx}px` }"
      @click="onTrackBackgroundClick"
    >
      <div
        v-if="showTodayHighlight"
        class="my-timeline-charge-row__today-highlight"
        :style="todayHighlightStyle"
      />
      <div class="my-timeline-charge-row__grid-bg" :style="gridBackgroundStyle" />
      <div class="my-timeline-charge-row__month-boundaries">
        <div
          v-for="dayIndex in monthBoundaryIndexes"
          :key="`month-track-${row.id}-${dayIndex}`"
          class="my-timeline-charge-row__month-boundary"
          :style="{ left: `${(dayIndex - viewStartIndex) * pxPerDay}px` }"
        />
      </div>
      <div v-if="createArmed" class="my-timeline-charge-row__create-layer">
        <div
          v-for="dayIndex in visibleDayIndexes"
          :key="`create-track-${row.id}-${dayIndex}`"
          class="my-timeline-charge-row__create-cell"
          :class="{ 'my-timeline-charge-row__create-cell--armed': createArmed }"
          :style="{ width: `${pxPerDay}px` }"
        >
          <button
            v-if="!isDayOccupied(dayIndex)"
            type="button"
            class="my-timeline-charge-row__create-button"
            aria-label="Create timeline"
            @click.stop="onCreateFromDay(dayIndex)"
          >
            <UIcon name="i-lucide-plus" class="size-3" />
          </button>
        </div>
      </div>

      <MyTimelineBar
        v-for="block in row.blocks"
        :key="block.id"
        :block="block"
        :project-key="row.projectExternalId"
        :charge-key="row.chargeExternalId"
        :view-start-index="viewStartIndex"
        :view-end-index="viewEndIndex"
        :days-length="days.length"
        :px-per-day="pxPerDay"
        :top-px="getTopByLane(block.lane)"
        :height-px="Math.max(24, laneHeight - 12)"
        :selected="selectedTimelineId === block.id"
        :saving="savingTimelineId === block.id"
        :success="successTimelineId === block.id"
        :error="errorTimelineId === block.id"
        @commit="emit('resize', $event)"
        @select="emit('select', $event)"
        @contextmenu="openContextMenu"
      />
    </div>
  </div>

  <div
    v-if="!mode || mode === 'full'"
    class="my-timeline-charge-row"
    :style="{ gridTemplateColumns: `${labelColumnWidth}px 1fr` }"
  >
    <div class="my-timeline-charge-row__label" :class="{ 'my-timeline-charge-row__label--create-armed': createArmed }" @dblclick="emit('arm-create', row.id)">
      <div class="my-timeline-charge-row__charge">{{ row.chargeName }}</div>
    </div>

    <div class="my-timeline-charge-row__track-wrap" :class="{ 'my-timeline-charge-row__track-wrap--create-armed': createArmed }" @dblclick="emit('arm-create', row.id)">
      <div
        ref="trackRef"
        class="my-timeline-charge-row__track"
        data-track-area="true"
        :style="{ width: `${trackWidthPx}px`, height: `${rowHeightPx}px` }"
        @click="onTrackBackgroundClick"
      >
        <div
          v-if="showTodayHighlight"
          class="my-timeline-charge-row__today-highlight"
          :style="todayHighlightStyle"
        />
        <div class="my-timeline-charge-row__grid-bg" :style="gridBackgroundStyle" />
        <div class="my-timeline-charge-row__month-boundaries">
          <div
            v-for="dayIndex in monthBoundaryIndexes"
            :key="`month-full-${row.id}-${dayIndex}`"
            class="my-timeline-charge-row__month-boundary"
            :style="{ left: `${(dayIndex - viewStartIndex) * pxPerDay}px` }"
          />
        </div>
        <div v-if="createArmed" class="my-timeline-charge-row__create-layer">
          <div
            v-for="dayIndex in visibleDayIndexes"
            :key="`create-full-${row.id}-${dayIndex}`"
            class="my-timeline-charge-row__create-cell"
            :class="{ 'my-timeline-charge-row__create-cell--armed': createArmed }"
            :style="{ width: `${pxPerDay}px` }"
          >
            <button
              v-if="!isDayOccupied(dayIndex)"
              type="button"
              class="my-timeline-charge-row__create-button"
              aria-label="Create timeline"
              @click.stop="onCreateFromDay(dayIndex)"
            >
              <UIcon name="i-lucide-plus" class="size-3" />
            </button>
          </div>
        </div>

        <MyTimelineBar
          v-for="block in row.blocks"
          :key="block.id"
          :block="block"
          :project-key="row.projectExternalId"
          :charge-key="row.chargeExternalId"
          :view-start-index="viewStartIndex"
          :view-end-index="viewEndIndex"
          :days-length="days.length"
          :px-per-day="pxPerDay"
          :top-px="getTopByLane(block.lane)"
          :height-px="Math.max(24, laneHeight - 12)"
          :selected="selectedTimelineId === block.id"
          :saving="savingTimelineId === block.id"
          :success="successTimelineId === block.id"
          :error="errorTimelineId === block.id"
          @commit="emit('resize', $event)"
          @select="emit('select', $event)"
          @contextmenu="openContextMenu"
        />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="contextMenu"
      ref="contextMenuRef"
      class="fixed z-[120] min-w-[180px] rounded-md border border-default bg-default p-1 shadow-lg"
      :style="{
        left: `${contextMenu.x}px`,
        top: `${contextMenu.y}px`,
      }"
      @contextmenu.prevent
      @pointerdown.stop
    >
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-highlighted hover:bg-elevated"
        @click.stop="handleEditFromContextMenu"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
        <span>Edit</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error hover:bg-elevated"
        @click.stop="handleDeleteFromContextMenu"
      >
        <UIcon name="i-lucide-trash-2" class="size-4" />
        <span>Delete</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.my-timeline-charge-row {
  display: grid;
}

.my-timeline-charge-row__label {
  border-bottom: 1px solid var(--ui-border);
  border-right: 1px solid var(--ui-border);
  background: var(--ui-bg);
  padding: 6px 10px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.my-timeline-charge-row__charge {
  color: var(--ui-text-highlighted);
  font-size: 13px;
  font-weight: 600;
}


.my-timeline-charge-row__track-wrap {
  overflow-x: hidden;
  overflow-y: hidden;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
  box-sizing: border-box;
}

.my-timeline-charge-row__track {
  position: relative;
  background: var(--ui-bg);
}

.my-timeline-charge-row__label--create-armed {
  background: color-mix(in srgb, var(--ui-primary) 8%, var(--ui-bg));
}

.my-timeline-charge-row__track-wrap--create-armed {
  background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg));
}

.my-timeline-charge-row__grid-bg {
  position: absolute;
  inset: 0;
}

.my-timeline-charge-row__today-highlight {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--ui-primary) 14%, transparent);
  pointer-events: none;
}

.my-timeline-charge-row__month-boundaries {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.my-timeline-charge-row__month-boundary {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px solid var(--ui-border-muted);
}

.my-timeline-charge-row__create-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
}

.my-timeline-charge-row__create-cell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.my-timeline-charge-row__create-cell--armed {
  background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-primary) 22%, transparent);
}

.my-timeline-charge-row__create-button {
  width: 18px;
  height: 18px;
  border: 1px solid var(--ui-border-accented);
  border-radius: 999px;
  background: color-mix(in srgb, var(--ui-bg) 82%, transparent);
  color: var(--ui-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.my-timeline-charge-row__create-cell:hover .my-timeline-charge-row__create-button,
.my-timeline-charge-row__create-button:focus-visible {
  opacity: 1;
  pointer-events: auto;
}
</style>

