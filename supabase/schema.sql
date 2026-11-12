-- My Trading Journal — Supabase schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Privacy model: every row carries the owner's user id, and Row Level Security (RLS)
-- makes the database itself refuse any read or write of another user's rows — even if
-- someone calls the API directly with the public key.

-- ---------------------------------------------------------------- journal records
create table if not exists public.journal_records (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection  text        not null check (collection in ('plans','trades','checklists','psych','events','reflections')),
  id          text        not null,
  data        jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null,                 -- when the user changed it (from the device)
  server_updated_at timestamptz not null default now(), -- when the server received it (sync cursor)
  primary key (user_id, collection, id)
);

create index if not exists journal_records_sync_idx
  on public.journal_records (user_id, server_updated_at);

-- ---------------------------------------------------------------- per-user settings
create table if not exists public.journal_settings (
  user_id     uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb       not null,
  updated_at  timestamptz not null,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- server timestamps
create or replace function public.touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  new.user_id := auth.uid();   -- a user can never write a row for someone else
  return new;
end;
$$;

drop trigger if exists journal_records_touch on public.journal_records;
create trigger journal_records_touch
  before insert or update on public.journal_records
  for each row execute function public.touch_server_updated_at();

drop trigger if exists journal_settings_touch on public.journal_settings;
create trigger journal_settings_touch
  before insert or update on public.journal_settings
  for each row execute function public.touch_server_updated_at();

-- ---------------------------------------------------------------- Row Level Security
alter table public.journal_records  enable row level security;
alter table public.journal_settings enable row level security;

drop policy if exists "own records: select" on public.journal_records;
drop policy if exists "own records: insert" on public.journal_records;
drop policy if exists "own records: update" on public.journal_records;
drop policy if exists "own records: delete" on public.journal_records;
create policy "own records: select" on public.journal_records
  for select to authenticated using (user_id = auth.uid());
create policy "own records: insert" on public.journal_records
  for insert to authenticated with check (user_id = auth.uid());
create policy "own records: update" on public.journal_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own records: delete" on public.journal_records
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own settings: select" on public.journal_settings;
drop policy if exists "own settings: insert" on public.journal_settings;
drop policy if exists "own settings: update" on public.journal_settings;
drop policy if exists "own settings: delete" on public.journal_settings;
create policy "own settings: select" on public.journal_settings
  for select to authenticated using (user_id = auth.uid());
create policy "own settings: insert" on public.journal_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "own settings: update" on public.journal_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings: delete" on public.journal_settings
  for delete to authenticated using (user_id = auth.uid());

-- Anonymous (signed-out) visitors get nothing.
revoke all on public.journal_records  from anon;
revoke all on public.journal_settings from anon;
grant select, insert, update, delete on public.journal_records  to authenticated;
grant select, insert, update, delete on public.journal_settings to authenticated;

-- ---------------------------------------------------------------- delete my account
-- Lets a signed-in user permanently delete their own account and, through the
-- "on delete cascade" above, every journal row they own. It can only ever delete
-- the caller's own account.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
