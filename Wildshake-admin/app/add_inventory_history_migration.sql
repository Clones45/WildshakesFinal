-- Inventory change history for the master admin's Inventory panel.
-- Run once in the Supabase SQL editor.
--
-- Every change AdminCentral makes to items, categories, branch tags, recipes,
-- a branch's daily counts, or a branch's menu availability is written here
-- (who, when, what changed, before and after). Until this table exists, the
-- changes themselves still save; only the history line is skipped and the
-- History tab says so.
--
-- Only the portal's server (service role) reads and writes this table, so RLS
-- is enabled with no policies: the POS key and browser sessions cannot touch it.

CREATE TABLE IF NOT EXISTS public.inventory_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_email     text,
  actor_auth_id   uuid,
  area            text        NOT NULL,   -- item | category | tags | recipe | daily_log | availability | import
  action          text        NOT NULL,   -- create | update | retire | restore | delete | copy | import
  summary         text        NOT NULL,   -- one plain-language line, shown in the History tab
  branch_id       uuid,
  reference_table text,
  reference_id    uuid,
  before          jsonb,
  after           jsonb
);

CREATE INDEX IF NOT EXISTS inventory_history_created_at_idx ON public.inventory_history (created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_history_reference_idx  ON public.inventory_history (reference_table, reference_id);
CREATE INDEX IF NOT EXISTS inventory_history_branch_idx     ON public.inventory_history (branch_id, created_at DESC);

ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.inventory_history IS
  'Master-admin inventory change log (items, categories, tags, recipes, daily counts, availability). Service role only.';
