-- One account that the other administrators cannot take away.
--
-- Access here is flat: `is_admin` is a boolean, every administrator can do everything, and
-- that includes removing any account, renaming it, and — the one that matters — issuing it
-- a new password. Four people at Mississauga hold that flag. Any of them can, today, press
-- Reset beside the person who built this product, read the temporary password off their own
-- screen, and sign in as them. Nothing about that is a bug; it is what "administrator"
-- has meant on this product since accounts were added, and with one plant and one team in
-- the room it was the right amount of ceremony.
--
-- It stops being right the moment the person who owns the thing is no longer in the
-- building. So there is now one account above the flat list, and three things cannot be
-- done to it by anybody else: it cannot be deleted, it cannot have its administrator rights
-- removed, and it cannot have its password reset. It can still do all three to itself.
--
-- Enforced in the database rather than on the screen. Hiding a button stops the button; a
-- policy and a trigger stop the request, whether it arrives from this product's People
-- screen, from a page somebody wrote themselves, or from `curl` with a valid token. The
-- screen hides the buttons too, because a button that always fails is a worse screen — but
-- that is courtesy, not the protection.
--
-- What this does not do, and it should be said in the file rather than discovered later:
-- it does not defend against whoever holds the Supabase project itself. Anybody with the
-- service-role key or the SQL editor can clear the flag in one statement. Ownership of the
-- data lives in the Supabase account, and no column in that database can outrank the person
-- holding its keys. This defends against an administrator of the application. That is the
-- threat it was asked to defend against, and it is worth being exact about the difference.
alter table public.profiles
  add column if not exists is_owner boolean not null default false;

comment on column public.profiles.is_owner is
  'The one account that other administrators cannot delete, demote or reset. Enforced by '
  'the `guard_owner` trigger and by row-level security, not by the page. Not a level of '
  'access: the owner is an administrator like the others and gains no extra reach by it.';

-- One owner, or none. A second would make "the owner" ambiguous in every check below.
create unique index if not exists profiles_one_owner
  on public.profiles ((is_owner)) where is_owner;

create or replace function private.owner_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.profiles where is_owner limit 1;
$$;

-- The guard itself.
--
-- `auth.uid()` is null when there is no signed-in caller — the SQL editor, a migration, the
-- service-role key. Those are deliberately let through: the flag has to be settable in the
-- first place, and an edge function holding the service key is checked in its own code
-- against the *caller's* token rather than here. Every request that arrives with somebody's
-- session attached is checked.
create or replace function public.guard_owner()
returns trigger language plpgsql security definer set search_path to 'public', 'auth' as $$
declare me uuid := auth.uid();
begin
  if me is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.is_owner and me <> old.id then
      raise exception 'That account belongs to the owner and cannot be removed.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.is_owner and me <> private.owner_id() then
      raise exception 'Only the owner can hand the owner account on.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE. The owner may change their own name, colour and preferences like anybody else;
  -- what nobody else may change is whether they are still an administrator and still owner.
  if old.is_owner and me <> old.id then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'The owner cannot have their administrator rights changed.'
        using errcode = 'check_violation';
    end if;
    if new.is_owner is distinct from old.is_owner then
      raise exception 'The owner flag cannot be cleared by anybody else.'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.is_owner is distinct from old.is_owner and me <> private.owner_id() then
    raise exception 'Only the owner can hand the owner account on.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists guard_owner_row on public.profiles;
create trigger guard_owner_row
  before insert or update or delete on public.profiles
  for each row execute function public.guard_owner();

-- The owner's plants and capabilities, for the same reason. An administrator who cannot
-- delete the account but can strip every grant off it has removed it in all but name.
create or replace function public.guard_owner_access()
returns trigger language plpgsql security definer set search_path to 'public', 'auth' as $$
declare me uuid := auth.uid(); subject uuid := coalesce(new.profile_id, old.profile_id);
begin
  if me is not null and subject = private.owner_id() and me <> subject then
    raise exception 'The owner''s access cannot be changed by anybody else.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists guard_owner_plants on public.profile_locations;
create trigger guard_owner_plants
  before insert or update or delete on public.profile_locations
  for each row execute function public.guard_owner_access();

drop trigger if exists guard_owner_caps on public.profile_capabilities;
create trigger guard_owner_caps
  before insert or update or delete on public.profile_capabilities
  for each row execute function public.guard_owner_access();
