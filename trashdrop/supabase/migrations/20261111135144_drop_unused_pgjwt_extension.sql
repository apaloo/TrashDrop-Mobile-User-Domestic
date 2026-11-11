-- Drop the unused pgjwt extension.
--
-- Applied to production on 2026-11-11 through the Supabase MCP (the version
-- above matches the project's migration history). pgjwt had no dependent
-- objects and no function in the app schemas referenced it. It was the only
-- blocker Supabase listed for the Postgres upgrade (tech-debt TD22).
--
-- Rollback (only if something turns out to need it):
--   create extension if not exists pgjwt;

drop extension if exists pgjwt;
