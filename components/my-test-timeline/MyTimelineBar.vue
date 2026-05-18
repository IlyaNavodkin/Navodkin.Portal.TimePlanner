<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import { clampNumber } from "~/composables/my-test-timeline/useMyTimelineDate"
import type { TimelineBarCommitModel, TimelineGridBlockModel } from "~/composables/my-test-timeline/types"

type DragMode = "move" | "start" | "end"

interface DragState {
  mode: DragMode
  pointerId: number
  originClientX: number
  startIndex: number
  endIndex: number
}

const props = defineProps<{
  block: TimelineGridBlockModel
  projectKey: string
  chargeKey: string
  viewStartIndex: number
  viewEndIndex: number
  daysLength: number
  pxPerDay: number
  topPx: number
  heightPx: number
  selected: boolean
  saving: boolean
  success: boolean
  error: boolean
}>()

const emit = defineEmits<{
  select: [timelineId: string]
  contextmenu: [payload: { x: number; y: number; timelineId: string }]
  commit: [payload: TimelineBarCommitModel]
}>()

const dragState = ref<DragState | null>(null)
const transientStartIndex = ref<number | null>(null)
const transientEndIndex = ref<number | null>(null)

const currentStartIndex = computed(() => transientStartIndex.value ?? props.block.startIndex)
const currentEndIndex = computed(() => transientEndIndex.value ?? props.block.endIndex)

const visibleStart = computed(() => Math.max(currentStartIndex.value, props.viewStartIndex))
const visibleEnd = computed(() => Math.min(currentEndIndex.value, props.viewEndIndex))
const isVisible = computed(() => visibleStart.value <= visibleEnd.value)
const dragModeClass = computed(() => {
  if (!dragState.value) {
    return ""
  }

  if (dragState.value.mode === "move") {
    return "my-timeline-bar--dragging-move"
  }

  return "my-timeline-bar--dragging-resize"
})

const barStyle = computed(() => {
  if (!isVisible.value) {
    return {
      display: "none",
    }
  }

  const left = (visibleStart.value - props.viewStartIndex) * props.pxPerDay
  const right = (visibleEnd.value - props.viewStartIndex + 1) * props.pxPerDay
  const width = Math.max(8, right - left)

  return {
    left: `${left}px`,
    width: `${width}px`,
    top: `${props.topPx}px`,
    height: `${props.heightPx}px`,
  }
})

function startDrag(mode: DragMode, event: PointerEvent): void {
  dragState.value = {
    mode,
    pointerId: event.pointerId,
    originClientX: event.clientX,
    startIndex: props.block.startIndex,
    endIndex: props.block.endIndex,
  }

  transientStartIndex.value = props.block.startIndex
  transientEndIndex.value = props.block.endIndex
  emit("select", props.block.id)
  applyGlobalCursor(mode)

  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerCancel)
}

function applyGlobalCursor(mode: DragMode): void {
  if (!import.meta.client) {
    return
  }

  document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize"
}

function clearGlobalCursor(): void {
  if (!import.meta.client) {
    return
  }

  document.body.style.removeProperty("cursor")
}

function onBodyPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  startDrag("move", event)
}

function onHandleStartPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  startDrag("start", event)
}

function onHandleEndPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  startDrag("end", event)
}

function onPointerMove(event: PointerEvent): void {
  const activeDrag = dragState.value
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) {
    return
  }

  const deltaDays = Math.round((event.clientX - activeDrag.originClientX) / Math.max(props.pxPerDay, 1))
  let nextStart = activeDrag.startIndex
  let nextEnd = activeDrag.endIndex

  if (activeDrag.mode === "move") {
    nextStart += deltaDays
    nextEnd += deltaDays

    if (nextStart < 0) {
      nextEnd -= nextStart
      nextStart = 0
    }

    const maxEnd = props.daysLength - 1
    if (nextEnd > maxEnd) {
      const shiftLeft = nextEnd - maxEnd
      nextStart -= shiftLeft
      nextEnd -= shiftLeft
    }
  } else if (activeDrag.mode === "start") {
    nextStart = clampNumber(activeDrag.startIndex + deltaDays, 0, nextEnd)
  } else {
    nextEnd = clampNumber(activeDrag.endIndex + deltaDays, nextStart, props.daysLength - 1)
  }

  transientStartIndex.value = nextStart
  transientEndIndex.value = nextEnd
}

