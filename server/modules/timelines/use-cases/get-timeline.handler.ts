import type { TimelineReadRepository } from "../contracts/timeline-read.repository"
import { PgTimelineReadRepository } from "../data-access/timeline-read.pg"
import type { GetTimelineFilter, GetTimelineResponse } from "../dto/timeline.dto"

export class GetTimelineHandler {
  constructor(private readonly timelineReadRepository: TimelineReadRepository) {}

  async execute(filter: GetTimelineFilter): Promise<GetTimelineResponse> {
    return {
      timelines: await this.timelineReadRepository.listByFilter(filter),
    }
  }
}

let getTimelineHandlerSingleton: GetTimelineHandler | null = null

export function getTimelineHandler(): GetTimelineHandler {
  if (!getTimelineHandlerSingleton) {
    getTimelineHandlerSingleton = new GetTimelineHandler(new PgTimelineReadRepository())
  }

  return getTimelineHandlerSingleton
}

