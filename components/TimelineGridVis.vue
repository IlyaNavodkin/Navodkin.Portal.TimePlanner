<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { CSSProperties } from "vue"
import { GGanttChart, GGanttRow, extendDayjs } from "@infectoone/vue-ganttastic"

extendDayjs()

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

interface TimelineProjectGroup {
  projectExternalId: string
  projectName: string
  rows: TimelineGridRow[]
}

interface TimelineCreatePayload {
  row: TimelineGridRow
  day: string
}

interface TimelineResizePayload {
  timelineId: string
  days: string[]
}

interface GanttBarConfig {
  id: string
  label: string
  hasHandles: boolean
  class: string
  style: CSSProperties
  immobile?: boolean
}

interface GanttBarModel {
  timelineId: string
  rowId: string
  employeeName: string
  startDateTime: string
  endDateTime: string
  ganttBarConfig: GanttBarConfig
}

type RenderRowKind = "project" | "charge"
type ZoomPreset = "2w" | "1m" | "3m" | "year"
type ChartPrecision = "day" | "week" | "month"

interface RenderRow {
  key: string
  kind: RenderRowKind
  label: string
  projectExternalId: string
  projectName: string
  chargeName: string
  lane: number
  row?: TimelineGridRow
  projectRowCount?: number
  bars: GanttBarModel[]
}

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

const BAR_START_KEY = "startDateTime"
const BAR_END_KEY = "endDateTime"
const CHART_DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm"
const CHART_DATE_ONLY_FORMAT = "YYYY-MM-DD"
const ALL_FILTER_VALUE = "__all"
const DAY_MS = 24 * 60 * 60 * 1000
const COLLAPSED_ICON = "в–ё"
const EXPANDED_ICON = "в–ѕ"
const ZOOM_PRESETS: ZoomPreset[] = ["2w", "1m", "3m", "year"]
const INERTIA_FRICTION_PER_FRAME = 0.9
const MIN_INERTIA_VELOCITY_DAYS_PER_MS = 0.00002

const selectedProjectId = ref(ALL_FILTER_VALUE)
const selectedChargeId = ref(ALL_FILTER_VALUE)
const createChargeId = ref("")
const collapsedProjectIds = ref<Set<string>>(new Set())
const activeZoomPreset = ref<ZoomPreset>("1m")
const activePrecision = ref<ChartPrecision>("day")
const panOffsetDays = ref(0)
const contextMenuRef = ref<HTMLElement | null>(null)
const contextMenu = ref<{ x: number; y: number; timelineId: string } | null>(null)
const selectedTimelineId = ref("")
const chartViewportRef = ref<HTMLElement | null>(null)
const isPointerPanning = ref(false)
const panPointerId = ref<number | null>(null)
const panLastClientX = ref(0)
const panLastTimestamp = ref(0)
const panDragRemainderDays = ref(0)
const panVelocityDaysPerMs = ref(0)
const suppressNextChartClick = ref(false)
const inertiaRafId = ref<number | null>(null)
const inertiaLastTimestamp = ref(0)
const inertiaRemainderDays = ref(0)

const daySet = computed(() => new Set(props.days))

const projectOptions = computed(() => {
  const result = [{ label: "All projects", value: ALL_FILTER_VALUE }]
  const seen = new Set<string>()

  for (const row of props.rows) {
    if (seen.has(row.projectExternalId)) {
      continue
    }

    seen.add(row.projectExternalId)
    result.push({
      label: row.projectName,
      value: row.projectExternalId,
    })
  }

  return result.sort((left, right) => left.label.localeCompare(right.label))
})

const chargeOptions = computed(() => {
  const result = [{ label: "All charges", value: ALL_FILTER_VALUE }]
  const seen = new Set<string>()

  for (const row of props.rows) {
    if (
      selectedProjectId.value !== ALL_FILTER_VALUE &&
      row.projectExternalId !== selectedProjectId.value
    ) {
      continue
    }

    if (seen.has(row.chargeExternalId)) {
      continue
    }

    seen.add(row.chargeExternalId)
    result.push({
      label: `${row.chargeName} (${row.projectName})`,
      value: row.chargeExternalId,
    })
  }

  return result.sort((left, right) => left.label.localeCompare(right.label))
})

const createChargeOptions = computed(() =>
  filteredRows.value.map((row) => ({
    label: `${row.projectName} / ${row.chargeName}`,
    value: row.id,
  })),
)

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

