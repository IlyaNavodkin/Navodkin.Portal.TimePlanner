export interface TimelineGridBlockModel {
  id: string
  employeeName: string
  comment?: string
  startIndex: number
  endIndex: number
  lane: number
}

export interface TimelineGridRowModel {
  id: string
  projectExternalId: string
  chargeExternalId: string
  projectName: string
  chargeName: string
  label: string
  lanesCount: number
  blocks: TimelineGridBlockModel[]
}

export interface TimelineProjectGroupModel {
  projectExternalId: string
  projectName: string
  rows: TimelineGridRowModel[]
}

export interface TimelineCreatePayloadModel {
  row: TimelineGridRowModel
  day: string
  startDay?: string
  endDay?: string
  employeeName?: string
  comment?: string
}

export interface TimelineResizePayloadModel {
  timelineId: string
  days: string[]
}

export interface TimelineUpdatePayloadModel {
  timelineId: string
  employeeName: string
  comment: string
  startDay: string
  endDay: string
}

export interface TimelineFilterOptionModel {
  label: string
  value: string
}

export interface TimelineBarCommitModel {
  timelineId: string
  startIndex: number
  endIndex: number
}

export type TimelineZoomPreset = "1w" | "1m" | "3m" | "1y"
