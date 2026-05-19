alter table timeline_days
  add column if not exists load_percent int2 not null default 100;

alter table timeline_days
  add constraint timeline_days_load_check check (load_percent between 1 and 100);
