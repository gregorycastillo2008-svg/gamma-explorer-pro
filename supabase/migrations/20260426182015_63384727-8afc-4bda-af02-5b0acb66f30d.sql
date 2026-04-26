
create table public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  created_at timestamptz not null default now(),
  unique(user_id, ticker)
);

alter table public.watchlist enable row level security;

create policy "users select own watchlist" on public.watchlist
  for select to authenticated using (auth.uid() = user_id);
create policy "users insert own watchlist" on public.watchlist
  for insert to authenticated with check (auth.uid() = user_id);
create policy "users delete own watchlist" on public.watchlist
  for delete to authenticated using (auth.uid() = user_id);
