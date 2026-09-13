-- Migration: let the POS close a shift it opened
--
-- The POS syncs shifts with an upsert: it INSERTs the row when a shift opens,
-- then the same upsert UPDATEs that row when the shift closes. Row Level
-- Security on public.shifts allowed the POS (anonymous) role to INSERT but not
-- UPDATE, so every shift that reached the server while still open could never
-- be closed there. It stayed "open" forever and the tablet retried every 30 s,
-- producing a steady stream of
--
--   42501: new row violates row-level security policy (USING expression)
--          for table "shifts"
--
-- (Postgres raises that when an upsert's conflicting row fails the UPDATE
-- policy's USING check.) Verified 2026-09-13: the same upsert succeeds with the
-- service key and is refused with the POS key.
--
-- This grants UPDATE only while a row is still open, so once a shift is closed
-- it cannot be altered through the POS key. Permissive policies are OR-ed, so
-- adding this alongside any existing policy is safe.
--
-- After running it, every tablet's stuck closes sync themselves within a few
-- minutes and the errors stop. Verify with:
--   select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'shifts';

CREATE POLICY "POS can close an open shift"
    ON public.shifts
    FOR UPDATE
    TO anon
    USING (status = 'open')
    WITH CHECK (true);
