-- Prices: one shared FoodPanda / Grab price per menu item, per-branch price
-- overrides, and the live push that lets the tills pick changes up at once.
-- Applied to the live project on 2026-10-09 through the Supabase MCP.

-- One delivery price per item, shared by FoodPanda and Grab. Null = the item is not
-- offered on the delivery platforms, and the till uses the normal price.
alter table public.products add column if not exists delivery_price numeric;

-- A branch-only price. Each column overrides the menu's matching price for that
-- branch; a null column means "same as the menu". Head office sets these from the
-- Menu page by applying a price to chosen branches only.
create table if not exists public.branch_product_prices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric check (price is null or price >= 0),
  delivery_price numeric check (delivery_price is null or delivery_price >= 0),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (branch_id, product_id)
);

alter table public.branch_product_prices enable row level security;

do $$
begin
  -- The till runs as anon and must read its branch's prices; the portals read them too.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_product_prices' and policyname = 'bpp_read_all') then
    create policy bpp_read_all on public.branch_product_prices for select using (true);
  end if;
  -- Only the master admin sets prices.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'branch_product_prices' and policyname = 'bpp_master_all') then
    create policy bpp_master_all on public.branch_product_prices for all
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master_admin')
      with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'master_admin');
  end if;
end $$;

-- Live push to the tills. The POS already listens for changes on these tables; until
-- now none of them was published, so no change ever reached an open till.
do $$
declare t text;
begin
  foreach t in array array['products', 'branch_menu_availability', 'branch_product_prices'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
