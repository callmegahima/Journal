-- My Trading Journal — admin dashboard
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run (after schema.sql).
--
-- Security model:
--   * Admins are listed in public.app_admins. Nobody can read or change that table through the
--     API (RLS on, no policies, no grants); it is only edited here in the SQL editor.
--   * Every admin action is a SECURITY DEFINER function that first checks the caller is in
--     app_admins, so the public key alone can never list, suspend or delete accounts.
--   * Admins see account details and summary numbers only (counts, balance, net P/L),
--     not the content of anyone's plans, trades or notes.
--
-- Make yourself admin (run separately, with your own sign-in email):
--   insert into public.app_admins (user_id)
--   select id from auth.users where lower(email) = lower('you@example.com')
--   on conflict do nothing;

-- ---------------------------------------------------------------- admins list
create table if not exists public.app_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.require_app_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.app_admins where user_id = auth.uid()) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- list accounts
drop function if exists public.admin_list_users();
create or replace function public.admin_list_users()
returns table (
  id               uuid,
  email            text,
  full_name        text,
  provider         text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  email_confirmed_at timestamptz,
  banned_until     timestamptz,
  is_admin         boolean,
  plans            integer,
  trades           integer,
  wins             integer,
  losses           integer,
  net_pnl          numeric,
  starting_balance numeric,
  last_activity    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  return query
  select
    u.id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
    coalesce(u.raw_app_meta_data ->> 'provider', 'email')::text,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.banned_until,
    exists (select 1 from public.app_admins a where a.user_id = u.id),
    coalesce(r.plans, 0)::integer,
    coalesce(r.trades, 0)::integer,
    coalesce(r.wins, 0)::integer,
    coalesce(r.losses, 0)::integer,
    coalesce(r.net_pnl, 0)::numeric,
    nullif(s.data ->> 'startingBalance', '')::numeric,
    greatest(r.last_activity, s.server_updated_at)
  from auth.users u
  left join lateral (
    select
      count(*) filter (where jr.collection = 'plans')  as plans,
      count(*) filter (where jr.collection = 'trades') as trades,
      count(*) filter (where jr.collection = 'trades' and coalesce(nullif(jr.data ->> 'pnl', '')::numeric, 0) > 0) as wins,
      count(*) filter (where jr.collection = 'trades' and coalesce(nullif(jr.data ->> 'pnl', '')::numeric, 0) < 0) as losses,
      sum(case when jr.collection = 'trades' then coalesce(nullif(jr.data ->> 'pnl', '')::numeric, 0) else 0 end) as net_pnl,
      max(jr.server_updated_at) as last_activity
    from public.journal_records jr
    where jr.user_id = u.id and not jr.deleted
  ) r on true
  left join public.journal_settings s on s.user_id = u.id
  order by u.created_at desc;
end;
$$;

-- ---------------------------------------------------------------- suspend / restore login
create or replace function public.admin_set_suspended(target uuid, suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  if target = auth.uid() then
    raise exception 'You cannot suspend your own account';
  end if;
  update auth.users
     set banned_until = case when suspended then 'infinity'::timestamptz else null end
   where id = target;
  if suspended then
    -- End their sessions so they cannot refresh back in.
    delete from auth.refresh_tokens where user_id = target::text;
    delete from auth.sessions where user_id = target;
  end if;
end;
$$;

-- ---------------------------------------------------------------- sign out everywhere
create or replace function public.admin_sign_out_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  delete from auth.refresh_tokens where user_id = target::text;
  delete from auth.sessions where user_id = target;
end;
$$;

-- ---------------------------------------------------------------- confirm email by hand
create or replace function public.admin_confirm_email(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = target;
end;
$$;

-- ---------------------------------------------------------------- delete an account
-- Removes the account and, through "on delete cascade", every journal row it owns.
create or replace function public.admin_delete_user(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_app_admin();
  if target = auth.uid() then
    raise exception 'Use Settings → Delete account to delete your own account';
  end if;
  if exists (select 1 from public.app_admins where user_id = target) then
    raise exception 'Remove admin rights in the SQL editor before deleting another admin';
  end if;
  delete from auth.users where id = target;
end;
$$;

-- ---------------------------------------------------------------- permissions
revoke all on function public.is_app_admin()                      from public, anon;
revoke all on function public.require_app_admin()                 from public, anon, authenticated;
revoke all on function public.admin_list_users()                  from public, anon;
revoke all on function public.admin_set_suspended(uuid, boolean)  from public, anon;
revoke all on function public.admin_sign_out_user(uuid)           from public, anon;
revoke all on function public.admin_confirm_email(uuid)           from public, anon;
revoke all on function public.admin_delete_user(uuid)             from public, anon;
grant execute on function public.is_app_admin()                     to authenticated;
grant execute on function public.admin_list_users()                 to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_sign_out_user(uuid)          to authenticated;
grant execute on function public.admin_confirm_email(uuid)          to authenticated;
grant execute on function public.admin_delete_user(uuid)            to authenticated;
