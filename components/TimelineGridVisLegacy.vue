<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { Timeline } from "vis-timeline/standalone"
import type { DataGroup, DataItem, TimelineOptions } from "vis-timeline"
import "vis-timeline/styles/vis-timeline-graph2d.min.css"

interface TimelineGridBlock {
  id: string
  employeeName: string
  startIndex: number
  endIndex: number
  lane: number
}

interface TimelineGridRow {
  id: string
  projectExternalId: string
  chargeExternalId: string
  projectName: string
  chargeName: string
  label: string
  lanesCount: number
  blocks: TimelineGridBlock[]
}

interface TimelineCreatePayload {
  row: TimelineGridRow
  day: string
}

type WindowPreset = "2w" | "1m" | "3m" | "year"
interface TimelineResizePayload {
  timelineId: string
  days: string[]
}

type DragState = "moving" | "resizing"

const props = withDefaults(
  defineProps<{
    days: string[]
    rows: TimelineGridRow[]
    savingTimelineId?: string
    successTimelineId?: string
    errorTimelineId?: string
  }>(),
  {
    savingTimelineId: "",
    successTimelineId: "",
    errorTimelineId: "",
  },
)

const emit = defineEmits<{
  create: [payload: TimelineCreatePayload]
  edit: [timelineId: string]
  delete: [timelineId: string]
  resize: [payload: TimelineResizePayload]
}>()

const timelineContainerRef = ref<HTMLElement | null>(null)
const timelineShellRef = ref<HTMLElement | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{ x: number; y: number; timelineId: string } | null>(null)

let timeline: Timeline | null = null
const rowByGroupId = new Map<string, TimelineGridRow>()
const itemRangeById = new Map<string, { startMs: number; endMs: number }>()
const dragStateById = new Map<string, DragState>()
const itemVisualClassById = new Map<string, string[]>()
const pendingDayRangeByTimelineId = new Map<string, string[]>()
const DAY_MS = 24 * 60 * 60 * 1000
const CHARGE_ROW_HEIGHT_PX = 50
const ROW_ITEM_VERTICAL_MARGIN_PX = 0
const ITEM_HEIGHT_PX = 50
let rangeInteractionTimer: ReturnType<typeof setTimeout> | null = null
let pendingRender = false
let pendingRenderReset = false
const activePreset = ref<WindowPreset>("1m")
const ALL_FILTER_VALUE = "__all"
const compactMode = ref(false)
const isInteracting = ref(false)
const selectedProjectId = ref(ALL_FILTER_VALUE)
const selectedChargeId = ref(ALL_FILTER_VALUE)
const collapsedProjectIds = ref<Set<string>>(new Set())
const toneClassNames = [
  "timeline-tone-0",
  "timeline-tone-1",
  "timeline-tone-2",
  "timeline-tone-3",
  "timeline-tone-4",
  "timeline-tone-5",
]

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function parseIsoDate(isoDate: string): Date {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  return new Date(year, month - 1, day)
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function getMidnightLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getTimelineBounds(): { min: Date; max: Date } | null {
  if (props.days.length === 0) {
    return null
  }

  const min = parseIsoDate(props.days[0])
  const max = addDays(parseIsoDate(props.days[props.days.length - 1]), 1)
  return { min, max }
}

function clampWindow(start: Date, end: Date, min: Date, max: Date): { start: Date; end: Date } {
  const width = Math.max(DAY_MS, end.getTime() - start.getTime())
  let nextStart = new Date(start)
  let nextEnd = new Date(end)

  if (nextStart < min) {
    nextStart = new Date(min)
    nextEnd = new Date(min.getTime() + width)
  }

  if (nextEnd > max) {
    nextEnd = new Date(max)
    nextStart = new Date(max.getTime() - width)
  }

  if (nextStart < min) {
    nextStart = new Date(min)
  }

  if (nextEnd > max) {
    nextEnd = new Date(max)
  }

  if (nextEnd.getTime() - nextStart.getTime() < DAY_MS) {
    nextEnd = new Date(nextStart.getTime() + DAY_MS)
    if (nextEnd > max) {
      nextEnd = new Date(max)
      nextStart = new Date(Math.max(min.getTime(), max.getTime() - DAY_MS))
    }
  }

  return { start: nextStart, end: nextEnd }
}

function getPresetWindow(
  preset: WindowPreset,
  bounds: { min: Date; max: Date },
): { start: Date; end: Date } {
  if (preset === "year") {
    return { start: bounds.min, end: bounds.max }
  }

  const spanDays = preset === "2w" ? 14 : preset === "3m" ? 92 : 31
  const today = getMidnightLocal(new Date())
  const half = Math.floor(spanDays / 2)
  const rawStart = addDays(today, -half)
  const rawEnd = addDays(rawStart, spanDays)
  return clampWindow(rawStart, rawEnd, bounds.min, bounds.max)
}

function applyPresetWindow(preset: WindowPreset): void {
  if (!timeline) {
    return
  }

  const bounds = getTimelineBounds()
  if (!bounds) {
    return
  }

  const windowRange = getPresetWindow(preset, bounds)
  timeline.setWindow(windowRange.start, windowRange.end, { animation: false })
}

function setPreset(preset: WindowPreset): void {
  activePreset.value = preset
  applyPresetWindow(preset)
}

function focusToday(): void {
  setPreset("1m")
}

function resetFilters(): void {
  selectedProjectId.value = ALL_FILTER_VALUE
  selectedChargeId.value = ALL_FILTER_VALUE
}

function getToneClass(id: string, prefix: "timeline-project-tone" | "timeline-charge-tone"): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(index)
    hash |= 0
  }

  const normalized = Math.abs(hash)
  return `${prefix}-${normalized % toneClassNames.length}`
}

