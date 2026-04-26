
-- Roles enum and table (separate from profiles to avoid privilege escalation)
create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

alter table public.user_roles enable row level security;

-- Security definer function to check roles without recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Only admins can view the roles table
create policy "admins view roles" on public.user_roles
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Admin view: list users (email + signup date) without exposing password hashes
create or replace view public.admin_users_view
with (security_invoker = on) as
select
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at
from auth.users u
where public.has_role(auth.uid(), 'admin');

grant select on public.admin_users_view to authenticated;

-- Admin view: watchlists with email
create or replace view public.admin_watchlists_view
with (security_invoker = on) as
select
  w.id,
  w.user_id,
  u.email,
  w.ticker,
  w.created_at
from public.watchlist w
join auth.users u on u.id = w.user_id
where public.has_role(auth.uid(), 'admin');

grant select on public.admin_watchlists_view to authenticated;

-- Allow admins to also read all watchlist rows directly (for counts)
create policy "admins view all watchlists" on public.watchlist
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Assign admin role to your account
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'gregorycastillo2008@gmail.com'
on conflict do nothing;
