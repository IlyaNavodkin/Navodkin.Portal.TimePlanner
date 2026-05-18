"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgTimelineMutateRepository = void 0;
const pg_1 = require("../../../core/db/pg");
class PgTimelineMutateRepository {
    db;
    constructor(db = (0, pg_1.getPgPool)()) {
        this.db = db;
    }
    async findTimelineById(id) {
        const { rows } = await this.db.query(`
      select
        id,
        project_external_id,
        charge_external_id,
        manager_external_id,
        employee_external_id,
        employee_name_snapshot,
        comment
      from timelines
      where id = $1
      limit 1
      `, [id]);
        const row = rows[0];
        if (!row) {
            return null;
        }
        return {
            id: row.id,
            projectExternalId: row.project_external_id,
            chargeExternalId: row.charge_external_id,
            managerExternalId: row.manager_external_id,
            employeeExternalId: row.employee_external_id,
            employeeName: row.employee_name_snapshot ?? undefined,
            comment: row.comment ?? undefined,
        };
    }
    async createTimeline(input) {
        const { rows } = await this.db.query(`
      insert into timelines (
        project_external_id,
        charge_external_id,
        manager_external_id,
        employee_external_id,
        employee_name_snapshot,
        comment
      )
      values ($1, $2, $3, $4, $5, $6)
      returning id
      `, [
            input.projectExternalId,
            input.chargeExternalId,
            input.managerExternalId,
            input.employeeExternalId,
            input.employeeName ?? null,
            input.comment ?? null,
        ]);
        return { id: rows[0].id };
    }
    async updateTimeline(id, input) {
        const updates = [];
        const values = [];
        if (input.projectExternalId !== undefined) {
            values.push(input.projectExternalId);
            updates.push(`project_external_id = $${values.length}`);
        }
        if (input.chargeExternalId !== undefined) {
            values.push(input.chargeExternalId);
            updates.push(`charge_external_id = $${values.length}`);
        }
        if (input.managerExternalId !== undefined) {
            values.push(input.managerExternalId);
            updates.push(`manager_external_id = $${values.length}`);
        }
        if (input.employeeExternalId !== undefined) {
            values.push(input.employeeExternalId);
            updates.push(`employee_external_id = $${values.length}`);
        }
        if (input.employeeName !== undefined) {
            values.push(input.employeeName);
            updates.push(`employee_name_snapshot = $${values.length}`);
        }
        if (input.comment !== undefined) {
            values.push(input.comment);
            updates.push(`comment = $${values.length}`);
        }
        if (updates.length === 0) {
            return;
        }
        values.push(id);
        await this.db.query(`
      update timelines
      set
        ${updates.join(",\n        ")},
        updated_at = now()
      where id = $${values.length}
      `, values);
    }
    async replaceTimelineDays(timelineId, days) {
        await this.db.query("delete from timeline_days where timeline_id = $1", [timelineId]);
        if (days.length > 0) {
            const values = days.map((_, index) => `($1, $${index + 2}::date, 100)`).join(", ");
            await this.db.query(`
        insert into timeline_days (timeline_id, work_date, load_percent)
        values ${values}
        `, [timelineId, ...days]);
        }
        await this.db.query("update timelines set updated_at = now() where id = $1", [timelineId]);
    }
    async deleteTimeline(id) {
        await this.db.query("delete from timelines where id = $1", [id]);
    }
}
exports.PgTimelineMutateRepository = PgTimelineMutateRepository;
