import type {
  ChargeDto,
  CreateTimelineRequest,
  CreateTimelineResponse,
  DeleteTimelineResponse,
  EmployeeDto,
  GetChargesQuery,
  GetProjectsQuery,
  ManagerDto,
  ProjectDto,
  TimelineFilter,
  TimelineListResponse,
  UpdateTimelineRequest,
  UpdateTimelineResponse,
} from "~/features/timeline/types"

export async function getManagers(): Promise<ManagerDto[]> {
  return await $fetch<ManagerDto[]>("/api/managers")
}

export async function getEmployeesByManager(managerId: string): Promise<EmployeeDto[]> {
  return await $fetch<EmployeeDto[]>(`/api/managers/${encodeURIComponent(managerId)}/employees`)
}

export async function getProjects(query?: GetProjectsQuery): Promise<ProjectDto[]> {
  return await $fetch<ProjectDto[]>("/api/projects", {
    query,
  })
}

export async function getCharges(query?: GetChargesQuery): Promise<ChargeDto[]> {
  return await $fetch<ChargeDto[]>("/api/charges", {
    query,
  })
}

export async function getTimeline(query: TimelineFilter): Promise<TimelineListResponse> {
  return await $fetch<TimelineListResponse>("/api/timeline", {
    query,
  })
}

export async function createTimeline(payload: CreateTimelineRequest): Promise<CreateTimelineResponse> {
  return await $fetch<CreateTimelineResponse>("/api/timelines", {
    method: "POST",
    body: payload,
  })
}

export async function updateTimeline(
  id: string,
  payload: UpdateTimelineRequest,
): Promise<UpdateTimelineResponse> {
  return await $fetch<UpdateTimelineResponse>(`/api/timelines/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
  })
}

export async function deleteTimeline(id: string): Promise<DeleteTimelineResponse> {
  return await $fetch<DeleteTimelineResponse>(`/api/timelines/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}
