export interface GetTimelineFilter {
  managerId: string
  from: string
  to: string
  projectIds?: string[]
  chargeIds?: string[]
}

export interface TimelineView {
  id: string
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  comment?: string
  days: string[]
}

export interface GetTimelineResponse {
  timelines: TimelineView[]
}

export interface CreateTimelineInput {
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  comment?: string
}

export interface CreateTimelineCommand {
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  days: string[]
  comment?: string
}

export interface UpdateTimelineCommand {
  id: string
  projectExternalId?: string
  chargeExternalId?: string
  managerExternalId?: string
  employeeExternalId?: string
  days?: string[]
  comment?: string
}

export interface UpdateTimelineMetaInput {
  projectExternalId?: string
  chargeExternalId?: string
  managerExternalId?: string
  employeeExternalId?: string
  comment?: string
}

export interface TimelineMeta {
  id: string
  projectExternalId: string
  chargeExternalId: string
  managerExternalId: string
  employeeExternalId: string
  comment?: string
}

