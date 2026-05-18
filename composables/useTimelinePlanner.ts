import { computed, ref } from "vue"

import type {
  ChargeDto,
  CreateTimelineRequest,
  CreateTimelineResponse,
  DeleteTimelineResponse,
  EmployeeDto,
  ManagerDto,
  ProjectDto,
  TimelineFilter,
  TimelineItemDto,
  TimelineListResponse,
  UpdateTimelineRequest,
  UpdateTimelineResponse,
} from "~/features/timeline/types"
import { useApiDataComposable } from "~/composables/useApiDataComposable"
import {
  createTimeline as createTimelineApi,
  deleteTimeline as deleteTimelineApi,
  getCharges,
  getEmployeesByManager,
  getManagers,
  getProjects,
  getTimeline,
  updateTimeline as updateTimelineApi,
} from "~/services/api/timeline.api"

function formatIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getDefaultRange(): Pick<TimelineFilter, "from" | "to"> {
  const today = new Date()
  const toDate = new Date(today)
  toDate.setDate(today.getDate() + 14)

  return {
    from: formatIsoDate(today),
    to: formatIsoDate(toDate),
  }
}

function getRangeByYear(year: number): Pick<TimelineFilter, "from" | "to"> {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

export function useTimelinePlanner() {
  const initialRange = getDefaultRange()
  const initialFromYear = Number(initialRange.from.slice(0, 4))

  const managerId = ref("")
  const year = ref(initialFromYear)

  const managersState = useApiDataComposable<ManagerDto[]>([])
  const employeesState = useApiDataComposable<EmployeeDto[]>([])
  const projectsState = useApiDataComposable<ProjectDto[]>([])
  const chargesState = useApiDataComposable<ChargeDto[]>([])
  const timelinesState = useApiDataComposable<TimelineListResponse>({ timelines: [] })

  async function loadTimeline(): Promise<TimelineListResponse> {
    if (!managerId.value) {
      timelinesState.reset({ timelines: [] })
      return timelinesState.data.value
    }

    const range = getRangeByYear(year.value)

    return await timelinesState.fetch(() =>
      getTimeline({
        managerId: managerId.value,
        from: range.from,
        to: range.to,
      }),
    )
  }

  async function loadInitial(): Promise<void> {
    await Promise.all([
      managersState.fetch(() => getManagers()),
      projectsState.fetch(() => getProjects()),
      chargesState.fetch(() => getCharges()),
    ])

    if (!managerId.value && managersState.data.value.length > 0) {
      managerId.value = managersState.data.value[0].id
    }

    if (managerId.value) {
      await employeesState.fetch(() => getEmployeesByManager(managerId.value))
    } else {
      employeesState.reset([])
    }

    await loadTimeline()
  }

  async function loadEmployeesByManager(nextManagerId: string): Promise<EmployeeDto[]> {
    if (!nextManagerId) {
      employeesState.reset([])
      return employeesState.data.value
    }

    return await employeesState.fetch(() => getEmployeesByManager(nextManagerId))
  }

  async function createTimeline(payload: CreateTimelineRequest): Promise<CreateTimelineResponse> {
    const result = await createTimelineApi(payload)
    await loadTimeline()
    return result
  }

  async function updateTimeline(
    id: string,
    payload: UpdateTimelineRequest,
  ): Promise<UpdateTimelineResponse> {
    const result = await updateTimelineApi(id, payload)
    await loadTimeline()
    return result
  }

  async function deleteTimeline(id: string): Promise<DeleteTimelineResponse> {
    const result = await deleteTimelineApi(id)
    await loadTimeline()
    return result
  }

  return {
    state: {
      managerId,
      year,
      managers: managersState.data,
      employees: employeesState.data,
      projects: projectsState.data,
      charges: chargesState.data,
      timelines: computed<TimelineItemDto[]>(() => timelinesState.data.value.timelines),
      managersLoading: managersState.loading,
      employeesLoading: employeesState.loading,
      projectsLoading: projectsState.loading,
      chargesLoading: chargesState.loading,
      timelinesLoading: timelinesState.loading,
      managersError: managersState.error,
      employeesError: employeesState.error,
      projectsError: projectsState.error,
      chargesError: chargesState.error,
      timelinesError: timelinesState.error,
    },
    actions: {
      loadInitial,
      loadEmployeesByManager,
      loadTimeline,
      createTimeline,
      updateTimeline,
      deleteTimeline,
    },
  }
}