const groupedRows = computed<TimelineProjectGroup[]>(() => {
  const groups = new Map<string, TimelineProjectGroup>()

  for (const row of filteredRows.value) {
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

  const result = [...groups.values()]
  for (const group of result) {
    group.rows.sort((left, right) => left.chargeName.localeCompare(right.chargeName))
  }

  return result.sort((left, right) => left.projectName.localeCompare(right.projectName))
})

const timelineItemCount = computed(() =>
  filteredRows.value.reduce((sum, row) => sum + row.blocks.length, 0),
)

const chartBounds = computed(() => {
  const firstDay = props.days[0]
  const lastDay = props.days[props.days.length - 1]
  if (!firstDay || !lastDay) {
    return null
  }

  return {
    startDay: firstDay,
    endExclusiveDay: addIsoDays(lastDay, 1),
  }
})

const panOffsetBounds = computed(() => {
  const bounds = chartBounds.value
  if (!bounds) {
    return { min: 0, max: 0 }
  }

  const totalDays = getIsoDayDiff(bounds.startDay, bounds.endExclusiveDay)
  const spanDays = getSpanDaysByPreset(activeZoomPreset.value, totalDays)
  if (spanDays >= totalDays) {
    return { min: 0, max: 0 }
  }

  const anchorDay = getAnchorDay(bounds.startDay)
  const baseStartDay = addIsoDays(anchorDay, -Math.floor(spanDays / 2))
  const maxStartDay = addIsoDays(bounds.endExclusiveDay, -spanDays)

  const min = getIsoDayDiff(baseStartDay, bounds.startDay)
  const max = getIsoDayDiff(baseStartDay, maxStartDay)

  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  }
})

const chartRange = computed(() => {
  const bounds = chartBounds.value
  if (!bounds) {
    return null
  }

  const totalDays = getIsoDayDiff(bounds.startDay, bounds.endExclusiveDay)
  const spanDays = getSpanDaysByPreset(activeZoomPreset.value, totalDays)
  if (spanDays >= totalDays) {
    return bounds
  }

  const anchor = getAnchorDay(bounds.startDay)
  const startCandidate = addIsoDays(anchor, -Math.floor(spanDays / 2) + panOffsetDays.value)
  const endCandidate = addIsoDays(startCandidate, spanDays)

  return clampDayRange(startCandidate, endCandidate, bounds.startDay, bounds.endExclusiveDay)
})

const chartStart = computed(() => {
  if (!chartRange.value) {
    return ""
  }

  return formatChartDateTime(chartRange.value.startDay)
})

const chartEnd = computed(() => {
  if (!chartRange.value) {
    return ""
  }

  return formatChartDateTime(chartRange.value.endExclusiveDay)
})

const chartDateFormat = computed(() =>
  activePrecision.value === "day" ? CHART_DATE_ONLY_FORMAT : CHART_DATE_TIME_FORMAT,
)

const chartRenderKey = computed(
  () => `${chartStart.value}|${chartEnd.value}|${activePrecision.value}|${renderRows.value.length}`,
)

const defaultCreateDay = computed(() => {
  if (props.days.length === 0) {
    return ""
  }

  const today = toIsoDateUtc(new Date())
  return daySet.value.has(today) ? today : props.days[0]
})

const renderRows = computed<RenderRow[]>(() => {
  const rows: RenderRow[] = []

  for (const group of groupedRows.value) {
    rows.push({
      key: `project::${group.projectExternalId}`,
      kind: "project",
      label: `${collapsedProjectIds.value.has(group.projectExternalId) ? COLLAPSED_ICON : EXPANDED_ICON} ${group.projectName}`,
      projectExternalId: group.projectExternalId,
      projectName: group.projectName,
      chargeName: "",
      lane: 0,
      projectRowCount: group.rows.length,
      bars: [],
    })

    if (collapsedProjectIds.value.has(group.projectExternalId)) {
      continue
    }

    for (const row of group.rows) {
      const lanes = Math.max(row.lanesCount, 1)

      for (let lane = 0; lane < lanes; lane += 1) {
        const laneBars: GanttBarModel[] = []

        for (const block of row.blocks) {
          if (block.lane !== lane) {
            continue
          }

          const startDay = props.days[block.startIndex]
          const endDay = props.days[block.endIndex]
          if (!startDay || !endDay) {
            continue
          }

          const statusClass = getStatusClass(block.id)
          const selectedClass = getSelectedClass(block.id)
          laneBars.push({
            timelineId: block.id,
            rowId: row.id,
            employeeName: block.employeeName,
            startDateTime: formatChartDateTime(startDay),
            endDateTime: formatChartDateTime(addIsoDays(endDay, 1)),
            ganttBarConfig: {
              id: block.id,
              label: block.employeeName,
              hasHandles: true,
              class: `timeline-gantt-bar ${statusClass} ${selectedClass}`.trim(),
              style: getBarStyle(row.projectExternalId, row.chargeExternalId, block.id),
            },
          })
        }

        rows.push({
          key: `${row.id}::${lane}`,
          kind: "charge",
          label: lane === 0 ? `   ${row.chargeName}` : `   ${row.chargeName} (lane ${lane + 1})`,
          projectExternalId: row.projectExternalId,
          projectName: row.projectName,
          chargeName: row.chargeName,
          lane,
          row,
          bars: laneBars,
        })
      }
    }
  }

  return rows
})

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function getStatusClass(timelineId: string): string {
  if (props.savingTimelineId === timelineId) {
    return "timeline-gantt-bar--saving"
  }

  if (props.successTimelineId === timelineId) {
    return "timeline-gantt-bar--success"
  }

  if (props.errorTimelineId === timelineId) {
    return "timeline-gantt-bar--error"
  }

  return ""
}

