-- Starting counts roll forward by themselves.
-- Applied to the live project on 2026-10-06 (Supabase migrations inventory_roll_forward_function,
-- inventory_roll_forward_on_first_log, inventory_roll_forward_nightly). Kept here as the record.
--
-- Why: each day used to begin as a blank sheet until someone typed Starting or pressed
-- "Copy Yesterday's Ending" (which only looked one day back). One skipped morning left every
-- later day blank: Davao had been blank since 21 Sep and Digos since 29 Sep 2026.
--
-- What: a day's Starting is carried forward from the last counted day, with the deliveries and
-- usage of any skipped days applied:
--   Starting(D) = Ending(L) + sum over days between L and D of (Additional - Used), never below 0
-- where L is the most recent day before D with a Starting (up to 120 days back).
-- A Starting a person typed is never touched; only blank Startings are filled, and filled rows
-- carry starting_auto = true so the sheet can say "carried over".
--
-- When it runs (all three are idempotent, so overlapping is harmless):
--   1. Every night at 00:05 Manila (pg_cron job "inventory-roll-forward", 16:05 UTC).
--   2. On a day's first log row for a branch (the first sale synced from a till) - trigger.
--   3. When a branch's Inventory page or the master Branch Sheet opens for today - the portal
--      calls the function with the service role before reading the sheet.
--
-- The function may only be called by the service role (the portal server) and by the
-- database itself; the POS key and signed-in browsers cannot call it.

alter table public.daily_inventory_logs
  add column if not exists starting_auto boolean not null default false;
comment on column public.daily_inventory_logs.starting_auto is
  'true when Starting was carried forward by the system from the last counted day; false once a person types a Starting.';

create or replace function public.inventory_roll_forward(
  p_day date default (now() at time zone 'Asia/Manila')::date,
  p_branch uuid default null,
  p_apply boolean default true
)
returns table (out_branch_id uuid, out_item_id uuid, out_from_day date, out_starting numeric, out_applied boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  r record;
  v_applied boolean;
begin
  for r in
    with scope as (
      select t.entity_id as branch_id, t.inventory_item_id
      from inventory_item_tags t
      join inventory_items i on i.id = t.inventory_item_id and i.is_active
      join branches b on b.id = t.entity_id
      where t.entity_type = 'branch'
        and (p_branch is null or t.entity_id = p_branch)
    ),
    needs as (
      select s.branch_id, s.inventory_item_id
      from scope s
      left join daily_inventory_logs d
        on d.branch_id = s.branch_id and d.inventory_item_id = s.inventory_item_id and d.log_date = p_day
      where d.starting_stock is null
    ),
    last_count as (
      select n.branch_id, n.inventory_item_id,
             (select l.log_date
                from daily_inventory_logs l
               where l.branch_id = n.branch_id
                 and l.inventory_item_id = n.inventory_item_id
                 and l.log_date < p_day
                 and l.log_date >= p_day - 120
                 and l.starting_stock is not null
               order by l.log_date desc
               limit 1) as from_day
      from needs n
    )
    select lc.branch_id, lc.inventory_item_id, lc.from_day,
           greatest(0,
             (select greatest(0, l.starting_stock + coalesce(l.additional_stock, 0) - coalesce(l.used_stock, 0))
                from daily_inventory_logs l
               where l.branch_id = lc.branch_id and l.inventory_item_id = lc.inventory_item_id and l.log_date = lc.from_day)
             + coalesce((select sum(coalesce(m.additional_stock, 0) - coalesce(m.used_stock, 0))
                           from daily_inventory_logs m
                          where m.branch_id = lc.branch_id and m.inventory_item_id = lc.inventory_item_id
                            and m.log_date > lc.from_day and m.log_date < p_day), 0)
           ) as starting
    from last_count lc
    where lc.from_day is not null
  loop
    v_applied := false;
    if p_apply then
      insert into daily_inventory_logs (branch_id, inventory_item_id, log_date, starting_stock, starting_auto)
      values (r.branch_id, r.inventory_item_id, p_day, r.starting, true)
      on conflict (branch_id, inventory_item_id, log_date) do update
        set starting_stock = excluded.starting_stock,
            starting_auto  = true,
            updated_at     = now()
        where daily_inventory_logs.starting_stock is null;
      v_applied := found;
    end if;
    out_branch_id := r.branch_id;
    out_item_id   := r.inventory_item_id;
    out_from_day  := r.from_day;
    out_starting  := r.starting;
    out_applied   := v_applied;
    return next;
  end loop;
end
$$;

revoke execute on function public.inventory_roll_forward(date, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.inventory_roll_forward(date, uuid, boolean) to service_role;

-- 2. Safety net that needs no clock: the first log row of a day for a branch pulls that
--    branch's Starting counts forward. It must never block the row that fired it.
create or replace function public.trg_roll_forward_on_first_log()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform public.inventory_roll_forward(NEW.log_date, NEW.branch_id, true);
  exception when others then
    raise warning 'inventory_roll_forward skipped for branch % on %: %', NEW.branch_id, NEW.log_date, sqlerrm;
  end;
  return NEW;
end
$$;
revoke execute on function public.trg_roll_forward_on_first_log() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_daily_inventory_logs_roll_forward') then
    create trigger trg_daily_inventory_logs_roll_forward
      after insert on public.daily_inventory_logs
      for each row
      when (NEW.starting_stock is null and NEW.log_date >= (now() at time zone 'Asia/Manila')::date - 1)
      execute function public.trg_roll_forward_on_first_log();
  end if;
end
$$;

-- 3. Every night at 00:05 Manila.
create extension if not exists pg_cron;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'inventory-roll-forward') then
    perform cron.schedule('inventory-roll-forward', '5 16 * * *', $job$select public.inventory_roll_forward()$job$);
  end if;
end
$$;
