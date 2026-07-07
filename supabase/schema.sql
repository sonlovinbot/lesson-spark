-- Lumi — Supabase schema for per-user progress.
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.

-- 1) One progress row per user.
create table if not exists public.progress (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  xp          integer     not null default 0,
  streak      integer     not null default 0,
  last_active date,
  badges      text[]      not null default '{}',
  quests      jsonb       not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Row Level Security: each user can only read/write their own row.
alter table public.progress enable row level security;

drop policy if exists "progress_select_own" on public.progress;
create policy "progress_select_own"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "progress_insert_own" on public.progress;
create policy "progress_insert_own"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.progress;
create policy "progress_update_own"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Saved lessons history — one row per generated lesson.
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Untitled lesson',
  topic       text,
  level       text,
  source      text,                 -- the prompt/source the user pasted
  data        jsonb not null,       -- the full Lesson object
  created_at  timestamptz not null default now()
);

create index if not exists lessons_user_created_idx
  on public.lessons (user_id, created_at desc);

alter table public.lessons enable row level security;

drop policy if exists "lessons_select_own" on public.lessons;
create policy "lessons_select_own"
  on public.lessons for select
  using (auth.uid() = user_id);

drop policy if exists "lessons_insert_own" on public.lessons;
create policy "lessons_insert_own"
  on public.lessons for insert
  with check (auth.uid() = user_id);

drop policy if exists "lessons_delete_own" on public.lessons;
create policy "lessons_delete_own"
  on public.lessons for delete
  using (auth.uid() = user_id);
