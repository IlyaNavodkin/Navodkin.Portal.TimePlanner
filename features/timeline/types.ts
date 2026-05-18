export type IsoDate = string

export interface ManagerDto {
  id: string
  name: string
}

export interface EmployeeDto {
  id: string
  name: string
  managerId: string
}

export interface ProjectDto {
  id: string
  name: string
}

export interface ChargeDto {
  id: string
  name: string
  projectId: string
}

export interface TimelineFilter {
  managerId: string
  from: IsoDate
  to: IsoDate
}

export interface GetProjectsQuery {
  search?: string
}

export interface GetChargesQuery {
  projectIds?: string[]
  search?: string
}

export interface TimelineItemDto {
  id: string
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  employeeName: string
  days: IsoDate[]
}

export interface TimelineListResponse {
  timelines: TimelineItemDto[]
}

export interface CreateTimelineRequest {
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  days: IsoDate[]
  comment?: string
}

export interface CreateTimelineResponse {
  id: string
}

export interface UpdateTimelineRequest {
  projectExternalId?: string
  chargeExternalId?: string
  managerExternalId?: string
  employeeExternalId?: string
  days?: IsoDate[]
  comment?: string
}

export interface UpdateTimelineResponse {
  id: string
}

export interface DeleteTimelineResponse {
  id: string
}
