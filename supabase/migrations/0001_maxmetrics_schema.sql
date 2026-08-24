-- Metriq schema, consolidated.
--
-- This is the whole database as it stands, in the order a fresh project needs it. It was
-- applied to maxmetrics-development on 2026-08-06 in four steps; those steps are folded
-- together here because the project has no production history to preserve and a single
-- readable file is worth more than an accurate archaeology of how it got written.
--
-- The shape follows one rule. A morning is worked by three people at once, so every
-- reading a person can type is its own column. Maria entering printing sheets and Dan
-- entering OTIF are writes to different columns of different tables: neither waits for
-- the other, and neither overwrites the other. Nothing here locks a day, because a lock
-- is the problem this system exists to remove.

-- ────────────────────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────────────────────

create table public.locations (
  id          text primary key,
  name        text not null,
  timezone    text not null default 'America/Toronto',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- A person, not a plant login. Every value entered can be traced to a name.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  initials    text not null default '',
  job_title   text not null default '',
  -- Their marker colour in the presence layer, so a person is the same colour to
  -- everyone looking at the same dashboard.
  colour      text not null default '#5B46D9',
  -- Display preferences belong to the reader, not to the day. One person choosing rings
  -- over bars must not change what anyone else sees.
  chart_style text not null default 'bar' check (chart_style in ('number','bar','donut','gauge')),
  theme       text not null default 'system' check (theme in ('system','light','dark')),
  rail_collapsed boolean not null default false,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.profile_locations (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  location_id text not null references public.locations(id) on delete cascade,
  can_edit    boolean not null default true,
  primary key (profile_id, location_id)
);

-- Departments differ by plant, so they are configuration rather than code.
create table public.location_departments (
  id          uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id) on delete cascade,
  key         text not null,
  name        text not null,
  unit        text not null default 'sheets',
  target      numeric not null default 0,
  sort_order  int not null default 0,
  on_metrics  boolean not null default true,
  on_review   boolean not null default true,
  active      boolean not null default true,
  unique (location_id, key)
);

-- One row per plant per day. Every reading is nullable: a morning starts empty and is
-- filled in by whoever has the number, in whatever order they get it.
create table public.daily_metrics (
  location_id       text not null references public.locations(id) on delete cascade,
  metric_date       date not null,

  injury_last       date,
  injury_record     int,
  near_miss_last    date,
  near_miss_record  int,

  shortages         int,
  coq               numeric,
  coq_target        numeric default 0.85,
  coq_ytd           numeric,
  coq_ytd_target    numeric default 0.85,

  jobs_shipped      int,
  jobs_on_time      int,
  cartons           int,
  late              int,
  shorts            int,
  otd               numeric,
  otif              numeric,
  mtd_otif          numeric,
  ytd_otif          numeric,

  maintenance_note  text,
  staffing_note     text,

  fin_enabled       boolean not null default true,
  fin_actual_mtd    numeric,
  fin_actual_ytd    numeric,

  -- Published means "this is the version for the meeting". It is not a lock, and it does
  -- not stop anyone editing afterwards.
  status            text not null default 'draft' check (status in ('draft','published')),
  published_at      timestamptz,
  published_by      uuid references public.profiles(id),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (location_id, metric_date)
);

create table public.daily_departments (
  location_id text not null references public.locations(id) on delete cascade,
  metric_date date not null,
  dept_key    text not null,
  qty         numeric,
  hours       numeric,
  target      numeric,
  pw_qty      numeric,
  pw_hours    numeric,
  updated_at  timestamptz not null default now(),
  primary key (location_id, metric_date, dept_key)
);

create table public.daily_review (
  location_id text not null references public.locations(id) on delete cascade,
  metric_date date not null,
  dept_key    text not null,
  status      text not null default 'ok' check (status in ('ok','warn','stop')),
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (location_id, metric_date, dept_key)
);

create table public.maintenance_items (
  id          uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id) on delete cascade,
  metric_date date not null,
  dept        text not null default '',
  item_type   text not null default '',
  frequency   text not null default 'Weekly',
  scheduled   text not null default '',
  status      text not null default 'Scheduled'
                check (status in ('Scheduled','Due Today','Overdue','Complete')),
  sort_order  int not null default 0
);
create index maintenance_items_day on public.maintenance_items (location_id, metric_date);

-- Each month carries its own budget, and each plant its own set.
create table public.location_budgets (
  location_id text not null references public.locations(id) on delete cascade,
  year        int  not null,
  month       int  not null check (month between 1 and 12),
  amount      numeric not null default 0,
  primary key (location_id, year, month)
);