function getSelectedClass(timelineId: string): string {
  return selectedTimelineId.value === timelineId ? "timeline-gantt-bar--selected" : ""
}

function getBarStyle(projectExternalId: string, chargeExternalId: string, timelineId: string): CSSProperties {
  const projectHue = hashString(projectExternalId) % 360
  const chargeHue = hashString(chargeExternalId) % 360

  const isSaving = props.savingTimelineId === timelineId
  const isSuccess = props.successTimelineId === timelineId
  const isError = props.errorTimelineId === timelineId

  const borderColor = isSaving
    ? "#f59e0b"
    : isSuccess
      ? "#16a34a"
      : isError
        ? "#dc2626"
        : "rgba(15, 23, 42, 0.22)"

  return {
    background: `linear-gradient(120deg, hsl(${projectHue} 82% 90%), hsl(${chargeHue} 85% 85%))`,
    border: `1px solid ${borderColor}`,
    color: "#0f172a",
    fontWeight: "600",
  }
}

function parseIsoDayToUtcMs(isoDay: string): number {
  return new Date(`${isoDay}T00:00:00Z`).getTime()
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getIsoDayDiff(fromDay: string, toDay: string): number {
  return Math.round((parseIsoDayToUtcMs(toDay) - parseIsoDayToUtcMs(fromDay)) / DAY_MS)
}

function getSpanDaysByPreset(preset: ZoomPreset, totalDays: number): number {
  const presetSpan = preset === "2w" ? 14 : preset === "1m" ? 31 : preset === "3m" ? 92 : totalDays
  return Math.max(1, Math.min(totalDays, presetSpan))
}

function getAnchorDay(boundsStartDay: string): string {
  const today = toIsoDateUtc(new Date())
  return daySet.value.has(today) ? today : boundsStartDay
}

function addIsoDays(isoDay: string, delta: number): string {
  const source = new Date(`${isoDay}T00:00:00Z`)
  source.setUTCDate(source.getUTCDate() + delta)
  return toIsoDateUtc(source)
}

function toIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function clampDayRange(
  startDay: string,
  endExclusiveDay: string,
  boundsStartDay: string,
  boundsEndExclusiveDay: string,
): { startDay: string; endExclusiveDay: string } {
  const boundsStartMs = parseIsoDayToUtcMs(boundsStartDay)
  const boundsEndMs = parseIsoDayToUtcMs(boundsEndExclusiveDay)

  let startMs = parseIsoDayToUtcMs(startDay)
  let endMs = parseIsoDayToUtcMs(endExclusiveDay)

  if (endMs <= startMs) {
    endMs = startMs + DAY_MS
  }

  const desiredWidthMs = endMs - startMs
  const boundsWidthMs = boundsEndMs - boundsStartMs

  if (desiredWidthMs >= boundsWidthMs) {
    return {
      startDay: boundsStartDay,
      endExclusiveDay: boundsEndExclusiveDay,
    }
  }

  if (startMs < boundsStartMs) {
    const shiftRight = boundsStartMs - startMs
    startMs += shiftRight
    endMs += shiftRight
  }

  if (endMs > boundsEndMs) {
    const shiftLeft = endMs - boundsEndMs
    startMs -= shiftLeft
    endMs -= shiftLeft
  }

  if (startMs < boundsStartMs) {
    startMs = boundsStartMs
    endMs = boundsStartMs + desiredWidthMs
  }

  if (endMs > boundsEndMs) {
    endMs = boundsEndMs
    startMs = boundsEndMs - desiredWidthMs
  }

  return {
    startDay: toIsoDateUtc(new Date(startMs)),
    endExclusiveDay: toIsoDateUtc(new Date(endMs)),
  }
}

function normalizeDayFromChartValue(value: string | Date | undefined): string | null {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
  }

  return toIsoDateUtc(value)
}

function formatChartDateTime(isoDay: string): string {
  return activePrecision.value === "day" ? isoDay : `${isoDay} 00:00`
}

