-- My Trading Journal — admin approval for new accounts
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- (after schema.sql and admin.sql). Safe to run again.
--
-- How it works:
--   * Every new account (email or Google) starts as "pending".
--   * Accounts that existed before this file was run are marked "approved".
--   * Until an admin approves it, the database refuses to read or write that account's
--     journal rows, so approval cannot be skipped by calling the API directly.
--   * Admins are always treated as approved.

-- ---------------------------------------------------------------- approvals list
create table if not exists public.account_approvals (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users (id) on delete set null
);
alter table public.account_approvals enable row level security;
revoke all on public.account_approvals from public, anon, authenticated;

-- Everyone who already has an account keeps access.
insert into public.account_approvals (user_id, status, requested_at, decided_at)
select id, 'approved', created_at, now() from auth.users
on conflict (user_id) do nothing;

-- New accounts start as pending.
create or replace function public.handle_new_account_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_approvals (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_approval on auth.users;
create trigger on_auth_user_created_approval
  after insert on auth.users
  for each row execute function public.handle_new_account_approval();

-- ---------------------------------------------------------------- the caller's status
create or replace function public.my_approval_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'pending'
    when exists (select 1 from public.app_admins where user_id = auth.uid()) then 'approved'
    else coalesce(
      (select status from public.account_approvals where user_id = auth.uid()),
      'pending'
    )
  end;
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_approval_status() = 'approved';
$$;

-- ---------------------------------------------------------------- journal access needs approval
drop policy if exists "own records: select" on public.journal_records;
drop policy if exists "own records: insert" on public.journal_records;
drop policy if exists "own records: update" on public.journal_records;
drop policy if exists "own records: delete" on public.journal_records;
create policy "own records: select" on public.journal_records
  for select to authenticated using (user_id = auth.uid() and (select public.is_approved()));
create policy "own records: insert" on public.journal_records
  for insert to authenticated with check (user_id = auth.uid() and (select public.is_approved()));
create policy "own records: update" on public.journal_records
  for update to authenticated
  using (user_id = auth.uid() and (select public.is_approved()))
  with check (user_id = auth.uid() and (select public.is_approved()));
create policy "own records: delete" on public.journal_records
  for delete to authenticated using (user_id = auth.uid() and (select public.is_approved()));

drop policy if exists "own settings: select" on public.journal_settings;
drop policy if exists "own settings: insert" on public.journal_settings;
drop policy if exists "own settings: update" on public.journal_settings;
drop policy if exists "own settings: delete" on public.journal_settings;
create policy "own settings: select" on public.journal_settings
  for select to authenticated using (user_id = auth.uid() and (select public.is_approved()));
create policy "own settings: insert" on public.journal_settings
  for insert to authenticated with check (user_id = auth.uid() and (select public.is_approved()));
create policy "own settings: update" on public.journal_settings
  for update to authenticated
  using (user_id = auth.uid() and (select public.is_approved()))
  with check (user_id = auth.uid() and (select public.is_approved()));
create policy "own settings: delete" on public.journal_settings
  for delete to authenticated using (user_id = auth.uid() and (select public.is_approved()));

-- ---------------------------------------------------------------- admin: approve / reject
create or replace function public.admin_set_approval(target uuid, approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  insert into public.account_approvals (user_id, status, decided_at, decided_by)
  values (target, case when approve then 'approved' else 'rejected' end, now(), auth.uid())
  on conflict (user_id) do update
    set status = excluded.status, decided_at = excluded.decided_at, decided_by = excluded.decided_by;
end;
$$;

-- How many sign-ups are waiting (for the admin's notification badge).
create or replace function public.admin_pending_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  return (
    select count(*)::integer
    from public.account_approvals a
    join auth.users u on u.id = a.user_id
    where a.status = 'pending'
      and not exists (select 1 from public.app_admins ad where ad.user_id = a.user_id)
  );
end;
$$;

-- ---------------------------------------------------------------- permissions
revoke all on function public.handle_new_account_approval()    from public, anon, authenticated;
revoke all on function public.my_approval_status()             from public, anon;
revoke all on function public.is_approved()                    from public, anon;
revoke all on function public.admin_set_approval(uuid, boolean) from public, anon;
revoke all on function public.admin_pending_count()            from public, anon;
grant execute on function public.my_approval_status()             to authenticated;
grant execute on function public.is_approved()                    to authenticated;
grant execute on function public.admin_set_approval(uuid, boolean) to authenticated;
grant execute on function public.admin_pending_count()            to authenticated;