function isProjectGroupId(groupId: unknown): groupId is string {
  return typeof groupId === "string" && groupId.startsWith("project::")
}

function toProjectExternalId(projectGroupId: string): string {
  return projectGroupId.slice("project::".length)
}

function toggleProjectByGroupId(projectGroupId: string): void {
  const projectExternalId = toProjectExternalId(projectGroupId)
  const next = new Set(collapsedProjectIds.value)
  if (next.has(projectExternalId)) {
    next.delete(projectExternalId)
  } else {
    next.add(projectExternalId)
  }
  collapsedProjectIds.value = next
  scheduleRender()
}

function groupRowsByProject(rows: TimelineGridRow[]): Array<{
  projectExternalId: string
  projectName: string
  rows: TimelineGridRow[]
}> {
  const grouped = new Map<string, { projectName: string; rows: TimelineGridRow[] }>()

  for (const row of rows) {
    const bucket = grouped.get(row.projectExternalId)
    if (bucket) {
      bucket.rows.push(row)
      continue
    }
    grouped.set(row.projectExternalId, {
      projectName: row.projectName,
      rows: [row],
    })
  }

  return [...grouped.entries()].map(([projectExternalId, value]) => ({
    projectExternalId,
    projectName: value.projectName,
    rows: value.rows,
  }))
}

function normalizeToDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

