import type { CreateTimelineInput, TimelineMeta, UpdateTimelineMetaInput } from "../dto/timeline.dto"

export interface TimelineMutateRepository {
  findTimelineById(id: string): Promise<TimelineMeta | null>
  createTimeline(input: CreateTimelineInput): Promise<{ id: string }>
  updateTimeline(id: string, input: UpdateTimelineMetaInput): Promise<void>
  replaceTimelineDays(timelineId: string, days: string[]): Promise<void>
  deleteTimeline(id: string): Promise<void>
}
