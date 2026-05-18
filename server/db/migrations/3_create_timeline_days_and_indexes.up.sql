create table if not exists timeline_days (
  id uuid primary key default uuid_generate_v4(),
  timeline_id uuid not null references timelines(id) on delete cascade,
  work_date date not null,
  load_percent int2 not null default 100,
  created_at timestamptz not null default now(),
  constraint timeline_days_unique unique (timeline_id, work_date),
  constraint timeline_days_load_check check (load_percent between 1 and 100)
);

create index if not exists idx_timelines_project_external_id
  on timelines(project_external_id);
create index if not exists idx_timelines_charge_external_id
  on timelines(charge_external_id);
create index if not exists idx_timelines_manager_external_id
  on timelines(manager_external_id);
create index if not exists idx_timelines_employee_external_id
  on timelines(employee_external_id);
create index if not exists idx_timelines_project_charge_external
  on timelines(project_external_id, charge_external_id);
create index if not exists idx_timeline_days_work_date
  on timeline_days(work_date);
create index if not exists idx_timeline_days_timeline_work_date
  on timeline_days(timeline_id, work_date);
