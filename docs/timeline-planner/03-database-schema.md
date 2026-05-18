# Схема БД PostgreSQL

## 1. Таблицы

### `timelines`
- `id uuid pk`
- `project_external_id text not null`
- `charge_external_id text not null`
- `manager_external_id text not null`
- `employee_external_id text not null`
- `employee_name_snapshot text null`
- `comment text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `timeline_days`
- `id uuid pk`
- `timeline_id uuid not null references timelines(id) on delete cascade`
- `work_date date not null`
- `load_percent int2 not null default 100`
- `created_at timestamptz not null default now()`

## 2. Ограничения
- `unique (timeline_id, work_date)` — в одном таймлайне один день не должен повторяться.
- `check (load_percent between 1 and 100)` — если нужна дневная загрузка.
- `project_external_id` и `charge_external_id` валидируются через внешний сервис на уровне backend.

Опционально (если запрещаем двойное назначение сотрудника):
- уникальность по сотруднику на день через денормализацию в `timeline_days` или триггер.

## 3. Индексы
- `timelines(project_external_id)`
- `timelines(charge_external_id)`
- `timelines(manager_external_id)`
- `timelines(employee_external_id)`
- `timelines(project_external_id, charge_external_id)`
- `timeline_days(work_date)`
- `timeline_days(timeline_id, work_date)`

## 4. Черновик SQL DDL
```sql
create extension if not exists "uuid-ossp";

create table if not exists timelines (
  id uuid primary key default uuid_generate_v4(),
  project_external_id text not null,
  charge_external_id text not null,
  manager_external_id text not null,
  employee_external_id text not null,
  employee_name_snapshot text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists timeline_days (
  id uuid primary key default uuid_generate_v4(),
  timeline_id uuid not null references timelines(id) on delete cascade,
  work_date date not null,
  load_percent int2 not null default 100,
  created_at timestamptz not null default now(),
  constraint timeline_days_unique unique (timeline_id, work_date),
  constraint timeline_days_load_check check (load_percent between 1 and 100)
);

create index if not exists idx_timelines_project_external_id on timelines(project_external_id);
create index if not exists idx_timelines_charge_external_id on timelines(charge_external_id);
create index if not exists idx_timelines_manager_external_id on timelines(manager_external_id);
create index if not exists idx_timelines_employee_external_id on timelines(employee_external_id);
create index if not exists idx_timelines_project_charge_external
  on timelines(project_external_id, charge_external_id);
create index if not exists idx_timeline_days_work_date on timeline_days(work_date);
create index if not exists idx_timeline_days_timeline_work_date on timeline_days(timeline_id, work_date);
```
