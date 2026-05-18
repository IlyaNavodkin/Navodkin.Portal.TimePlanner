<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue"
import { addIsoDays, getDaysFromIndexes, clampNumber, toIsoDateUtc } from "~/composables/my-test-timeline/useMyTimelineDate"
import { useMyTimelineFilters } from "~/composables/my-test-timeline/useMyTimelineFilters"
import { useMyTimelineHierarchy } from "~/composables/my-test-timeline/useMyTimelineHierarchy"
import { useMyTimelineAdaptiveWidth } from "~/composables/my-test-timeline/useMyTimelineAdaptiveWidth"
import MyTimelineToolbar from "~/components/my-test-timeline/MyTimelineToolbar.vue"
import MyTimelineHeader from "~/components/my-test-timeline/MyTimelineHeader.vue"
import MyTimelineProjectRow from "~/components/my-test-timeline/MyTimelineProjectRow.vue"
import MyTimelineChargeRow from "~/components/my-test-timeline/MyTimelineChargeRow.vue"
import type {
  TimelineBarCommitModel,
  TimelineCreatePayloadModel,
  TimelineGridBlockModel,
  TimelineGridRowModel,
  TimelineResizePayloadModel,
  TimelineUpdatePayloadModel,
  TimelineZoomPreset,
} from "~/composables/my-test-timeline/types"

interface TimelineRenderRowProject {
  kind: "project"
  key: string
  projectExternalId: string
  projectName: string
  chargesCount: number
  rowHeightPx: number
}

interface TimelineRenderRowCharge {
  kind: "charge"
  key: string
  row: TimelineGridRowModel
  rowHeightPx: number
}

type TimelineRenderRow = TimelineRenderRowProject | TimelineRenderRowCharge

interface TimelineEditFormState {
  employeeName: string
  comment: string
  startDay: string
  endDay: string
}

interface TimelineCreateFormState {
  employeeName: string
  comment: string
  startDay: string
  endDay: string
}

