create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_username_idx on public.users (username);
create index if not exists users_email_idx on public.users (email);

create table if not exists public.data_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  filename text not null,
  file_path text not null,
  rows integer not null,
  columns integer not null,
  column_info jsonb not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists data_files_user_id_idx on public.data_files (user_id);

create table if not exists public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  data_id uuid not null references public.data_files(id) on delete cascade,
  status text not null default 'pending',
  config jsonb not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists training_tasks_user_id_idx on public.training_tasks (user_id);
create index if not exists training_tasks_data_id_idx on public.training_tasks (data_id);
create index if not exists training_tasks_created_at_idx on public.training_tasks (created_at);

create table if not exists public.training_results (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.training_tasks(id) on delete cascade,
  r2_score double precision not null,
  rmse double precision not null,
  mae double precision not null,
  mape double precision not null,
  metrics jsonb not null,
  model_path text not null,
  plot_path text null,
  predictions jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists training_results_task_id_idx on public.training_results (task_id);

create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  epoch integer not null,
  train_loss double precision not null,
  val_loss double precision null,
  metrics jsonb null,
  logged_at timestamptz not null default now()
);

create index if not exists training_logs_task_id_idx on public.training_logs (task_id);
create index if not exists training_logs_epoch_idx on public.training_logs (epoch);

