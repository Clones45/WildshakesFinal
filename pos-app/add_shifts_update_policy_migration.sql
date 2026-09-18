-- Shifts: let the POS (anon key) update its own shift rows.
--
-- History:
--   * The client first applied this as policy "shifts_update_pos" with USING (status = 'open'),
--     so a tablet could close an open shift.
--   * 2026-09-18: widened to open OR closed (migration shifts_update_allow_resend_of_closed).
--     The POS syncs a shift as "insert, or update if it exists" and retries until it succeeds;
--     re-sending a shift the server already had as closed (e.g. with the commission figures
--     that had no columns until then) was refused on every retry, ~3,000 errors a day.
--     A tablet is the only writer of its own shifts (local_ref is unique per tablet), so the
--     re-send is safe, and a shift can never leave the open/closed pair.
--
-- Already applied to the live project; kept here as the record.

ALTER POLICY shifts_update_pos ON public.shifts
  USING (status = ANY (ARRAY['open'::text, 'closed'::text]))
  WITH CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));
