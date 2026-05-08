-- Migration: add stock_qty to branch_menu_availability
-- Allows cashiers to set per-branch quantity limits on menu items.
-- When stock_qty reaches 0 (decremented by POS on each sale), 
-- the item is automatically hidden from the menu.

ALTER TABLE branch_menu_availability
    ADD COLUMN IF NOT EXISTS stock_qty integer DEFAULT NULL;

-- Comment to clarify semantics
COMMENT ON COLUMN branch_menu_availability.stock_qty IS
    'NULL = unlimited. Set a positive integer to limit how many can be sold today. Decremented by the POS on checkout. Auto-hides item when 0.';
