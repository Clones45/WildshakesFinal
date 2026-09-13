-- Migration: add difference_note to shifts
--
-- When the counted drawer doesn't match the expected cash, the POS now asks the
-- cashier for a reason, prints it on the shift report, and sends it here.
--
-- The app tolerates this column being absent (if the sync is rejected for it,
-- the shift is re-sent without the note), so run this whenever convenient —
-- nothing breaks in the meantime, the note just stays on the tablet and the
-- paper until it exists.

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS difference_note text;

COMMENT ON COLUMN shifts.difference_note IS
    'Cashier''s reason when actual_cash differed from expected_cash. NULL when the drawer matched.';
