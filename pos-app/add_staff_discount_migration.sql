-- Staff Discount (SD) on the POS: fixed pesos off each unit (10 for a Petite fruitshake or
-- milkshake, 20 for anything else). Adds 'staff' to the accepted discount types.
-- Applied to the live project on 2026-09-18 (migration allow_staff_discount_type); kept as the record.

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_discount_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_discount_type_check
  CHECK (discount_type IN ('none', 'senior', 'pwd', 'manager', 'owner', 'staff', 'custom'));