function formatAxisDayNumber(date: Date): string {
  return String(date.getDate())
}

function getDaysFromChartRange(startValue: string | Date | undefined, endValue: string | Date | undefined): string[] {
  const startDay = normalizeDayFromChartValue(startValue)
  const endExclusiveDay = normalizeDayFromChartValue(endValue)

  if (!startDay || !endExclusiveDay) {
    return []
  }

  let cursor = startDay
  const result: string[] = []
  let guard = 0

  while (cursor < endExclusiveDay && guard < 800) {
    if (daySet.value.has(cursor)) {
      result.push(cursor)
    }

    cursor = addIsoDays(cursor, 1)
    guard += 1
  }

  return result
}

function getCurrentTimelineDays(timelineId: string): string[] {
  for (const row of props.rows) {
    const block = row.blocks.find((item) => item.id === timelineId)
    if (!block) {
      continue
    }

    const days: string[] = []
    for (let index = block.startIndex; index <= block.endIndex; index += 1) {
      const day = props.days[index]
      if (day) {
        days.push(day)
      }
    }

    return days
  }

  return []
}

function areSameDayRanges(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function emitCreateForRow(row: TimelineGridRow, dayCandidate?: string | Date): void {
  const dayFromCandidate = normalizeDayFromChartValue(dayCandidate)
  const day =
    dayFromCandidate && daySet.value.has(dayFromCandidate)
      ? dayFromCandidate
      : defaultCreateDay.value

  if (!day) {
    return
  }

  emit("create", { row, day })
}

function handleRowDrop(renderRow: RenderRow, dayCandidate?: string | Date): void {
  if (renderRow.kind !== "charge" || !renderRow.row) {
    return
  }

  emitCreateForRow(renderRow.row, dayCandidate)
}

function handleDragEnd(payload: { bar: GanttBarModel }): void {
  const days = getDaysFromChartRange(payload.bar[BAR_START_KEY], payload.bar[BAR_END_KEY])

  if (days.length === 0) {
    return
  }

  const currentDays = getCurrentTimelineDays(payload.bar.timelineId)
  if (areSameDayRanges(currentDays, days)) {
    return
  }

  emit("resize", {
    timelineId: payload.bar.timelineId,
    days,
  })
}

function handleBarDoubleClick(payload: { bar: GanttBarModel }): void {
  emit("edit", payload.bar.timelineId)
}

function handleBarClick(payload: { bar: GanttBarModel }): void {
  selectedTimelineId.value = payload.bar.timelineId
}

function openContextMenu(payload: { bar: GanttBarModel; e: MouseEvent }): void {
  payload.e.preventDefault()
  selectedTimelineId.value = payload.bar.timelineId
  contextMenu.value = {
    x: payload.e.clientX,
    y: payload.e.clientY,
    timelineId: payload.bar.timelineId,
  }
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

function setZoomPreset(preset: ZoomPreset): void {
  activeZoomPreset.value = preset
  panOffsetDays.value = 0
}

function setPrecision(precision: ChartPrecision): void {
  activePrecision.value = precision
}

function getPanStepDays(): number {
  return activeZoomPreset.value === "2w" ? 7 : activeZoomPreset.value === "3m" ? 30 : activeZoomPreset.value === "year" ? 30 : 14
}

function clampPanOffset(nextOffsetDays: number): number {
  const { min, max } = panOffsetBounds.value
  return clampNumber(nextOffsetDays, min, max)
}

function setPanOffset(nextOffsetDays: number): boolean {
  const clamped = clampPanOffset(Math.round(nextOffsetDays))
  if (clamped === panOffsetDays.value) {
    return false
  }

  panOffsetDays.value = clamped
  return true
}

function shiftPanOffset(deltaDays: number): boolean {
  if (deltaDays === 0) {
    return false
  }

  return setPanOffset(panOffsetDays.value + deltaDays)
}

function stopPanInertia(): void {
  if (!import.meta.client) {
    return
  }

  if (inertiaRafId.value !== null) {
    window.cancelAnimationFrame(inertiaRafId.value)
    inertiaRafId.value = null
  }

  inertiaRemainderDays.value = 0
  inertiaLastTimestamp.value = 0
}

function applyFloatPanDelta(deltaDaysFloat: number, remainderRef: { value: number }): "none" | "moved" | "blocked" {
  const totalDays = remainderRef.value + deltaDaysFloat
  const wholeDays = totalDays >= 0 ? Math.floor(totalDays) : Math.ceil(totalDays)
  remainderRef.value = totalDays - wholeDays

  if (wholeDays === 0) {
    return "none"
  }

  const moved = shiftPanOffset(wholeDays)
  if (!moved) {
    remainderRef.value = 0
    return "blocked"
  }

  return "moved"
}

function startPanInertia(initialVelocityDaysPerMs: number): void {
  if (!import.meta.client) {
    return
  }

  stopPanInertia()
  panVelocityDaysPerMs.value = initialVelocityDaysPerMs

  if (Math.abs(panVelocityDaysPerMs.value) < MIN_INERTIA_VELOCITY_DAYS_PER_MS) {
    panVelocityDaysPerMs.value = 0
    return
  }

  inertiaLastTimestamp.value = performance.now()

  const tick = (now: number) => {
    if (inertiaLastTimestamp.value === 0) {
      inertiaLastTimestamp.value = now
    }

    const elapsedMs = Math.max(1, now - inertiaLastTimestamp.value)
    inertiaLastTimestamp.value = now

    const panResult = applyFloatPanDelta(
      panVelocityDaysPerMs.value * elapsedMs,
      inertiaRemainderDays,
    )

    const friction = Math.pow(INERTIA_FRICTION_PER_FRAME, elapsedMs / 16)
    panVelocityDaysPerMs.value *= friction

    if (
      panResult === "blocked" ||
      Math.abs(panVelocityDaysPerMs.value) < MIN_INERTIA_VELOCITY_DAYS_PER_MS
    ) {
      panVelocityDaysPerMs.value = 0
      stopPanInertia()
      return
    }

    inertiaRafId.value = window.requestAnimationFrame(tick)
  }

  inertiaRafId.value = window.requestAnimationFrame(tick)
}

function getChartSpanDays(): number {
  const range = chartRange.value
  if (!range) {
    return 0
  }

  return Math.max(1, getIsoDayDiff(range.startDay, range.endExclusiveDay))
}

function resolveFocusDayByRatio(ratio: number): string | null {
  const range = chartRange.value
  if (!range) {
    return null
  }

  const spanDays = getChartSpanDays()
  const dayOffset = Math.round(clampNumber(ratio, 0, 1) * Math.max(spanDays - 1, 0))
  return addIsoDays(range.startDay, dayOffset)
}

function applyZoomPresetAroundFocus(nextPreset: ZoomPreset, focusDay: string, focusRatio: number): void {
  const bounds = chartBounds.value
  activeZoomPreset.value = nextPreset

  if (!bounds) {
    panOffsetDays.value = 0
    return
  }

  const totalDays = getIsoDayDiff(bounds.startDay, bounds.endExclusiveDay)
  const nextSpanDays = getSpanDaysByPreset(nextPreset, totalDays)
  if (nextSpanDays >= totalDays) {
    setPanOffset(0)
    return
  }

  const anchorDay = getAnchorDay(bounds.startDay)
  const baseStartDay = addIsoDays(anchorDay, -Math.floor(nextSpanDays / 2))
  const focusOffsetDays = Math.round(clampNumber(focusRatio, 0, 1) * Math.max(nextSpanDays - 1, 0))
  const desiredStartDay = addIsoDays(focusDay, -focusOffsetDays)
  const nextOffsetDays = getIsoDayDiff(baseStartDay, desiredStartDay)

  setPanOffset(nextOffsetDays)
}

function handleChartWheel(event: WheelEvent): void {
  event.preventDefault()
  stopPanInertia()

  const currentIndex = ZOOM_PRESETS.indexOf(activeZoomPreset.value)
  if (currentIndex === -1) {
    return
  }

  const direction = event.deltaY < 0 ? -1 : 1
  const nextIndex = clampNumber(currentIndex + direction, 0, ZOOM_PRESETS.length - 1)
  if (nextIndex === currentIndex) {
    return
  }

  const viewport = chartViewportRef.value
  const rect = viewport?.getBoundingClientRect()
  const focusRatio =
    rect && rect.width > 0
      ? clampNumber((event.clientX - rect.left) / rect.width, 0, 1)
      : 0.5
  const focusDay = resolveFocusDayByRatio(focusRatio)

  if (!focusDay) {
    activeZoomPreset.value = ZOOM_PRESETS[nextIndex]
    setPanOffset(0)
    return
  }

  applyZoomPresetAroundFocus(ZOOM_PRESETS[nextIndex], focusDay, focusRatio)
}

function canStartPointerPan(event: PointerEvent): boolean {
  if (event.button !== 0 && event.button !== 1) {
    return false
  }

  const target = event.target
  if (!(target instanceof Element)) {
    return false
  }

  if (target.closest(".g-label-column, .timeline-row-project-toggle, .g-label-column-row")) {
    return false
  }

  if (
    target.closest("button, input, select, textarea, a, [role='button']") ||
    target.closest(".g-gantt-bar")
  ) {
    return false
  }

  return true
}

function handleChartPointerDown(event: PointerEvent): void {
  if (!canStartPointerPan(event)) {
    return
  }

  const viewport = chartViewportRef.value
  if (!viewport) {
    return
  }

  stopPanInertia()
  isPointerPanning.value = true
  panPointerId.value = event.pointerId
  panLastClientX.value = event.clientX
  panLastTimestamp.value = event.timeStamp
  panVelocityDaysPerMs.value = 0
  panDragRemainderDays.value = 0
  suppressNextChartClick.value = false
  viewport.setPointerCapture(event.pointerId)
  event.preventDefault()
}

function handleChartPointerMove(event: PointerEvent): void {
  if (!isPointerPanning.value || panPointerId.value !== event.pointerId) {
    return
  }

  const viewport = chartViewportRef.value
  if (!viewport) {
    return
  }

  const elapsedMs = Math.max(1, event.timeStamp - panLastTimestamp.value)
  const deltaX = event.clientX - panLastClientX.value
  if (Math.abs(deltaX) > 2) {
    suppressNextChartClick.value = true
  }
  const spanDays = getChartSpanDays()
  const widthPx = Math.max(viewport.clientWidth, 1)
  const deltaDaysFloat = (-deltaX * spanDays) / widthPx

  applyFloatPanDelta(deltaDaysFloat, panDragRemainderDays)
  panVelocityDaysPerMs.value = deltaDaysFloat / elapsedMs
  panLastClientX.value = event.clientX
  panLastTimestamp.value = event.timeStamp
  event.preventDefault()
}

function stopPointerPan(shouldStartInertia: boolean): void {
  if (!isPointerPanning.value) {
    return
  }

  const viewport = chartViewportRef.value
  const pointerId = panPointerId.value
  if (viewport && pointerId !== null && viewport.hasPointerCapture(pointerId)) {
    viewport.releasePointerCapture(pointerId)
  }

  isPointerPanning.value = false
  panPointerId.value = null
  panDragRemainderDays.value = 0

  if (shouldStartInertia) {
    startPanInertia(panVelocityDaysPerMs.value)
  } else {
    panVelocityDaysPerMs.value = 0
    stopPanInertia()
  }
}

function handleChartPointerUp(event: PointerEvent): void {
  if (panPointerId.value !== event.pointerId) {
    return
  }

  stopPointerPan(true)
}

function handleChartPointerCancel(event: PointerEvent): void {
  if (panPointerId.value !== event.pointerId) {
    return
  }

  stopPointerPan(false)
}

function handleChartClick(event: MouseEvent): void {
  if (suppressNextChartClick.value) {
    suppressNextChartClick.value = false
    return
  }

  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  if (target.closest(".g-gantt-bar")) {
    return
  }

  if (target.closest(".timeline-row-project-toggle")) {
    return
  }

  const labelRowElement = target.closest(".g-label-column-row")
  if (labelRowElement && chartViewportRef.value) {
    const allLabelRows = Array.from(
      chartViewportRef.value.querySelectorAll<HTMLElement>(".g-label-column-row"),
    )
    const rowIndex = allLabelRows.indexOf(labelRowElement as HTMLElement)
    if (rowIndex >= 0) {
      const row = renderRows.value[rowIndex]
      if (row?.kind === "project") {
        toggleProject(row.projectExternalId)
      }
    }

    return
  }

  clearSelectedTimeline()
}

function clearSelectedTimeline(): void {
  selectedTimelineId.value = ""
}

function panLeft(): void {
  stopPanInertia()
  shiftPanOffset(-getPanStepDays())
}

function panRight(): void {
  stopPanInertia()
  shiftPanOffset(getPanStepDays())
}

function panToToday(): void {
  stopPanInertia()
  setPanOffset(0)
}

function createTimelineFromToolbar(): void {
  const targetRow =
    filteredRows.value.find((row) => row.id === createChargeId.value) ?? filteredRows.value[0]

  if (!targetRow) {
    return
  }

  emitCreateForRow(targetRow)
}

function resetFilters(): void {
  selectedProjectId.value = ALL_FILTER_VALUE
  selectedChargeId.value = ALL_FILTER_VALUE
}

watch(
  () => createChargeOptions.value,
  (options) => {
    if (options.length === 0) {
      createChargeId.value = ""
      return
    }

    const exists = options.some((option) => option.value === createChargeId.value)
    if (!exists) {
      createChargeId.value = options[0].value
    }
  },
  { immediate: true },
)

watch(
  panOffsetBounds,
  () => {
    setPanOffset(panOffsetDays.value)
  },
  { immediate: true },
)

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

  stopPointerPan(false)
  stopPanInertia()
  window.removeEventListener("pointerdown", handleGlobalPointerDown)
  window.removeEventListener("resize", closeContextMenu)
  window.removeEventListener("scroll", closeContextMenu, true)
  window.removeEventListener("keydown", handleGlobalKeyDown)
})
</script>

