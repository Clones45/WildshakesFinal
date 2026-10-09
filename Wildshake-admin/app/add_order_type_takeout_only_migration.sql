-- Dine-in orders are served in glass, so packaging that only goes out with take-out
-- and delivery orders (plastic cups, their lids and domes) must not be deducted for a
-- dine-in order. The till already asks Dine-in / Take-out / Pickup at checkout and now
-- sends it; the deduction honours it here and on the tablet.
-- Applied to the live project on 2026-10-09 through the Supabase MCP.

alter table public.transactions add column if not exists order_type text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_order_type_check') then
    alter table public.transactions add constraint transactions_order_type_check
      check (order_type is null or order_type in ('dine-in', 'take-out', 'pickup'));
  end if;
end $$;

alter table public.inventory_items add column if not exists takeout_only boolean not null default false;
comment on column public.inventory_items.takeout_only is
  'Packaging used only for take-out and delivery (plastic cups, lids, domes): not deducted for dine-in orders.';

create or replace function public.apply_ingredient_deduction_raw(
  p_branch_id uuid, p_product_id uuid, p_quantity integer, p_log_date date, p_sign integer, p_order_type text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
    if p_branch_id is null or p_product_id is null or coalesce(p_quantity, 0) = 0 then
        return;
    end if;

    -- Menu-item countdown (only where the branch has set a number)
    update branch_menu_availability
       set stock_qty = stock_qty - (p_quantity * p_sign),
           updated_at = now()
     where branch_id = p_branch_id
       and product_id = p_product_id
       and stock_qty is not null;

    -- Ingredient usage. A dine-in order is served in glass: take-out-only packaging is skipped.
    for r in
        select l.inventory_item_id, l.quantity_per_serving
        from food_item_menu_links l
        join inventory_items i on i.id = l.inventory_item_id
        where l.product_id = p_product_id
          and l.quantity_per_serving is not null
          and not (i.takeout_only and p_order_type = 'dine-in')
    loop
        insert into daily_inventory_logs (branch_id, inventory_item_id, log_date, used_stock)
        values (p_branch_id, r.inventory_item_id, p_log_date,
                r.quantity_per_serving * p_quantity * p_sign)
        on conflict (branch_id, inventory_item_id, log_date) do update
            set used_stock = coalesce(daily_inventory_logs.used_stock, 0)
                             + (r.quantity_per_serving * p_quantity * p_sign),
                updated_at = now();
    end loop;
end $$;

-- The five-argument form stays for any caller that has it and means "order type unknown": everything is deducted.
create or replace function public.apply_ingredient_deduction_raw(
  p_branch_id uuid, p_product_id uuid, p_quantity integer, p_log_date date, p_sign integer)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
    perform public.apply_ingredient_deduction_raw(p_branch_id, p_product_id, p_quantity, p_log_date, p_sign, null::text);
end $$;

create or replace function public.apply_ingredient_deduction(p_transaction_item_id uuid, p_sign integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_branch uuid; v_product uuid; v_qty int; v_date date; v_order_type text;
begin
    select t.branch_id, ti.product_id, ti.quantity,
           (coalesce(t.created_at, now()) at time zone 'Asia/Manila')::date,
           t.order_type
      into v_branch, v_product, v_qty, v_date, v_order_type
    from transaction_items ti
    join transactions t on t.id = ti.transaction_id
    where ti.id = p_transaction_item_id;
    if not found then return; end if;
    perform public.apply_ingredient_deduction_raw(v_branch, v_product, v_qty, v_date, p_sign, v_order_type);
end $$;

-- Only the database (through its triggers) and the service role may call the deduction directly.
revoke execute on function public.apply_ingredient_deduction_raw(uuid, uuid, integer, date, integer, text) from public, anon, authenticated;
revoke execute on function public.apply_ingredient_deduction_raw(uuid, uuid, integer, date, integer) from public, anon, authenticated;

-- Plastic cups, lids and domes on the branch sheets go out only with take-out and delivery orders.
update public.inventory_items i
   set takeout_only = true
  from public.inventory_categories c
 where c.id = i.category_id
   and i.is_active
   and c.sheet_type in ('shake', 'coffee_general', 'food', 'food_2', 'production')
   and (i.name ilike '%cup%' or i.name ilike '%dome%' or i.name ilike '%lid%')
   and i.name not ilike '%strawberry%';
