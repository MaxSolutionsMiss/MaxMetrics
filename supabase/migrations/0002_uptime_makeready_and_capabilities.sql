-- Two more daily readings, and a place for the ones not everyone should see.
-- Applied to metriq-development on 2026-08-06.
--
-- Uptime and make-ready are already in the DOR beside the volumes the plant reads every
-- morning, and Dept KPIs sets a target for both on every machine. They cost no new source
-- and no new typing, which is why they came first.

alter table public.daily_departments
  add column uptime     numeric,   -- fraction of crewed time actually running
  add column make_ready numeric,   -- average make-ready, in hours
  add column mr_count   int;       -- how many make-readies produced that average

alter table public.location_departments
  add column uptime_target numeric,
  add column mr_target     numeric;

update public.location_departments set uptime_target = 0.88,  mr_target = 1.10
  where location_id = 'toronto' and key = 'printing';
update public.location_departments set uptime_target = 0.91,  mr_target = 1.55
  where location_id = 'toronto' and key = 'diecutting';
update public.location_departments set uptime_target = 0.907, mr_target = 1.12
  where location_id = 'toronto' and key = 'gluing';

-- Who may see what.
--
-- The morning dashboard is for the room. Labour cost, overtime, stock variance and
-- revenue per carton are not: they are for whoever the plant manager decides, and that
-- decision has to be assignable rather than baked into a role name that stops fitting.
-- So a capability is a grant on a person, and a screen asks whether they hold it.

create table public.capabilities (
  key text primary key, name text not null, description text not null default ''
);
insert into public.capabilities (key, name, description) values
  ('labour', 'Labour and overtime', 'Earnings and overtime by pay period.'),
  ('margin', 'Margin and delivery', 'Revenue per carton, orders, deliveries, invoiced sales.'),
  ('stock',  'Stock variance',      'Monthly inventory accuracy.'),
  ('assign', 'Assign access',       'Grant and remove these capabilities.');

create table public.profile_capabilities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability text not null references public.capabilities(key) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id),
  primary key (profile_id, capability)
);

create function private.has_capability(cap text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile_capabilities pc
                 where pc.profile_id = auth.uid() and pc.capability = cap);
$$;
grant execute on function private.has_capability(text) to authenticated;

create table public.monthly_kpis (
  location_id text not null references public.locations(id) on delete cascade,
  year int not null, month int not null check (month between 1 and 12),
  stock_variance numeric, orders int, deliveries int,
  cartons_produced bigint, cartons_delivered bigint, invoiced numeric,
  updated_at timestamptz not null default now(),
  primary key (location_id, year, month)
);

create table public.pay_period_labour (
  location_id text not null references public.locations(id) on delete cascade,
  period_end date not null, earnings numeric, ot_hours numeric, ot_amount numeric,
  primary key (location_id, period_end)
);

alter table public.capabilities         enable row level security;
alter table public.profile_capabilities enable row level security;
alter table public.monthly_kpis         enable row level security;
alter table public.pay_period_labour    enable row level security;

create policy capabilities_read on public.capabilities for select to authenticated using (true);

create policy caps_read_own on public.profile_capabilities for select to authenticated
  using (profile_id = auth.uid() or private.has_capability('assign') or private.is_admin());
create policy caps_assign on public.profile_capabilities for all to authenticated
  using (private.has_capability('assign') or private.is_admin())
  with check (private.has_capability('assign') or private.is_admin());

create policy monthly_read on public.monthly_kpis for select to authenticated
  using (private.has_location(location_id)
     and (private.has_capability('margin') or private.has_capability('stock') or private.is_admin()));
create policy monthly_write on public.monthly_kpis for all to authenticated
  using (private.can_edit_location(location_id) and (private.has_capability('margin') or private.is_admin()))
  with check (private.can_edit_location(location_id) and (private.has_capability('margin') or private.is_admin()));

create policy labour_read on public.pay_period_labour for select to authenticated
  using (private.has_location(location_id) and (private.has_capability('labour') or private.is_admin()));
create policy labour_write on public.pay_period_labour for all to authenticated
  using (private.can_edit_location(location_id) and (private.has_capability('labour') or private.is_admin()))
  with check (private.can_edit_location(location_id) and (private.has_capability('labour') or private.is_admin()));

create trigger monthly_kpis_touch before update on public.monthly_kpis
  for each row execute function private.touch_updated_at();