<template>
  <UCard class="timeline-card">
    <template #header>
      <div class="timeline-toolbar">
        <div>
          <h2 class="text-base font-semibold text-highlighted">Timeline Planner (Vue-Ganttastic)</h2>
          <p class="text-xs text-muted">Projects contain charges. Drag bars or handles to update date range.</p>
        </div>

        <div class="timeline-toolbar__stats">
          <UBadge color="neutral" variant="soft">{{ groupedRows.length }} projects</UBadge>
          <UBadge color="neutral" variant="soft">{{ filteredRows.length }} charges</UBadge>
          <UBadge color="primary" variant="soft">{{ timelineItemCount }} timelines</UBadge>
        </div>
      </div>

      <div class="timeline-controls">
        <USelect
          v-model="selectedProjectId"
          :items="projectOptions"
          value-key="value"
          label-key="label"
          class="timeline-select"
        />
        <USelect
          v-model="selectedChargeId"
          :items="chargeOptions"
          value-key="value"
          label-key="label"
          class="timeline-select"
        />
        <UButton color="neutral" variant="soft" icon="i-lucide-filter-x" @click="resetFilters">Reset filters</UButton>
      </div>

      <div class="timeline-controls">
        <USelect
          v-model="createChargeId"
          :items="createChargeOptions"
          value-key="value"
          label-key="label"
          class="timeline-select"
          placeholder="Select charge for create"
        />
        <UButton
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          :disabled="createChargeOptions.length === 0"
          @click="createTimelineFromToolbar"
        >
          Create timeline
        </UButton>
      </div>

      <div class="timeline-controls timeline-controls--zoom">
        <span class="timeline-controls__label">Window:</span>
        <UButton
          color="neutral"
          :variant="activeZoomPreset === '2w' ? 'solid' : 'soft'"
          size="xs"
          @click="setZoomPreset('2w')"
        >2w</UButton>
        <UButton
          color="neutral"
          :variant="activeZoomPreset === '1m' ? 'solid' : 'soft'"
          size="xs"
          @click="setZoomPreset('1m')"
        >1m</UButton>
        <UButton
          color="neutral"
          :variant="activeZoomPreset === '3m' ? 'solid' : 'soft'"
          size="xs"
          @click="setZoomPreset('3m')"
        >3m</UButton>
        <UButton
          color="neutral"
          :variant="activeZoomPreset === 'year' ? 'solid' : 'soft'"
          size="xs"
          @click="setZoomPreset('year')"
        >Year</UButton>

        <span class="timeline-controls__label timeline-controls__label--spaced">Pan:</span>
        <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-left" @click="panLeft">Left</UButton>
        <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-calendar-days" @click="panToToday">Today</UButton>
        <UButton color="neutral" variant="soft" size="xs" icon="i-lucide-arrow-right" @click="panRight">Right</UButton>
        <span class="timeline-controls__hint">Drag by left or middle mouse button to pan</span>

        <span class="timeline-controls__label timeline-controls__label--spaced">Scale:</span>
        <UButton
          color="neutral"
          :variant="activePrecision === 'day' ? 'solid' : 'soft'"
          size="xs"
          @click="setPrecision('day')"
        >Day</UButton>
        <UButton
          color="neutral"
          :variant="activePrecision === 'week' ? 'solid' : 'soft'"
          size="xs"
          @click="setPrecision('week')"
        >Week</UButton>
        <UButton
          color="neutral"
          :variant="activePrecision === 'month' ? 'solid' : 'soft'"
          size="xs"
          @click="setPrecision('month')"
        >Month</UButton>
      </div>

      <div class="timeline-controls">
        <span class="timeline-controls__label">Projects:</span>
        <UButton color="neutral" variant="soft" size="xs" @click="expandAllProjects">Expand all</UButton>
        <UButton color="neutral" variant="soft" size="xs" @click="collapseAllProjects">Collapse all</UButton>
        <UButton
          v-for="group in groupedRows"
          :key="`collapse-${group.projectExternalId}`"
          color="neutral"
          :variant="isProjectCollapsed(group.projectExternalId) ? 'soft' : 'outline'"
          size="xs"
          @click="toggleProject(group.projectExternalId)"
        >
          {{ isProjectCollapsed(group.projectExternalId) ? COLLAPSED_ICON : EXPANDED_ICON }} {{ group.projectName }}
        </UButton>
      </div>
    </template>

    <div v-if="days.length === 0" class="rounded-md border border-default px-4 py-6 text-sm text-muted">
      Set a valid date range.
    </div>

    <div v-else-if="renderRows.length === 0" class="rounded-md border border-default px-4 py-6 text-sm text-muted">
      No timeline rows for selected filters.
    </div>

    <div
      v-else
      ref="chartViewportRef"
      class="timeline-gantt-wrap"
      :class="{ 'timeline-gantt-wrap--panning': isPointerPanning }"
      @wheel="handleChartWheel"
      @pointerdown="handleChartPointerDown"
      @pointermove="handleChartPointerMove"
      @pointerup="handleChartPointerUp"
      @pointercancel="handleChartPointerCancel"
      @click="handleChartClick"
    >
      <GGanttChart
        :key="chartRenderKey"
        :chart-start="chartStart"
        :chart-end="chartEnd"
        :bar-start="BAR_START_KEY"
        :bar-end="BAR_END_KEY"
        :date-format="chartDateFormat"
        :precision="activePrecision"
        label-column-title="Project / Charge"
        label-column-width="380px"
        color-scheme="sky"
        :grid="true"
        :row-height="46"
        :current-time="true"
        current-time-label="Today"
        :push-on-overlap="false"
        :no-overlap="true"
        @click-bar="handleBarClick"
        @dragend-bar="handleDragEnd"
        @dblclick-bar="handleBarDoubleClick"
        @contextmenu-bar="openContextMenu"
      >
        <template #upper-timeunit="{ label }">
          {{ label }}
        </template>
        <template #timeunit="{ label, date }">
          {{ activePrecision === "day" ? formatAxisDayNumber(date) : label }}
        </template>
        <GGanttRow
          v-for="renderRow in renderRows"
          :key="renderRow.key"
          :label="renderRow.label"
          :bars="renderRow.bars"
          :highlight-on-hover="renderRow.kind === 'charge'"
          @drop="handleRowDrop(renderRow, $event.datetime)"
        >
          <template #label>
            <button
              v-if="renderRow.kind === 'project'"
              type="button"
              class="timeline-row-project-toggle"
              @pointerdown.stop
              @mousedown.stop
              @click.stop="toggleProject(renderRow.projectExternalId)"
            >
              <span>{{ isProjectCollapsed(renderRow.projectExternalId) ? COLLAPSED_ICON : EXPANDED_ICON }}</span>
              <span class="timeline-row-project-toggle__name">{{ renderRow.projectName }}</span>
            </button>
            <span v-else class="timeline-row-charge-label">{{ renderRow.chargeName }}</span>
          </template>
        </GGanttRow>
      </GGanttChart>
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
        <span>Edit</span>
      </button>
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-error hover:bg-elevated"
        @click.stop="handleDeleteFromMenu"
      >
        <UIcon name="i-lucide-trash-2" class="size-4" />
        <span>Delete</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.timeline-card {
  min-height: calc(100vh - 180px);
}

