-- Owner discount (20%) on the POS.
-- Run once in the Supabase SQL editor, BEFORE cashiers start using the new Owner button.
--
-- The transactions table only accepts the discount types it was created with
-- (none, senior, pwd, manager, custom). This adds "owner". Until it is run, a sale
-- with the Owner discount is still saved and synced, but it is recorded as a
-- "custom" discount of the same amount (the audit trail still says "owner").

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_discount_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_discount_type_check
  CHECK (discount_type IN ('none', 'senior', 'pwd', 'manager', 'owner', 'custom'));
