create extension if not exists "uuid-ossp";

create table if not exists schema_migrations (
  version int4 primary key,
  name text not null,
  up_file text not null unique,
  down_file text not null,
  applied_at timestamptz not null default now()
);