function buildDaysFromRange(startInput: unknown, endInput: unknown): string[] {
  const startDate = normalizeToDate(startInput)
  if (!startDate) {
    return []
  }

  const normalizedStart = getMidnightLocal(startDate)
  const endDateRaw = normalizeToDate(endInput)
  const normalizedEndExclusive = endDateRaw ? getMidnightLocal(endDateRaw) : addDays(normalizedStart, 1)
  const endExclusive =
    normalizedEndExclusive.getTime() <= normalizedStart.getTime()
      ? addDays(normalizedStart, 1)
      : normalizedEndExclusive

  const result: string[] = []
  const cursor = new Date(normalizedStart)
  while (cursor < endExclusive) {
    result.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return result
}

function snapToDayBoundary(dateInput: unknown): Date | null {
  const date = normalizeToDate(dateInput)
  if (!date) {
    return null
  }

  const startOfDay = getMidnightLocal(date)
  const nextDay = addDays(startOfDay, 1)
  const distanceToStart = Math.abs(date.getTime() - startOfDay.getTime())
  const distanceToNext = Math.abs(nextDay.getTime() - date.getTime())
  return distanceToNext < distanceToStart ? nextDay : startOfDay
}

function normalizeTimelineItemToDays(item: { start?: unknown; end?: unknown }): {
  start: Date
  end: Date
} | null {
  const start = snapToDayBoundary(item.start)
  if (!start) {
    return null
  }

  const snappedEnd = snapToDayBoundary(item.end)
  const end = snappedEnd && snappedEnd.getTime() > start.getTime() ? snappedEnd : addDays(start, 1)

  return { start, end }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function handleEditFromMenu(): void {
  if (!contextMenu.value) {
    return
  }

  emit("edit", contextMenu.value.timelineId)
  closeContextMenu()
}

function handleDeleteFromMenu(): void {
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

function buildItemClassName(itemId: string): string {
  const classes = ["timeline-item", ...(itemVisualClassById.get(itemId) ?? [])]

  const dragState = dragStateById.get(itemId)
  if (dragState === "moving") {
    classes.push("timeline-item--moving")
  } else if (dragState === "resizing") {
    classes.push("timeline-item--resizing")
  }

  if (props.savingTimelineId === itemId) {
    classes.push("timeline-item--saving")
  }

  if (props.successTimelineId === itemId) {
    classes.push("timeline-item--success")
  }

  if (props.errorTimelineId === itemId) {
    classes.push("timeline-item--error")
  }

  if (compactMode.value) {
    classes.push("timeline-item--compact")
  }

  return classes.join(" ")
}

function resolveDragState(itemId: string, startMs: number, endMs: number): DragState {
  const original = itemRangeById.get(itemId)
  if (!original) {
    return "moving"
  }

  const startChanged = startMs !== original.startMs
  const endChanged = endMs !== original.endMs

  if (startChanged !== endChanged) {
    return "resizing"
  }

  return "moving"
}

function buildTimelineData(): {
  groups: DataGroup[]
  items: DataItem[]
  options: TimelineOptions
} {
  rowByGroupId.clear()
  itemRangeById.clear()
  itemVisualClassById.clear()

  if (props.days.length === 0 || filteredRows.value.length === 0) {
    return {
      groups: [],
      items: [],
      options: {
        stack: false,
      },
    }
  }

  const groups: DataGroup[] = []
  const items: DataItem[] = []
  const groupedRows = groupRowsByProject(filteredRows.value)

  for (const project of groupedRows) {
    const projectGroupId = `project::${project.projectExternalId}`
    const isCollapsed = collapsedProjectIds.value.has(project.projectExternalId)

    groups.push({
      id: projectGroupId,
      content: `<div class=\"vis-project-group\"><span class=\"vis-label-token vis-label-token--project\"><span class=\"vis-label-token__dot\"></span>${isCollapsed ? "▸" : "▾"} ${escapeHtml(project.projectName)}</span></div>`,
      className: "timeline-project-row",
      style: `height:${CHARGE_ROW_HEIGHT_PX}px;`,
    })

    if (isCollapsed) {
      continue
    }

    for (const row of project.rows) {
      const rowGroupId = `row::${row.id}`
      const projectToneClass = getToneClass(row.projectExternalId, "timeline-project-tone")
      const chargeToneClass = getToneClass(row.chargeExternalId, "timeline-charge-tone")

      rowByGroupId.set(rowGroupId, row)

      groups.push({
        id: rowGroupId,
        content: `<div class=\"vis-row-group\"><strong>${escapeHtml(row.chargeName)}</strong><span class=\"vis-lanes-badge\">Lanes: ${Math.max(
          row.lanesCount,
          1,
        )}</span></div>`,
        className: "timeline-charge-row",
        style: `height:${CHARGE_ROW_HEIGHT_PX}px;`,
      })

      for (const block of row.blocks) {
        const startDay = props.days[block.startIndex]
        if (!startDay) {
          continue
        }

        const pendingDays = pendingDayRangeByTimelineId.get(block.id)
        const hasPendingRange = !!pendingDays && pendingDays.length > 0
        const endIndexExclusive = Math.min(block.endIndex + 1, props.days.length)
        const endDay = props.days[endIndexExclusive]
        const start = hasPendingRange ? parseIsoDate(pendingDays[0]) : parseIsoDate(startDay)
        const end = hasPendingRange
          ? addDays(parseIsoDate(pendingDays[pendingDays.length - 1]), 1)
          : endDay
            ? parseIsoDate(endDay)
            : addDays(parseIsoDate(props.days[props.days.length - 1]), 1)

        itemRangeById.set(block.id, {
          startMs: start.getTime(),
          endMs: end.getTime(),
        })
        itemVisualClassById.set(block.id, [projectToneClass, chargeToneClass])

        items.push({
          id: block.id,
          group: rowGroupId,
          content: `<span class=\"timeline-item__label\">${escapeHtml(block.employeeName)}</span>`,
          start,
          end,
          type: "range",
          className: buildItemClassName(block.id),
          style: `height:${ITEM_HEIGHT_PX}px; box-sizing:border-box;`,
        })
      }
    }
  }

  const bounds = getTimelineBounds()
  const min = bounds?.min ?? new Date()
  const max = bounds?.max ?? addDays(min, 1)

  return {
    groups,
    items,
    options: {
      min,
      max,
      zoomMin: DAY_MS,
      zoomMax: Math.max(DAY_MS, max.getTime() - min.getTime()),
      stack: false,
      stackSubgroups: false,
      selectable: true,
      multiselect: false,
      editable: {
        add: false,
        remove: false,
        updateGroup: false,
        updateTime: true,
      },
      margin: {
        axis: 0,
        item: {
          horizontal: 0,
          vertical: ROW_ITEM_VERTICAL_MARGIN_PX,
        },
      },
      orientation: "top",
      showMajorLabels: true,
      showMinorLabels: true,
      moveable: true,
      zoomable: true,
      horizontalScroll: true,
      verticalScroll: true,
      groupHeightMode: "fixed",
      timeAxis: {
        scale: "day",
        step: 1,
      },
      format: {
        minorLabels: {
          day: "D",
        },
        majorLabels: {
          day: "MMMM YYYY",
        },
      },
      snap(date) {
        return snapToDayBoundary(date) ?? date
      },
      onMoving(item, callback) {
        const start = normalizeToDate(item.start)
        if (!start) {
          callback(item)
          return
        }

        const endRaw = normalizeToDate(item.end)
        const end = endRaw && endRaw.getTime() > start.getTime() ? endRaw : addDays(start, 1)
        item.start = start
        item.end = end

        const itemId = String(item.id)
        const dragState = resolveDragState(itemId, start.getTime(), end.getTime())
        dragStateById.set(itemId, dragState)
        item.className = buildItemClassName(itemId)
        isInteracting.value = true

        callback(item)
      },
      onMove(item, callback) {
        const normalized = normalizeTimelineItemToDays(item)
        const itemId = String(item.id)

        if (!normalized) {
          dragStateById.delete(itemId)
          callback(null)
          return
        }

        item.start = normalized.start
        item.end = normalized.end

        const days = buildDaysFromRange(item.start, item.end)
        if (days.length === 0) {
          dragStateById.delete(itemId)
          callback(null)
          return
        }

        dragStateById.delete(itemId)
        item.className = buildItemClassName(itemId)
        isInteracting.value = false
        pendingDayRangeByTimelineId.set(itemId, days)

        emit("resize", {
          timelineId: itemId,
          days,
        })

        callback(item)
        flushQueuedRender()
      },
    },
  }
}

function bindTimelineEvents(): void {
  if (!timeline) {
    return
  }

  timeline.on("click", (eventProperties) => {
    if (isProjectGroupId(eventProperties.group) && eventProperties.what !== "item") {
      toggleProjectByGroupId(eventProperties.group)
      return
    }
  })

  timeline.on("rangechange", (eventProperties: { byUser?: boolean }) => {
    if (eventProperties.byUser) {
      isInteracting.value = true
      if (rangeInteractionTimer) {
        clearTimeout(rangeInteractionTimer)
      }
      rangeInteractionTimer = setTimeout(() => {
        isInteracting.value = false
        flushQueuedRender()
      }, 90)
    }
  })

  timeline.on("contextmenu", (eventProperties) => {
    const event = eventProperties.event as MouseEvent | undefined
    if (!event) {
      return
    }

    event.preventDefault()

    if (!eventProperties.item) {
      closeContextMenu()
      return
    }

    contextMenu.value = {
      x: event.clientX,
      y: event.clientY,
      timelineId: String(eventProperties.item),
    }
  })
}

function flushQueuedRender(): void {
  if (!pendingRender) {
    return
  }

  const resetWindow = pendingRenderReset
  pendingRender = false
  pendingRenderReset = false
  renderTimeline(resetWindow)
}

function scheduleRender(resetWindow = false): void {
  if (import.meta.client) {
    initializeTimeline()
  }

  if (isInteracting.value) {
    pendingRender = true
    pendingRenderReset = pendingRenderReset || resetWindow
    return
  }

  renderTimeline(resetWindow)
}

function renderTimeline(resetWindow = false): void {
  if (!timelineContainerRef.value || !timeline) {
    return
  }

  const { groups, items, options } = buildTimelineData()
  timeline.setOptions(options)
  timeline.setData({ groups, items })

  if (resetWindow) {
    applyPresetWindow(activePreset.value)
  }
}

function initializeTimeline(): void {
  if (!timelineContainerRef.value || timeline) {
    return
  }

  timeline = new Timeline(timelineContainerRef.value)
  bindTimelineEvents()
  renderTimeline(true)
}

function destroyTimeline(): void {
  if (!timeline) {
    return
  }

  timeline.destroy()
  timeline = null
}

watch(
  () => props.days,
  () => {
    if (!import.meta.client || props.days.length === 0) {
      return
    }

    initializeTimeline()
    scheduleRender(true)
  },
  { deep: true },
)

watch(
  () => props.rows,
  () => {
    const chargeAvailable = chargeFilterOptions.value.some((option) => option.value === selectedChargeId.value)
    if (!chargeAvailable) {
      selectedChargeId.value = ALL_FILTER_VALUE
    }

    scheduleRender()
  },
  { deep: true },
)

watch(
  () => [props.savingTimelineId, props.successTimelineId, props.errorTimelineId],
  ([savingId, successId, errorId]) => {
    if (errorId) {
      pendingDayRangeByTimelineId.delete(errorId)
    }

    if (!savingId && successId) {
      pendingDayRangeByTimelineId.delete(successId)
    }

    if (!savingId && !successId && !errorId && pendingDayRangeByTimelineId.size > 0) {
      pendingDayRangeByTimelineId.clear()
    }

    scheduleRender()
  },
)

watch(
  () => [selectedProjectId.value, selectedChargeId.value, compactMode.value],
  () => {
    scheduleRender(true)
  },
)

onMounted(() => {
  if (!import.meta.client) {
    return
  }

  initializeTimeline()

  window.addEventListener("pointerdown", handleGlobalPointerDown)
  window.addEventListener("resize", closeContextMenu)
  window.addEventListener("scroll", closeContextMenu, true)
  window.addEventListener("keydown", handleGlobalKeyDown)
})

onBeforeUnmount(() => {
  destroyTimeline()
  if (rangeInteractionTimer) {
    clearTimeout(rangeInteractionTimer)
    rangeInteractionTimer = null
  }
  isInteracting.value = false
  pendingRender = false
  pendingRenderReset = false
  pendingDayRangeByTimelineId.clear()

  if (!import.meta.client) {
    return
  }

  window.removeEventListener("pointerdown", handleGlobalPointerDown)
  window.removeEventListener("resize", closeContextMenu)
  window.removeEventListener("scroll", closeContextMenu, true)
  window.removeEventListener("keydown", handleGlobalKeyDown)
})

const projectFilterOptions = computed(() => {
  const options = [
    {
      label: "All projects",
      value: ALL_FILTER_VALUE,
    },
  ]

  const seen = new Set<string>()
  for (const row of props.rows) {
    if (seen.has(row.projectExternalId)) {
      continue
    }

    seen.add(row.projectExternalId)
    options.push({
      label: row.projectName,
      value: row.projectExternalId,
    })
  }

  return options
})

const chargeFilterOptions = computed(() => {
  const options = [
    {
      label: "All charges",
      value: ALL_FILTER_VALUE,
    },
  ]

  const seen = new Set<string>()
  for (const row of props.rows) {
    if (selectedProjectId.value !== ALL_FILTER_VALUE && row.projectExternalId !== selectedProjectId.value) {
      continue
    }

    if (seen.has(row.chargeExternalId)) {
      continue
    }

    seen.add(row.chargeExternalId)
    options.push({
      label: row.chargeName,
      value: row.chargeExternalId,
    })
  }

  return options
})

const filteredRows = computed(() =>
  props.rows.filter((row) => {
    if (selectedProjectId.value !== ALL_FILTER_VALUE && row.projectExternalId !== selectedProjectId.value) {
      return false
    }

    if (selectedChargeId.value !== ALL_FILTER_VALUE && row.chargeExternalId !== selectedChargeId.value) {
      return false
    }

    return true
  }),
)

const projectCount = computed(() => new Set(filteredRows.value.map((row) => row.projectExternalId)).size)
const chargeCount = computed(() => new Set(filteredRows.value.map((row) => row.chargeExternalId)).size)
const timelineItemCount = computed(() => filteredRows.value.reduce((sum, row) => sum + row.blocks.length, 0))
const peakLanes = computed(() => filteredRows.value.reduce((max, row) => Math.max(max, row.lanesCount), 0))

const projectLegendItems = computed(() => {
  const seen = new Set<string>()
  const items: Array<{ id: string; name: string; toneClass: string }> = []

  for (const row of filteredRows.value) {
    if (seen.has(row.projectExternalId)) {
      continue
    }

    seen.add(row.projectExternalId)
    items.push({
      id: row.projectExternalId,
      name: row.projectName,
      toneClass: getToneClass(row.projectExternalId, "timeline-project-tone"),
    })

    if (items.length >= 8) {
      break
    }
  }

  return items
})

const chargeLegendItems = computed(() => {
  const seen = new Set<string>()
  const items: Array<{ id: string; name: string; toneClass: string }> = []

  for (const row of filteredRows.value) {
    if (seen.has(row.chargeExternalId)) {
      continue
    }

    seen.add(row.chargeExternalId)
    items.push({
      id: row.chargeExternalId,
      name: row.chargeName,
      toneClass: getToneClass(row.chargeExternalId, "timeline-charge-tone"),
    })

    if (items.length >= 8) {
      break
    }
  }

  return items
})
</script>

<template>
  <UCard class="timeline-card">
    <template #header>
      <div class="timeline-toolbar">
        <div class="timeline-toolbar__title-wrap">
          <h2 class="text-base font-semibold text-highlighted">Timeline Planner</h2>
          <p class="timeline-toolbar__subtitle">Drag edges to resize, right-click an item for actions.</p>
        </div>
        <div class="timeline-toolbar__actions">
          <div class="timeline-preset-group">
            <UButton size="xs" color="neutral" :variant="activePreset === '2w' ? 'solid' : 'soft'" @click="setPreset('2w')">
              2w
            </UButton>
            <UButton size="xs" color="neutral" :variant="activePreset === '1m' ? 'solid' : 'soft'" @click="setPreset('1m')">
              1m
            </UButton>
            <UButton size="xs" color="neutral" :variant="activePreset === '3m' ? 'solid' : 'soft'" @click="setPreset('3m')">
              3m
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              :variant="activePreset === 'year' ? 'solid' : 'soft'"
              @click="setPreset('year')"
            >
              year
            </UButton>
          </div>
          <UButton size="xs" color="primary" variant="soft" icon="i-lucide-calendar-days" @click="focusToday">
            Today
          </UButton>
        </div>
      </div>

      <div class="timeline-stats">
        <UBadge color="neutral" variant="soft" class="timeline-stats__badge">
          <UIcon name="i-lucide-folder-kanban" class="size-3.5" />
          <span>{{ projectCount }} projects</span>
        </UBadge>
        <UBadge color="neutral" variant="soft" class="timeline-stats__badge">
          <UIcon name="i-lucide-briefcase-business" class="size-3.5" />
          <span>{{ chargeCount }} charges</span>
        </UBadge>
        <UBadge color="primary" variant="soft" class="timeline-stats__badge">
          <UIcon name="i-lucide-calendar-range" class="size-3.5" />
          <span>{{ timelineItemCount }} timelines</span>
        </UBadge>
        <UBadge color="secondary" variant="soft" class="timeline-stats__badge">
          <UIcon name="i-lucide-layers" class="size-3.5" />
          <span>max lanes: {{ peakLanes }}</span>
        </UBadge>
      </div>

      <div class="timeline-controls">
        <USelect
          v-model="selectedProjectId"
          :items="projectFilterOptions"
          value-key="value"
          label-key="label"
          size="xs"
          class="timeline-select"
        />
        <USelect
          v-model="selectedChargeId"
          :items="chargeFilterOptions"
          value-key="value"
          label-key="label"
          size="xs"
          class="timeline-select"
        />
        <div class="timeline-compact">
          <span class="timeline-compact__label">Compact mode</span>
          <USwitch v-model="compactMode" size="sm" />
        </div>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-rotate-ccw" @click="resetFilters">
          Reset filters
        </UButton>
      </div>

      <div class="timeline-legend" v-if="projectLegendItems.length > 0 || chargeLegendItems.length > 0">
        <div class="timeline-legend__group" v-if="projectLegendItems.length > 0">
          <span class="timeline-legend__title">
            <UIcon name="i-lucide-folder-kanban" class="size-3.5" />
            <span>Projects</span>
          </span>
          <div class="timeline-legend__items">
            <span
              v-for="item in projectLegendItems"
              :key="`legend-project-${item.id}`"
              class="timeline-legend__chip"
              :class="item.toneClass"
            >
              <UIcon name="i-lucide-folder" class="size-3.5" />
              <span class="vis-tone-dot" />
              {{ item.name }}
            </span>
          </div>
        </div>
        <div class="timeline-legend__group" v-if="chargeLegendItems.length > 0">
          <span class="timeline-legend__title">
            <UIcon name="i-lucide-briefcase-business" class="size-3.5" />
            <span>Charges</span>
          </span>
          <div class="timeline-legend__items">
            <span
              v-for="item in chargeLegendItems"
              :key="`legend-charge-${item.id}`"
              class="timeline-legend__chip timeline-legend__chip--soft"
              :class="item.toneClass"
            >
              <UIcon name="i-lucide-badge-check" class="size-3.5" />
              <span class="vis-tone-dot" />
              {{ item.name }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-if="days.length === 0" class="text-sm text-muted">Set a valid date range.</div>
    <div v-else-if="filteredRows.length === 0" class="text-sm text-muted">No rows for current filters.</div>

    <div
      v-else
      ref="timelineShellRef"
      class="timeline-shell relative overflow-hidden rounded-xl border border-default"
      :class="{ 'timeline-shell--compact': compactMode, 'timeline-shell--interacting': isInteracting }"
    >
      <div
        ref="timelineContainerRef"
        class="timeline-canvas h-[calc(100vh-240px)] min-h-[700px] w-full bg-default"
        :class="{ 'h-[calc(100vh-320px)] min-h-[520px]': compactMode }"
      />
    </div>
  </UCard>

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
        @click.stop="handleEditFromMenu"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
        <span>Редактировать</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error hover:bg-elevated"
        @click.stop="handleDeleteFromMenu"
      >
        <UIcon name="i-lucide-trash-2" class="size-4" />
        <span>Удалить</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.timeline-card {
  overflow: hidden;
}

.timeline-canvas {
  min-height: 520px;
}

.timeline-shell :deep(.vis-itemset .vis-group),
.timeline-shell :deep(.vis-labelset .vis-label) {
  height: 50px !important;
  min-height: 50px !important;
  max-height: 50px !important;
}

.timeline-shell :deep(.vis-labelset .vis-label .vis-inner) {
  height: 100%;
  display: flex;
  align-items: center;
}

.timeline-shell :deep(.vis-item.timeline-item) {
  height: 50px !important;
  line-height: 50px;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  box-sizing: border-box;
}

</style>

