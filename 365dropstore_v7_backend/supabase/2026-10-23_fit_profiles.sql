-- Fit finder: keep a copy of every shopper's waist and the sizes we suggested,
-- plus the order it led to, so we can see which suggestions actually fit
-- (compare with size exchanges later).
-- The website can only ADD rows (anon insert). Nobody can read them with the
-- public key; the admin reads them with the service role.
create table if not exists public.fit_profiles (
  id          bigint generated always as identity primary key,
  device_id   text        not null check (char_length(device_id) <= 64),
  waist       numeric(4,1) not null check (waist between 20 and 60),
  pref        text        check (pref in ('snug','true','roomy')),
  mode        text        check (mode in ('waist','usual')),
  sizes       jsonb       not null default '{}'::jsonb,   -- {"Wide-Leg":"32","Straight":"32",...}
  source      text        check (char_length(source) <= 20),  -- auto | bar | product | shop | order
  order_id    text        check (char_length(order_id) <= 40),
  ordered     jsonb,                                       -- [{name,size,qty}] when source = 'order'
  created_at  timestamptz not null default now()
);
create index if not exists fit_profiles_device_idx on public.fit_profiles (device_id, created_at desc);
create index if not exists fit_profiles_order_idx  on public.fit_profiles (order_id) where order_id is not null;
alter table public.fit_profiles enable row level security;
revoke all on public.fit_profiles from anon, authenticated;
grant insert on public.fit_profiles to anon;
grant usage on sequence public.fit_profiles_id_seq to anon;
create policy "website can add fit profiles" on public.fit_profiles
  for insert to anon with check (true);
