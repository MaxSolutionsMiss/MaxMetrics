-- Three things a morning could not previously say about itself.
--
-- 1. Whether a department had actually answered, or had merely been opened.
-- 2. What it was judged against, as opposed to what the plant's target happens to be today.
-- 3. Which files had arrived by the time it was published, and when.
--
-- All of it is additive. Nothing stored is rewritten and no historical morning changes.

-- ── A department starts unanswered ──────────────────────────────────────────────
--
-- `status` defaulted to 'ok', so the moment a morning was opened every department was
-- already reporting "No issues reported" — a statement nobody had made, on a screen twenty
-- people read. Unanswered is null now: drawn as "Not confirmed yet" and counted as missing
-- rather than as clear. Existing rows keep whatever they say, because a row saying 'ok'
-- today was either answered or defaulted and there is no way to tell which.
alter table public.daily_review alter column status drop default;
alter table public.daily_review alter column status drop not null;

-- ── A morning keeps the targets it was judged against ───────────────────────────
--
-- The department rate target has been frozen onto the day since the first release, because
-- `ensure_day` copies it in. Three others were not: OTIF and OTD lived in the browser as a
-- constant, and uptime and make-ready were read from the department's *current*
-- configuration. Move the OTIF target to 97 next January and every morning back to 2025
-- restates itself — green mornings turn amber, retrospectively, with nothing to say why.
--
-- Historical rows stay null and fall back to the constant, which is what they were actually
-- judged against when they were published. Only mornings opened from here carry their own.
alter table public.daily_metrics
  add column if not exists otif_target numeric,
  add column if not exists otd_target  numeric;
alter table public.daily_departments
  add column if not exists uptime_target numeric,
  add column if not exists mr_target     numeric;

-- ── When each file last arrived ─────────────────────────────────────────────────
--
-- A number that came out of the DOR six days ago is not the same reading as the same number
-- entered this morning, and until now the morning had no way to tell the difference — which
-- is the whole of why a stale figure can sit on a screen for a week without anybody
-- noticing. One object per source, written by the importer: { "dor": "2026-08-11T05:31:02Z" }.
alter table public.daily_metrics
  add column if not exists source_seen jsonb not null default '{}'::jsonb;

-- ── Publishing keeps its history ────────────────────────────────────────────────
--
-- Publishing overwrote a status column, so republishing silently replaced whatever the room
-- had already read and there was no way to ask what a morning said when it went up. Each
-- publish appends a revision carrying the morning exactly as it was — which is also what
-- makes "a target change must not alter a published dashboard" true by construction rather
-- than by discipline.
create table if not exists public.publications (
  id            uuid primary key default gen_random_uuid(),
  location_id   text not null references public.locations(id) on delete cascade,
  metric_date   date not null,
  revision      int  not null,
  published_at  timestamptz not null default now(),
  published_by  uuid references auth.users(id),
  incomplete    boolean not null default false,
  override_note text,
  snapshot      jsonb not null default '{}'::jsonb,
  unique (location_id, metric_date, revision)
);
create index if not exists publications_day on public.publications (location_id, metric_date desc);

alter table public.publications enable row level security;

drop policy if exists publications_read on public.publications;
create policy publications_read on public.publications for select
  to authenticated using (private.has_location(location_id));

-- Written only through publish_morning(), which is the one path that knows what a revision
-- number should be. No direct insert, so two people publishing at once cannot both claim
-- revision 3.
drop policy if exists publications_write on public.publications;

-- ── Opening a day fills in what it will be judged against ───────────────────────
create or replace function public.ensure_day(loc text, d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  insert into public.daily_metrics (location_id, metric_date, otif_target, otd_target)
  values (loc, d, 98, 98) on conflict (location_id, metric_date) do nothing;
  insert into public.daily_departments
    (location_id, metric_date, dept_key, target, uptime_target, mr_target)
  select ld.location_id, d, ld.key, ld.target, ld.uptime_target, ld.mr_target
  from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_metrics
  on conflict (location_id, metric_date, dept_key) do nothing;
  insert into public.daily_review (location_id, metric_date, dept_key)
  select ld.location_id, d, ld.key from public.location_departments ld
  where ld.location_id = loc and ld.active and ld.on_review
  on conflict (location_id, metric_date, dept_key) do nothing;
  insert into public.daily_labour (location_id, metric_date, dept_key)
  select ld.location_id, d, ld.key from public.location_departments ld
  where ld.location_id = loc and ld.active
  on conflict (location_id, metric_date, dept_key) do nothing;
end;
$$;

-- ── Publishing ─────────────────────────────────────────────────────────────────
--
-- The morning's status still says published, because every screen already reads it and a
-- second source of truth for one boolean would be worse than the problem. What is new is
-- that the act is recorded: who, when, which revision, whether it was incomplete, and why
-- they published it anyway.
create or replace function public.publish_morning(
  loc text, d date, incomplete boolean default false, note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  next_rev int;
  shot jsonb;
begin
  if not private.can_edit_location(loc) then
    raise exception 'no edit access to %', loc using errcode = '42501';
  end if;
  update public.daily_metrics
     set status = 'published', published_at = now(), published_by = auth.uid()
   where location_id = loc and metric_date = d;

  select coalesce(max(revision), 0) + 1 into next_rev
    from public.publications where location_id = loc and metric_date = d;

  select jsonb_build_object(
      'metrics',     (select to_jsonb(x) from public.daily_metrics x
                       where x.location_id = loc and x.metric_date = d),
      'departments', coalesce((select jsonb_agg(to_jsonb(x)) from public.daily_departments x
                       where x.location_id = loc and x.metric_date = d), '[]'::jsonb),
      'review',      coalesce((select jsonb_agg(to_jsonb(x)) from public.daily_review x
                       where x.location_id = loc and x.metric_date = d), '[]'::jsonb),
      'labour',      coalesce((select jsonb_agg(to_jsonb(x)) from public.daily_labour x
                       where x.location_id = loc and x.metric_date = d), '[]'::jsonb))
    into shot;

  insert into public.publications
    (location_id, metric_date, revision, published_by, incomplete, override_note, snapshot)
  values (loc, d, next_rev, auth.uid(), incomplete, nullif(note, ''), shot);
  return next_rev;
end;
$$;

revoke all on function public.publish_morning(text, date, boolean, text) from anon, public;
grant execute on function public.publish_morning(text, date, boolean, text) to authenticated;
