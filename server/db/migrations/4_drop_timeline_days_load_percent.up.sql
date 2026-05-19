alter table timeline_days
  drop constraint if exists timeline_days_load_check;

alter table timeline_days
  drop column if exists load_percent;
