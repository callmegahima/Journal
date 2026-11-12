-- My Trading Journal — email the admin when someone new signs up
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run (after approvals.sql).
-- Also deploy supabase/functions/signup-alert and add the RESEND_API_KEY secret.
--
-- How it works:
--   * A new pending account fires a background web request to the signup-alert function.
--   * The function asks the database for pending accounts that have not been emailed yet,
--     emails the admins, and marks them as emailed. Calling it again sends nothing new,
--     so it is safe for anyone to call.

create extension if not exists pg_net with schema extensions;

alter table public.account_approvals add column if not exists notified_at timestamptz;
-- Accounts that already exist never need an email.
update public.account_approvals set notified_at = coalesce(notified_at, now())
 where notified_at is null and status <> 'pending';
update public.account_approvals set notified_at = coalesce(notified_at, now())
 where notified_at is null and requested_at < now() - interval '1 day';

-- ---------------------------------------------------------------- for the email function only
-- Returns the pending accounts not emailed yet and marks them as emailed.
create or replace function public.signup_alerts_claim()
returns table (user_id uuid, email text, full_name text, provider text, requested_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    update public.account_approvals a
       set notified_at = now()
     where a.status = 'pending'
       and a.notified_at is null
       and not exists (select 1 from public.app_admins ad where ad.user_id = a.user_id)
    returning a.user_id, a.requested_at
  )
  select c.user_id,
         u.email::text,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
         coalesce(u.raw_app_meta_data ->> 'provider', 'email')::text,
         c.requested_at
    from claimed c
    join auth.users u on u.id = c.user_id
   order by c.requested_at;
end;
$$;

-- Puts accounts back in the queue when the email could not be sent.
create or replace function public.signup_alerts_release(ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.account_approvals set notified_at = null where user_id = any (ids);
$$;

-- Who gets the email: every admin.
create or replace function public.signup_alert_recipients()
returns table (email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text from public.app_admins a join auth.users u on u.id = a.user_id
   where u.email is not null;
$$;

-- How many sign-ups are waiting in total (shown in the email).
create or replace function public.signup_alerts_pending_total()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.account_approvals a
   where a.status = 'pending'
     and not exists (select 1 from public.app_admins ad where ad.user_id = a.user_id);
$$;

revoke all on function public.signup_alerts_claim()           from public, anon, authenticated;
revoke all on function public.signup_alerts_release(uuid[])   from public, anon, authenticated;
revoke all on function public.signup_alert_recipients()       from public, anon, authenticated;
revoke all on function public.signup_alerts_pending_total()   from public, anon, authenticated;
grant execute on function public.signup_alerts_claim()         to service_role;
grant execute on function public.signup_alerts_release(uuid[]) to service_role;
grant execute on function public.signup_alert_recipients()     to service_role;
grant execute on function public.signup_alerts_pending_total() to service_role;

-- ---------------------------------------------------------------- fire on every new sign-up
create or replace function public.notify_signup_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform net.http_post(
      url := 'https://lhvlgwakyyguuhygmnzq.supabase.co/functions/v1/signup-alert',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
exception when others then
  -- Never block a sign-up because the email could not be queued.
  return new;
end;
$$;

revoke all on function public.notify_signup_alert() from public, anon, authenticated;

drop trigger if exists account_approvals_signup_alert on public.account_approvals;
create trigger account_approvals_signup_alert
  after insert on public.account_approvals
  for each row execute function public.notify_signup_alert();
