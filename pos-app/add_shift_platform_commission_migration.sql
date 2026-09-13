-- Migration: FoodPanda and Grab commission on shifts
--
-- At the end of a shift the cashier enters the percentage cut FoodPanda and
-- Grab keep of their gross. The POS deducts it on the shift report and sends
-- the figures here so the portal can report net after commission.
--
-- The app tolerates these columns being absent (if the sync is rejected for
-- them, the shift is re-sent without), so run this whenever convenient —
-- nothing breaks in the meantime; the figures just stay on the tablet and the
-- paper until the columns exist.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS foodpanda_sales   numeric,
    ADD COLUMN IF NOT EXISTS grab_sales        numeric,
    ADD COLUMN IF NOT EXISTS foodpanda_commission_pct numeric,
    ADD COLUMN IF NOT EXISTS grab_commission_pct      numeric,
    ADD COLUMN IF NOT EXISTS foodpanda_commission     numeric,
    ADD COLUMN IF NOT EXISTS grab_commission          numeric,
    ADD COLUMN IF NOT EXISTS net_after_commission    numeric;

COMMENT ON COLUMN shifts.foodpanda_commission_pct IS 'Percent of FoodPanda gross the platform kept, as entered at close.';
COMMENT ON COLUMN shifts.grab_commission_pct      IS 'Percent of Grab gross the platform kept, as entered at close.';
COMMENT ON COLUMN shifts.net_after_commission    IS 'net_sales minus foodpanda_commission minus grab_commission.';
