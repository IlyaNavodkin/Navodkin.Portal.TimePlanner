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
