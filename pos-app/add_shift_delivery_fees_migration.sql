-- Migration: delivery platform fees on shifts
--
-- At the end of a shift the cashier enters the percentage FoodPanda and Grab
-- keep of their gross. The POS deducts it on the shift report and sends the
-- figures here so the portal can report net after platform fees.
--
-- The app tolerates these columns being absent (if the sync is rejected for
-- them, the shift is re-sent without), so run this whenever convenient —
-- nothing breaks in the meantime; the figures just stay on the tablet and the
-- paper until the columns exist.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS foodpanda_sales   numeric,
    ADD COLUMN IF NOT EXISTS grab_sales        numeric,
    ADD COLUMN IF NOT EXISTS foodpanda_fee_pct numeric,
    ADD COLUMN IF NOT EXISTS grab_fee_pct      numeric,
    ADD COLUMN IF NOT EXISTS foodpanda_fee     numeric,
    ADD COLUMN IF NOT EXISTS grab_fee          numeric,
    ADD COLUMN IF NOT EXISTS net_after_fees    numeric;

COMMENT ON COLUMN shifts.foodpanda_fee_pct IS 'Percent of FoodPanda gross the platform kept, as entered at close.';
COMMENT ON COLUMN shifts.grab_fee_pct      IS 'Percent of Grab gross the platform kept, as entered at close.';
COMMENT ON COLUMN shifts.net_after_fees    IS 'net_sales minus foodpanda_fee minus grab_fee.';
