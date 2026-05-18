<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue"

import type { CreateTimelineRequest, TimelineItemDto, UpdateTimelineRequest } from "~/features/timeline/types"

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

interface TimelineBlockLayout {
  id: string
  employeeName: string
  startIndex: number
  endIndex: number
  lane: number
}

interface CreateTimelineTrigger {
  row: TimelineGridRowModel
  day: string
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
const employeesLoading = state.employeesLoading

const managersError = state.managersError
const employeesError = state.employeesError
const projectsError = state.projectsError
const chargesError = state.chargesError
const timelinesError = state.timelinesError

const isBootstrapped = ref(false)
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const createSubmitting = ref(false)
const editSubmitting = ref(false)
const deleteSubmittingId = ref("")
const resizeSavingTimelineId = ref("")
const resizeSuccessTimelineId = ref("")
const resizeErrorTimelineId = ref("")
const resizeErrorToastId = ref<string | number | null>(null)
const formErrorMessage = ref("")

const createForm = reactive({
  projectExternalId: "",
  chargeExternalId: "",
  employeeExternalId: "",
  startDate: "",
  endDate: "",
  comment: "",
})

const editForm = reactive({
  id: "",
  employeeExternalId: "",
  startDate: "",
  endDate: "",
  comment: "",
})

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
        employeeName: timeline.employeeName,
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

const yearOptions = computed(() => {
  const currentYear = new Date().getFullYear()
  const options = [] as Array<{ label: string; value: number }>
  for (let step = -2; step <= 2; step += 1) {
    const value = currentYear + step
    options.push({
      label: String(value),
      value,
    })
  }
  return options
})

const employeeOptions = computed(() =>
  employees.value.map((item) => ({
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

const timelineById = computed(() => {
  const result = new Map<string, TimelineItemDto>()
  for (const timeline of timelines.value) {
    result.set(timeline.id, timeline)
  }
  return result
})

const timelineRows = computed<TimelineGridRowModel[]>(() => {
  if (!managerId.value) {
    return []
  }

  const timelinesByKey = new Map<string, TimelineItemDto[]>()
  for (const timeline of timelines.value) {
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
    const { blocks, lanesCount } = getTimelineLayouts(rowTimelines, dayToIndex.value)

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

function resetCreateForm(): void {
  const range = getYearRange(year.value)
  createForm.projectExternalId = projects.value[0]?.id ?? ""
  createForm.chargeExternalId = charges.value[0]?.id ?? ""
  createForm.employeeExternalId = employees.value[0]?.id ?? ""
  createForm.startDate = range.from
  createForm.endDate = range.from
  createForm.comment = ""
}

function openCreateModal(payload?: CreateTimelineTrigger): void {
  resetCreateForm()

  if (payload) {
    createForm.projectExternalId = payload.row.projectExternalId
    createForm.chargeExternalId = payload.row.chargeExternalId
    createForm.startDate = payload.day
    createForm.endDate = payload.day
  }

  if (!createForm.chargeExternalId && createForm.projectExternalId) {
    createForm.chargeExternalId =
      charges.value.find((item) => item.projectId === createForm.projectExternalId)?.id ?? ""
  }

  formErrorMessage.value = ""
  createModalOpen.value = true
}

function openEditModal(timelineId: string): void {
  const timeline = timelineById.value.get(timelineId)
  if (!timeline) {
    return
  }

  const sortedDays = sortIsoDays(timeline.days)
  const yearRange = getYearRange(year.value)
  editForm.id = timeline.id
  editForm.employeeExternalId = timeline.employeeExternalId
  editForm.startDate = sortedDays[0] ?? yearRange.from
  editForm.endDate = sortedDays[sortedDays.length - 1] ?? yearRange.to
  editForm.comment = ""
  formErrorMessage.value = ""
  editModalOpen.value = true
}

async function submitCreateTimeline(): Promise<void> {
  if (createSubmitting.value) {
    return
  }

  formErrorMessage.value = ""
  const days = getDaysInRange(createForm.startDate, createForm.endDate)

  if (!managerId.value) {
    formErrorMessage.value = "Выберите руководителя."
    return
  }

  if (!createForm.projectExternalId || !createForm.chargeExternalId || !createForm.employeeExternalId) {
    formErrorMessage.value = "Заполните проект, чардж и сотрудника."
    return
  }

  if (days.length === 0) {
    formErrorMessage.value = "Укажите валидный диапазон дней."
    return
  }

  const payload: CreateTimelineRequest = {
    projectExternalId: createForm.projectExternalId,
    chargeExternalId: createForm.chargeExternalId,
    managerExternalId: managerId.value,
    employeeExternalId: createForm.employeeExternalId,
    days,
    comment: createForm.comment.trim() || undefined,
  }

  createSubmitting.value = true
  try {
    await actions.createTimeline(payload)
    createModalOpen.value = false
  } catch (error) {
    formErrorMessage.value = error instanceof Error ? error.message : "Не удалось создать timeline."
  } finally {
    createSubmitting.value = false
  }
}

async function submitUpdateTimeline(): Promise<void> {
  if (editSubmitting.value || !editForm.id) {
    return
  }

  const timeline = timelineById.value.get(editForm.id)
  if (!timeline) {
    return
  }

  formErrorMessage.value = ""
  const payload: UpdateTimelineRequest = {}
  const days = getDaysInRange(editForm.startDate, editForm.endDate)
  if (days.length === 0) {
    formErrorMessage.value = "Укажите валидный диапазон дней."
    return
  }

  const currentDays = sortIsoDays(timeline.days)
  if (days.join("|") !== currentDays.join("|")) {
    payload.days = days
  }

  if (editForm.employeeExternalId && editForm.employeeExternalId !== timeline.employeeExternalId) {
    payload.employeeExternalId = editForm.employeeExternalId
  }

  const comment = editForm.comment.trim()
  if (comment) {
    payload.comment = comment
  }

  if (Object.keys(payload).length === 0) {
    formErrorMessage.value = "Нет изменений для сохранения."
    return
  }

  editSubmitting.value = true
  try {
    await actions.updateTimeline(editForm.id, payload)
    editModalOpen.value = false
  } catch (error) {
    formErrorMessage.value = error instanceof Error ? error.message : "Не удалось обновить timeline."
  } finally {
    editSubmitting.value = false
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
  } catch (error) {
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
    await actions.loadTimeline()
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
  resetCreateForm()
  isBootstrapped.value = true
})
</script>

<template>
  <div class="min-h-screen w-full space-y-4 px-3 py-4 md:px-5 lg:px-6">
    <UCard>
      <template #header>
        <h1 class="text-xl font-semibold">Timeline Planner</h1>
      </template>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Manager">
          <USelect
            v-model="managerId"
            :items="managerOptions"
            value-key="value"
            label-key="label"
            :loading="managersLoading"
            placeholder="Select manager"
          />
        </UFormField>

        <UFormField label="Year">
          <USelect
            v-model="year"
            :items="yearOptions"
            value-key="value"
            label-key="label"
            placeholder="Select year"
          />
        </UFormField>

        <div class="flex items-end">
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

    <TimelineGridVis
      :days="dayList"
      :rows="timelineRows"
      :saving-timeline-id="resizeSavingTimelineId"
      :success-timeline-id="resizeSuccessTimelineId"
      :error-timeline-id="resizeErrorTimelineId"
      @create="openCreateModal"
      @edit="openEditModal"
      @delete="deleteTimeline"
      @resize="resizeTimeline"
    />

    <UModal v-model:open="createModalOpen" title="Add Timeline">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="formErrorMessage" color="error" variant="soft" :description="formErrorMessage" />

          <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div class="text-sm">
              <span class="text-muted">Project: </span>
              <span class="font-medium text-highlighted">
                {{ projectNameById.get(createForm.projectExternalId) ?? createForm.projectExternalId }}
              </span>
            </div>
            <div class="text-sm">
              <span class="text-muted">Charge: </span>
              <span class="font-medium text-highlighted">
                {{ chargeNameById.get(createForm.chargeExternalId) ?? createForm.chargeExternalId }}
              </span>
            </div>
          </div>

          <UFormField label="Employee">
            <USelectMenu
              v-model="createForm.employeeExternalId"
              :items="employeeOptions"
              value-key="value"
              label-key="label"
              search-input
              :loading="employeesLoading"
              placeholder="Select employee"
            />
          </UFormField>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField label="Start date">
              <UInput v-model="createForm.startDate" type="date" />
            </UFormField>

            <UFormField label="End date">
              <UInput v-model="createForm.endDate" type="date" />
            </UFormField>
          </div>

          <UFormField label="Comment (optional)">
            <UTextarea v-model="createForm.comment" :rows="3" placeholder="Comment" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createModalOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="createSubmitting" @click="submitCreateTimeline">
            Create
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="editModalOpen" title="Edit Timeline">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="formErrorMessage" color="error" variant="soft" :description="formErrorMessage" />

          <UFormField label="Employee">
            <USelectMenu
              v-model="editForm.employeeExternalId"
              :items="employeeOptions"
              value-key="value"
              label-key="label"
              search-input
              :loading="employeesLoading"
              placeholder="Select employee"
            />
          </UFormField>

          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormField label="Start date">
              <UInput v-model="editForm.startDate" type="date" />
            </UFormField>

            <UFormField label="End date">
              <UInput v-model="editForm.endDate" type="date" />
            </UFormField>
          </div>

          <UFormField label="Comment (optional)">
            <UTextarea v-model="editForm.comment" :rows="3" placeholder="Comment" />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="editModalOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="editSubmitting" @click="submitUpdateTimeline">
            Update
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
