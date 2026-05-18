import type { GetTimelineFilter, TimelineView } from "../dto/timeline.dto"

export interface TimelineReadRepository {
  listByFilter(filter: GetTimelineFilter): Promise<TimelineView[]>
}