const props = withDefaults(
  defineProps<{
    days: string[]
    rows: TimelineGridRowModel[]
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
  create: [payload: TimelineCreatePayloadModel]
  delete: [timelineId: string]
  resize: [payload: TimelineResizePayloadModel]
  update: [payload: TimelineUpdatePayloadModel]
}>()

const LABEL_COLUMN_WIDTH = 320
const LANE_HEIGHT = 38
const PROJECT_ROW_HEIGHT = 42
const YEAR_ALL_VALUE = "all"
const ZOOM_PRESETS: TimelineZoomPreset[] = ["1w", "1m", "3m", "1y"]
const PX_PER_DAY_BY_ZOOM: Record<TimelineZoomPreset, number> = {
  "1w": 56,
  "1m": 28,
  "3m": 12,
  "1y": 4,
}

const rowsRef = computed(() => props.rows)
const daysRef = computed(() => props.days)
const selectedTimelineId = ref("")
const graphScrollRef = ref<HTMLElement | null>(null)
const activeZoomPreset = ref<TimelineZoomPreset>("1m")
const selectedYear = ref(YEAR_ALL_VALUE)
const createModalOpen = ref(false)
const createFormError = ref("")
const createTargetRow = ref<TimelineGridRowModel | null>(null)
const createForm = ref<TimelineCreateFormState>({
  employeeName: "",
  comment: "",
  startDay: "",
  endDay: "",
})
const editModalOpen = ref(false)
const editFormError = ref("")
const editTimelineId = ref("")
const editForm = ref<TimelineEditFormState>({
  employeeName: "",
  comment: "",
  startDay: "",
  endDay: "",
})
const yearOptions = computed(() => {
  const years = new Set<string>()
  for (const day of props.days) {
    years.add(day.slice(0, 4))
  }

  const sortedYears = [...years].sort((left, right) => left.localeCompare(right))
  return [
    { label: "All years", value: YEAR_ALL_VALUE },
    ...sortedYears.map((year) => ({
      label: year,
      value: year,
    })),
  ]
})

const selectedYearBounds = computed((): { start: number; end: number } => {
  if (selectedYear.value === YEAR_ALL_VALUE) {
    return {
      start: 0,
      end: Math.max(0, props.days.length - 1),
    }
  }

  const yearPrefix = `${selectedYear.value}-`
  let start = -1
  let end = -1

  for (let index = 0; index < props.days.length; index += 1) {
    if (!props.days[index]?.startsWith(yearPrefix)) {
      continue
    }

    if (start < 0) {
      start = index
    }
    end = index
  }

  if (start < 0 || end < 0) {
    return { start: 0, end: -1 }
  }

  return { start, end }
})

const viewStartIndex = computed(() => selectedYearBounds.value.start)
const viewEndIndex = computed(() => selectedYearBounds.value.end)
const visibleDays = computed(() => {
  if (selectedYearBounds.value.end < selectedYearBounds.value.start) {
    return []
  }

  return props.days.slice(selectedYearBounds.value.start, selectedYearBounds.value.end + 1)
})
const basePxPerDay = computed(() => PX_PER_DAY_BY_ZOOM[activeZoomPreset.value])

const {
  selectedProjectId,
  selectedChargeId,
  projectOptions,
  chargeOptions,
  filteredRows,
  resetFilters,
} = useMyTimelineFilters(rowsRef)

const {
  groupedRows,
  isProjectCollapsed,
  toggleProject,
  collapseAllProjects,
  expandAllProjects,
} = useMyTimelineHierarchy(filteredRows)

const {
  effectivePxPerDay,
  canvasMinWidthPx,
} = useMyTimelineAdaptiveWidth({
  viewportRef: graphScrollRef,
  labelColumnWidth: 0,
  visibleDays,
  basePxPerDay,
})

const timelinesCount = computed(() =>
  filteredRows.value.reduce((sum, row) => sum + row.blocks.length, 0),
)

const renderRows = computed<TimelineRenderRow[]>(() => {
  const rows: TimelineRenderRow[] = []

  for (const group of groupedRows.value) {
    rows.push({
      kind: "project",
      key: `project::${group.projectExternalId}`,
      projectExternalId: group.projectExternalId,
      projectName: group.projectName,
      chargesCount: group.rows.length,
      rowHeightPx: PROJECT_ROW_HEIGHT,
    })

    if (isProjectCollapsed(group.projectExternalId)) {
      continue
    }

    for (const row of group.rows) {
      rows.push({
        kind: "charge",
        key: `charge::${row.id}`,
        row,
        rowHeightPx: LANE_HEIGHT,
      })
    }
  }

  return rows
})

const rightCanvasMinWidthPx = computed(() => Math.max(1, canvasMinWidthPx.value))

function updateSelectedProjectId(value: string): void {
  selectedProjectId.value = value
}

function updateSelectedChargeId(value: string): void {
  selectedChargeId.value = value
}

function updateSelectedYear(value: string): void {
  selectedYear.value = value
}

function handleResizeCommit(payload: TimelineBarCommitModel): void {
  const timeline = findTimeline(payload.timelineId)
  if (!timeline) {
    return
  }

  if (timeline.startIndex === payload.startIndex && timeline.endIndex === payload.endIndex) {
    return
  }

  const days = getDaysFromIndexes(props.days, payload.startIndex, payload.endIndex)
  if (days.length === 0) {
    return
  }

  emit("resize", {
    timelineId: payload.timelineId,
    days,
  })
}

function findTimeline(timelineId: string): { startIndex: number; endIndex: number } | null {
  const hit = findTimelineInRows(timelineId)
  if (!hit) {
    return null
  }

  return {
    startIndex: hit.block.startIndex,
    endIndex: hit.block.endIndex,
  }
}

function findTimelineInRows(timelineId: string): { row: TimelineGridRowModel; block: TimelineGridBlockModel } | null {
  for (const row of props.rows) {
    const block = row.blocks.find((item) => item.id === timelineId)
    if (!block) {
      continue
    }
    return { row, block }
  }
  return null
}

function openEditDialog(timelineId: string): void {
  const hit = findTimelineInRows(timelineId)
  if (!hit) {
    return
  }

  const startDay = props.days[hit.block.startIndex] ?? ""
  const endDay = props.days[hit.block.endIndex] ?? ""
  if (!startDay || !endDay) {
    return
  }

  selectedTimelineId.value = timelineId
  editTimelineId.value = timelineId
  editFormError.value = ""
  editForm.value = {
    employeeName: hit.block.employeeName,
    comment: hit.block.comment ?? "",
    startDay,
    endDay,
  }
  editModalOpen.value = true
}

function closeEditDialog(): void {
  editModalOpen.value = false
  editFormError.value = ""
}

function submitEditDialog(): void {
  const timelineId = editTimelineId.value
  if (!timelineId) {
    return
  }

  const employeeName = editForm.value.employeeName.trim()
  if (!employeeName) {
    editFormError.value = "Employee is required."
    return
  }

  const startIndex = props.days.findIndex((day) => day === editForm.value.startDay)
  const endIndex = props.days.findIndex((day) => day === editForm.value.endDay)
  if (startIndex < 0 || endIndex < 0) {
    editFormError.value = "Dates must be inside visible timeline range."
    return
  }

  if (startIndex > endIndex) {
    editFormError.value = "Start date must be earlier than or equal to end date."
    return
  }

  emit("update", {
    timelineId,
    employeeName,
    comment: editForm.value.comment.trim(),
    startDay: editForm.value.startDay,
    endDay: editForm.value.endDay,
  })

  editModalOpen.value = false
  editFormError.value = ""
}

function openCreateDialog(payload: TimelineCreatePayloadModel): void {
  const startDay = payload.day
  const endDayCandidate = addIsoDays(startDay, 1)
  const lastDay = visibleDays.value[visibleDays.value.length - 1] ?? startDay

  createTargetRow.value = payload.row
  createFormError.value = ""
  createForm.value = {
    employeeName: "",
    comment: "",
    startDay,
    endDay: endDayCandidate > lastDay ? lastDay : endDayCandidate,
  }
  createModalOpen.value = true
}

function closeCreateDialog(): void {
  createModalOpen.value = false
  createFormError.value = ""
}

function submitCreateDialog(): void {
  const row = createTargetRow.value
  if (!row) {
    return
  }

  const employeeName = createForm.value.employeeName.trim()
  if (!employeeName) {
    createFormError.value = "Employee is required."
    return
  }

  const startIndex = props.days.findIndex((day) => day === createForm.value.startDay)
  const endIndex = props.days.findIndex((day) => day === createForm.value.endDay)
  if (startIndex < 0 || endIndex < 0) {
    createFormError.value = "Dates must be inside visible timeline range."
    return
  }

  if (startIndex > endIndex) {
    createFormError.value = "Start date must be earlier than or equal to end date."
    return
  }

  emit("create", {
    row,
    day: createForm.value.startDay,
    startDay: createForm.value.startDay,
    endDay: createForm.value.endDay,
    employeeName,
    comment: createForm.value.comment.trim(),
  })

  createModalOpen.value = false
  createFormError.value = ""
}

function onWheelZoom(event: WheelEvent): void {
  event.preventDefault()

  const currentIndex = ZOOM_PRESETS.indexOf(activeZoomPreset.value)
  if (currentIndex < 0) {
    return
  }

  const direction = event.deltaY < 0 ? -1 : 1
  const nextIndex = clampNumber(currentIndex + direction, 0, ZOOM_PRESETS.length - 1)
  if (nextIndex === currentIndex) {
    return
  }

  activeZoomPreset.value = ZOOM_PRESETS[nextIndex]
}

function panLeft(): void {
  const viewport = graphScrollRef.value
  if (!viewport) {
    return
  }

  viewport.scrollBy({ left: -Math.round(viewport.clientWidth * 0.6), behavior: "smooth" })
}

function panRight(): void {
  const viewport = graphScrollRef.value
  if (!viewport) {
    return
  }

  viewport.scrollBy({ left: Math.round(viewport.clientWidth * 0.6), behavior: "smooth" })
}

async function panToToday(): Promise<void> {
  const viewport = graphScrollRef.value
  if (!viewport) {
    return
  }

  const today = toIsoDateUtc(new Date())
  const todayIndex = daysRef.value.findIndex((day) => day === today)
  if (todayIndex < 0 || todayIndex < viewStartIndex.value || todayIndex > viewEndIndex.value) {
    viewport.scrollTo({ left: 0, behavior: "smooth" })
    return
  }

  await nextTick()
  const targetLeft = Math.max(
    0,
    (todayIndex - viewStartIndex.value) * effectivePxPerDay.value - viewport.clientWidth / 2,
  )
  viewport.scrollTo({ left: targetLeft, behavior: "smooth" })
}

function setZoomPreset(nextPreset: TimelineZoomPreset): void {
  activeZoomPreset.value = nextPreset
}

onMounted(() => {
  void panToToday()
})
</script>

<template>
  <UCard class="my-test-timeline-view">
    <template #header>
      <MyTimelineToolbar
        :project-options="projectOptions"
        :charge-options="chargeOptions"
        :year-options="yearOptions"
        :selected-project-id="selectedProjectId"
        :selected-charge-id="selectedChargeId"
        :selected-year="selectedYear"
        :active-zoom-preset="activeZoomPreset"
        :projects-count="groupedRows.length"
        :charges-count="filteredRows.length"
        :timelines-count="timelinesCount"
        @update:selected-project-id="updateSelectedProjectId"
        @update:selected-charge-id="updateSelectedChargeId"
        @update:selected-year="updateSelectedYear"
        @reset-filters="resetFilters"
        @set-zoom="setZoomPreset($event)"
        @pan-left="panLeft"
        @pan-right="panRight"
        @pan-today="panToToday"
        @expand-all="expandAllProjects"
        @collapse-all="collapseAllProjects"
      />
    </template>

    <div v-if="days.length === 0" class="rounded-md border border-default px-4 py-6 text-sm text-muted">
      Set a valid date range.
    </div>

    <div v-else-if="visibleDays.length === 0" class="rounded-md border border-default px-4 py-6 text-sm text-muted">
      No days available for selected year.
    </div>

    <div v-else-if="filteredRows.length === 0" class="rounded-md border border-default px-4 py-6 text-sm text-muted">
      No timeline rows for selected filters.
    </div>

    <div v-else class="my-timeline-shell">
      <div class="my-timeline-left">
        <div class="my-timeline-left__header">
          <div class="text-xs font-semibold uppercase tracking-wide text-toned">Project / Charge</div>
          <div class="text-[11px] text-muted">Rows: {{ renderRows.length }}</div>
        </div>

        <template v-for="item in renderRows" :key="`left-${item.key}`">
          <MyTimelineProjectRow
            v-if="item.kind === 'project'"
            mode="label"
            :project-name="item.projectName"
            :charges-count="item.chargesCount"
            :collapsed="isProjectCollapsed(item.projectExternalId)"
            :label-column-width="LABEL_COLUMN_WIDTH"
            :row-height-px="item.rowHeightPx"
            @toggle="toggleProject(item.projectExternalId)"
          />

          <MyTimelineChargeRow
            v-else
            mode="label"
            :row="item.row"
            :days="days"
            :view-start-index="viewStartIndex"
            :view-end-index="viewEndIndex"
            :px-per-day="effectivePxPerDay"
            :label-column-width="LABEL_COLUMN_WIDTH"
            :lane-height="LANE_HEIGHT"
            :selected-timeline-id="selectedTimelineId"
            :saving-timeline-id="savingTimelineId"
            :success-timeline-id="successTimelineId"
            :error-timeline-id="errorTimelineId"
          />
        </template>
      </div>

      <div class="my-timeline-right">
        <div
          ref="graphScrollRef"
          class="my-timeline-right__scroll"
          @wheel="onWheelZoom"
        >
          <div class="my-timeline-right__canvas" :style="{ minWidth: `${rightCanvasMinWidthPx}px` }">
            <MyTimelineHeader
              :visible-days="visibleDays"
              :px-per-day="effectivePxPerDay"
              :active-zoom-preset="activeZoomPreset"
            />

            <template v-for="item in renderRows" :key="`right-${item.key}`">
              <MyTimelineProjectRow
                v-if="item.kind === 'project'"
                mode="track"
                :project-name="item.projectName"
                :charges-count="item.chargesCount"
                :collapsed="isProjectCollapsed(item.projectExternalId)"
                :label-column-width="LABEL_COLUMN_WIDTH"
                :row-height-px="item.rowHeightPx"
              />

              <MyTimelineChargeRow
                v-else
                mode="track"
                :row="item.row"
                :days="days"
                :view-start-index="viewStartIndex"
                :view-end-index="viewEndIndex"
                :px-per-day="effectivePxPerDay"
                :label-column-width="LABEL_COLUMN_WIDTH"
                :lane-height="LANE_HEIGHT"
                :selected-timeline-id="selectedTimelineId"
                :saving-timeline-id="savingTimelineId"
                :success-timeline-id="successTimelineId"
                :error-timeline-id="errorTimelineId"
                @create="openCreateDialog"
                @resize="handleResizeCommit"
                @edit="openEditDialog"
                @delete="emit('delete', $event)"
                @select="selectedTimelineId = $event"
              />
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="my-test-timeline-view__footer text-xs text-muted">
      Rows on screen: {{ renderRows.length }}.
      Hover empty day cells and click + to create a new bar.
      Wheel zoom is enabled over timeline body.
    </div>

    <UModal v-model:open="createModalOpen" title="Create timeline">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="createFormError" color="error" variant="soft" :description="createFormError" />

          <div v-if="createTargetRow" class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div class="text-sm">
              <span class="text-muted">Project: </span>
              <span class="font-medium text-highlighted">{{ createTargetRow.projectName }}</span>
            </div>
            <div class="text-sm">
              <span class="text-muted">Charge: </span>
              <span class="font-medium text-highlighted">{{ createTargetRow.chargeName }}</span>
            </div>
          </div>

          <UFormField label="Employee">
            <UInput v-model="createForm.employeeName" placeholder="Employee name" />
          </UFormField>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField label="Start date">
              <UInput v-model="createForm.startDay" type="date" />
            </UFormField>

            <UFormField label="End date">
              <UInput v-model="createForm.endDay" type="date" />
            </UFormField>
          </div>

          <UFormField label="Comment">
            <UTextarea v-model="createForm.comment" :rows="3" placeholder="Comment" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeCreateDialog">Cancel</UButton>
          <UButton color="primary" @click="submitCreateDialog">Create</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editModalOpen" title="Edit timeline">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="editFormError" color="error" variant="soft" :description="editFormError" />

          <UFormField label="Employee">
            <UInput v-model="editForm.employeeName" placeholder="Employee name" />
          </UFormField>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField label="Start date">
              <UInput v-model="editForm.startDay" type="date" />
            </UFormField>

            <UFormField label="End date">
              <UInput v-model="editForm.endDay" type="date" />
            </UFormField>
          </div>

          <UFormField label="Comment">
            <UTextarea v-model="editForm.comment" :rows="3" placeholder="Comment" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="closeEditDialog">Cancel</UButton>
          <UButton color="primary" @click="submitEditDialog">Save</UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<style scoped>
.my-test-timeline-view {
  min-height: calc(100vh - 180px);
}

.my-timeline-shell {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  overflow: hidden;
}

.my-timeline-left {
  border-right: 1px solid var(--ui-border);
  background: var(--ui-bg);
}

.my-timeline-left__header {
  height: 57px;
  border-bottom: 1px solid var(--ui-border);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--ui-bg);
  box-sizing: border-box;
}

.my-timeline-right {
  min-width: 0;
}

.my-timeline-right__scroll {
  overflow: auto hidden;
}

.my-timeline-right__canvas {
  min-width: 100%;
}

.my-test-timeline-view__footer {
  margin-top: 8px;
}
</style>