-- Who typed which number, and when. Attribution is per field, because that is the
-- granularity people actually work at.
create table public.field_edits (
  id          bigserial primary key,
  location_id text not null references public.locations(id) on delete cascade,
  metric_date date not null,
  field       text not null,
  new_value   text,
  edited_by   uuid references public.profiles(id),
  edited_at   timestamptz not null default now()
);
create index field_edits_day on public.field_edits (location_id, metric_date, edited_at desc);

-- ────────────────────────────────────────────────────────────────────────────────
-- Access
--
-- A plant's numbers belong to that plant. Guelph signing in sees Guelph. Access is a
-- grant per person per location, so a regional manager holding several and a plant
-- manager holding exactly one are the same case, not two.
-- ────────────────────────────────────────────────────────────────────────────────

alter table public.locations            enable row level security;
alter table public.profiles             enable row level security;
alter table public.profile_locations    enable row level security;
alter table public.location_departments enable row level security;
alter table public.daily_metrics        enable row level security;
alter table public.daily_departments    enable row level security;
alter table public.daily_review         enable row level security;
alter table public.maintenance_items    enable row level security;
alter table public.location_budgets     enable row level security;
alter table public.field_edits          enable row level security;

-- The access helpers exist to be asked by row-level security, not by callers. Left in
-- `public` they would also be REST endpoints, which is a surface nobody needs. `private`
-- is not an exposed schema, so policies go on calling them and the API cannot.
create schema private;
revoke all on schema private from anon, authenticated;

create function private.has_location(loc text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_locations pl
                 where pl.profile_id = auth.uid() and pl.location_id = loc);
$$;

create function private.can_edit_location(loc text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_locations pl
                 where pl.profile_id = auth.uid() and pl.location_id = loc and pl.can_edit);
$$;

create function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- A policy expression runs as the querying role, so that role must be able to execute
-- the function even though it can no longer reach it over REST.
grant usage on schema private to authenticated;
grant execute on function private.has_location(text)      to authenticated;
grant execute on function private.can_edit_location(text) to authenticated;
grant execute on function private.is_admin()              to authenticated;

-- Everyone signed in can see the plant list; the dropdown is not a secret, and the
-- numbers behind it are governed separately.
create policy locations_read on public.locations
  for select to authenticated using (true);
create policy locations_admin on public.locations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Colleagues must be visible to each other or the presence layer cannot name anyone.
create policy profiles_read on public.profiles
  for select to authenticated using (true);
create policy profiles_write_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin on public.profiles
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy profile_locations_read on public.profile_locations
  for select to authenticated using (profile_id = auth.uid() or private.is_admin());
create policy profile_locations_admin on public.profile_locations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy departments_read on public.location_departments
  for select to authenticated using (private.has_location(location_id));
create policy departments_write on public.location_departments
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy metrics_read on public.daily_metrics
  for select to authenticated using (private.has_location(location_id));
create policy metrics_write on public.daily_metrics
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy dept_day_read on public.daily_departments
  for select to authenticated using (private.has_location(location_id));
create policy dept_day_write on public.daily_departments
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy review_read on public.daily_review
  for select to authenticated using (private.has_location(location_id));
create policy review_write on public.daily_review
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy maint_read on public.maintenance_items
  for select to authenticated using (private.has_location(location_id));
create policy maint_write on public.maintenance_items
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

create policy budgets_read on public.location_budgets
  for select to authenticated using (private.has_location(location_id));
create policy budgets_write on public.location_budgets
  for all to authenticated using (private.can_edit_location(location_id))
  with check (private.can_edit_location(location_id));

-- The trail is readable by anyone who can see the plant, and append-only: a record of
-- who typed what is worth nothing if it can be edited afterwards.
create policy edits_read on public.field_edits
  for select to authenticated using (private.has_location(location_id));
create policy edits_append on public.field_edits
  for insert to authenticated
  with check (private.can_edit_location(location_id) and edited_by = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────────
-- Triggers and callable functions
-- ────────────────────────────────────────────────────────────────────────────────

-- A signed-up person gets a profile without anyone remembering to make one.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nm text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, initials)
  values (new.id, nm,
    upper(left(split_part(nm, ' ', 1), 1) ||
          coalesce(left(nullif(split_part(nm, ' ', 2), ''), 1), '')))
  on conflict (id) do nothing;
  return new;
end;
$$;

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

revoke all on function private.handle_new_user()  from anon, authenticated, public;
revoke all on function private.touch_updated_at() from anon, authenticated, public;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger daily_metrics_touch     before update on public.daily_metrics
  for each row execute function private.touch_updated_at();
