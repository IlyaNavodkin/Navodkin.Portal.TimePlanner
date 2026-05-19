import { getPgPool } from "../../../core/db/pg"
import type { Queryable } from "../../../core/db/queryable"
import type { TimelineReadRepository } from "../contracts/timeline-read.repository"
import type { GetTimelineFilter, TimelineView } from "../dto/timeline.dto"

interface TimelineReadRow {
  id: string
  project_external_id: string
  charge_external_id: string
  manager_external_id: string
  employee_external_id: string
  comment: string | null
  days: string[]
}

export class PgTimelineReadRepository implements TimelineReadRepository {
  constructor(private readonly db: Queryable = getPgPool()) {}

  async listByFilter(filter: GetTimelineFilter): Promise<TimelineView[]> {
    const projectIds = filter.projectIds?.length ? filter.projectIds : null
    const chargeIds = filter.chargeIds?.length ? filter.chargeIds : null

    const { rows } = await this.db.query<TimelineReadRow>(
      `
      select
        t.id,
        t.project_external_id,
        t.charge_external_id,
        t.manager_external_id,
        t.employee_external_id,
        t.comment,
        array_agg(td.work_date::text order by td.work_date) as days
      from timelines t
      inner join timeline_days td
        on td.timeline_id = t.id
      where
        t.manager_external_id = $1
        and td.work_date >= $2::date
        and td.work_date <= $3::date
        and ($4::text[] is null or t.project_external_id = any($4))
        and ($5::text[] is null or t.charge_external_id = any($5))
      group by
        t.id,
        t.project_external_id,
        t.charge_external_id,
        t.manager_external_id,
        t.employee_external_id,
        t.comment
      order by min(td.work_date), t.id
      `,
      [filter.managerId, filter.from, filter.to, projectIds, chargeIds],
    )

    return rows.map((row) => ({
      id: row.id,
      projectExternalId: row.project_external_id,
      chargeExternalId: row.charge_external_id,
      managerExternalId: row.manager_external_id,
      employeeExternalId: row.employee_external_id,
      comment: row.comment ?? undefined,
      days: row.days,
    }))
  }
}