.timeline-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.timeline-toolbar__stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.timeline-controls {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.timeline-controls--zoom {
  margin-top: 10px;
}

.timeline-controls__label {
  font-size: 12px;
  color: #64748b;
}

.timeline-controls__label--spaced {
  margin-left: 8px;
}

.timeline-controls__hint {
  font-size: 12px;
  color: #64748b;
}

.timeline-select {
  min-width: 220px;
}

.timeline-gantt-wrap {
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 12px;
  cursor: grab;
}

.timeline-gantt-wrap--panning {
  cursor: grabbing;
  user-select: none;
}

.timeline-project-label {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.timeline-project-label__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
}

.timeline-project-label__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-row-label {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-left: 18px;
}

.timeline-row-label__texts {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.timeline-row-label__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.timeline-row-label__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #475569;
}

.timeline-row-project-toggle {
  display: inline-flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: #0f172a;
  cursor: pointer;
}

.timeline-row-project-toggle__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-row-charge-label {
  display: inline-block;
  padding-left: 14px;
  color: #334155;
}

.timeline-gantt-wrap :deep(.g-gantt-bar.timeline-gantt-bar) {
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.15);
}

.timeline-gantt-wrap :deep(.g-gantt-bar.timeline-gantt-bar.timeline-gantt-bar--saving) {
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.24);
}

.timeline-gantt-wrap :deep(.g-gantt-bar.timeline-gantt-bar.timeline-gantt-bar--success) {
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.24);
}

.timeline-gantt-wrap :deep(.g-gantt-bar.timeline-gantt-bar.timeline-gantt-bar--error) {
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.24);
}

.timeline-gantt-wrap :deep(.g-gantt-bar.timeline-gantt-bar.timeline-gantt-bar--selected) {
  box-shadow:
    0 0 0 2px rgba(37, 99, 235, 0.28),
    0 4px 10px rgba(15, 23, 42, 0.2);
}

.timeline-gantt-wrap :deep(.g-grid-row) {
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}
</style>