create trigger daily_departments_touch before update on public.daily_departments
  for each row execute function private.touch_updated_at();
create trigger daily_review_touch      before update on public.daily_review
  for each row execute function private.touch_updated_at();

-- Three people opening the same morning at 06:58 would otherwise race to insert the
-- day's row and two would fail. Asking for the day is idempotent instead.
create function public.ensure_day(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  insert into public.daily_metrics (location_id, metric_date)
  values (loc, d) on conflict (location_id, metric_date) do nothing;
  -- A new morning starts with the plant's departments present and empty, carrying the
  -- standing targets forward. Yesterday's counts are not today's.
  insert into public.daily_departments (location_id, metric_date, dept_key, target)
  select ld.location_id, d, ld.key, ld.target from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_metrics
  on conflict (location_id, metric_date, dept_key) do nothing;
  insert into public.daily_review (location_id, metric_date, dept_key)
  select ld.location_id, d, ld.key from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_review
  on conflict (location_id, metric_date, dept_key) do nothing;
end;
$$;

-- The safety streak is a standing record, not a daily reading, so a new morning inherits
-- it rather than asking someone to retype it.
create function public.carry_forward(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
declare prev record;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  select injury_last, injury_record, near_miss_last, near_miss_record,
         coq_target, coq_ytd_target into prev
  from public.daily_metrics where location_id = loc and metric_date < d
  order by metric_date desc limit 1;
  if found then
    update public.daily_metrics m set
      injury_last      = coalesce(m.injury_last,      prev.injury_last),
      injury_record    = coalesce(m.injury_record,    prev.injury_record),
      near_miss_last   = coalesce(m.near_miss_last,   prev.near_miss_last),
      near_miss_record = coalesce(m.near_miss_record, prev.near_miss_record),
      coq_target       = coalesce(m.coq_target,       prev.coq_target),
      coq_ytd_target   = coalesce(m.coq_ytd_target,   prev.coq_ytd_target)
    where m.location_id = loc and m.metric_date = d;
  end if;
end;
$$;

-- Both are called by the app, and only ever by someone signed in. Each checks edit
-- access itself, which is why they may be reachable while the helpers may not.
revoke all on function public.ensure_day(text, date)    from anon, public;
revoke all on function public.carry_forward(text, date) from anon, public;
grant execute on function public.ensure_day(text, date)    to authenticated;
grant execute on function public.carry_forward(text, date) to authenticated;

-- ────────────────────────────────────────────────────────────────────────────────
-- Live updates and seed
-- ────────────────────────────────────────────────────────────────────────────────

-- A change one person makes reaches the other two screens, and the meeting-room TV,
-- without anyone refreshing.
alter publication supabase_realtime add table public.daily_metrics;
alter publication supabase_realtime add table public.daily_departments;
alter publication supabase_realtime add table public.daily_review;
alter publication supabase_realtime add table public.maintenance_items;

insert into public.locations (id, name, sort_order) values
  ('mississauga', 'Mississauga', 1),
  ('guelph',      'Guelph',      2),
  ('pickering',   'Pickering',   3),
  ('owen-sound',  'Owen Sound',  4),
  ('markham',     'Markham',     5);

-- Mississauga's shape as it runs today. The other plants set their own on first use.
insert into public.location_departments (location_id, key, name, unit, target, sort_order) values
  ('mississauga', 'printing',   'Printing',    'sheets',   3050, 1),
  ('mississauga', 'diecutting', 'Die Cutting', 'sheets',   2025, 2),
  ('mississauga', 'gluing',     'Gluing',      'cartons', 11933, 3);

-- Shipping appears in the 24-hour review but is not a production rate, so it is a
-- review-only entry rather than a department with a target.
insert into public.location_departments
  (location_id, key, name, unit, target, sort_order, on_metrics, on_review) values
  ('mississauga', 'shipping', 'Shipping', 'jobs', 0, 4, false, true);

insert into public.location_budgets (location_id, year, month, amount) values
  ('mississauga', 2026,  1, 3042361.53),
  ('mississauga', 2026,  2, 2853492.74),
  ('mississauga', 2026,  3, 3282808.64),
  ('mississauga', 2026,  4, 2617223.77),
  ('mississauga', 2026,  5, 2445602.32),
  ('mississauga', 2026,  6, 2733541.79),
  ('mississauga', 2026,  7, 2929498.53),
  ('mississauga', 2026,  8, 3032625.82),
  ('mississauga', 2026,  9, 2935786.16),
  ('mississauga', 2026, 10, 3265862.12),
  ('mississauga', 2026, 11, 2644116.73),
  ('mississauga', 2026, 12, 1797856.93);