function clearDragListeners(): void {
  window.removeEventListener("pointermove", onPointerMove)
  window.removeEventListener("pointerup", onPointerUp)
  window.removeEventListener("pointercancel", onPointerCancel)
}

function finishDrag(pointerId: number): void {
  const activeDrag = dragState.value
  if (!activeDrag || pointerId !== activeDrag.pointerId) {
    return
  }

  const nextStart = transientStartIndex.value ?? props.block.startIndex
  const nextEnd = transientEndIndex.value ?? props.block.endIndex

  dragState.value = null
  transientStartIndex.value = null
  transientEndIndex.value = null
  clearDragListeners()
  clearGlobalCursor()

  if (nextStart === props.block.startIndex && nextEnd === props.block.endIndex) {
    return
  }

  emit("commit", {
    timelineId: props.block.id,
    startIndex: nextStart,
    endIndex: nextEnd,
  })
}

function onPointerUp(event: PointerEvent): void {
  finishDrag(event.pointerId)
}

function onPointerCancel(event: PointerEvent): void {
  finishDrag(event.pointerId)
}

function onContextMenu(event: MouseEvent): void {
  event.preventDefault()
  emit("select", props.block.id)
  emit("contextmenu", {
    x: event.clientX,
    y: event.clientY,
    timelineId: props.block.id,
  })
}

onBeforeUnmount(() => {
  clearDragListeners()
  clearGlobalCursor()
})
</script>

<template>
  <div
    class="my-timeline-bar"
    data-no-pan="true"
    :class="[
      dragModeClass,
      {
        'my-timeline-bar--selected': selected,
        'my-timeline-bar--saving': saving,
        'my-timeline-bar--success': success,
        'my-timeline-bar--error': error,
      },
    ]"
    :style="barStyle"
    @pointerdown.stop="onBodyPointerDown"
    @click.stop="emit('select', block.id)"
    @contextmenu.stop.prevent="onContextMenu"
  >
    <button
      type="button"
      class="my-timeline-bar__handle my-timeline-bar__handle--start"
      data-no-pan="true"
      @pointerdown.stop="onHandleStartPointerDown"
      aria-label="Resize start"
    />

    <span class="my-timeline-bar__label">{{ block.employeeName }}</span>

    <button
      type="button"
      class="my-timeline-bar__handle my-timeline-bar__handle--end"
      data-no-pan="true"
      @pointerdown.stop="onHandleEndPointerDown"
      aria-label="Resize end"
    />
  </div>
</template>

<style scoped>
.my-timeline-bar {
  position: absolute;
  z-index: 2;
  display: flex;
  min-width: 8px;
  align-items: center;
  border: 1px solid var(--color-slate-600);
  background: linear-gradient(120deg, var(--color-slate-700), var(--color-slate-800));
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(var(--color-shadow), 0.15);
  color: #f8fafc; /* slate-50 */
  overflow: hidden;
  user-select: none;
  cursor: pointer;
}

.my-timeline-bar--dragging-move {
  cursor: grabbing;
}

.my-timeline-bar--dragging-resize {
  cursor: ew-resize;
}

.my-timeline-bar--selected {
  z-index: 3;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-indigo-600) 36%, transparent);
}

.my-timeline-bar--saving {
  border-color: var(--color-amber-600);
  animation: my-timeline-bar-pulse 1.2s ease-in-out infinite;
}

.my-timeline-bar--success {
  border-color: var(--color-emerald-600);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-emerald-600) 38%, transparent);
}

.my-timeline-bar--error {
  border-color: var(--color-rose-600);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-rose-600) 38%, transparent);
}

.my-timeline-bar__handle {
  width: 8px;
  height: 100%;
  border: 0;
  background: color-mix(in srgb, var(--ui-bg) 15%, transparent);
  cursor: ew-resize;
  flex-shrink: 0;
}

.my-timeline-bar__handle:hover {
  background: color-mix(in srgb, var(--ui-bg-inverted) 14%, transparent);
}

.my-timeline-bar__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
}

@keyframes my-timeline-bar-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-amber-600) 42%, transparent);
  }
  100% {
    box-shadow: 0 0 0 8px transparent;
  }
}
</style>
