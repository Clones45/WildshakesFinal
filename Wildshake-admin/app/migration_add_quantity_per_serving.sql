-- Migration: add quantity_per_serving to food_item_menu_links
-- Run this in Supabase SQL Editor or via supabase db push
--
-- This column stores how many grams (or pieces, depending on unit)
-- of each ingredient is needed per one serving of the linked POS menu item.
-- Values come from the Wildshakes Food & Drinks Inventory CSV recipe matrix.

ALTER TABLE food_item_menu_links
  ADD COLUMN IF NOT EXISTS quantity_per_serving NUMERIC DEFAULT NULL;

-- Optional: add a comment for documentation
COMMENT ON COLUMN food_item_menu_links.quantity_per_serving IS
  'Grams or pieces of this ingredient needed per one serving of the linked POS product. Populated via the Recipe Import tool.';
