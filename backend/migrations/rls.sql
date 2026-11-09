-- Row-level security for Sentinel AI (PostgreSQL 15+ with pgvector).
-- Statements are separated by "-- >>>" so init_db() can execute them one by one.
--
-- Model: the API connects as a non-superuser role (sentinel_app) and sets
--   SELECT set_config('app.current_org', '<org uuid>', true)
-- once per request (see db.set_request_org). Every policy compares org_id with
-- that setting, so a query that forgets a WHERE clause still cannot cross tenants.
--
-- Note: table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set, which is
-- why we force it below. Run this as a superuser during provisioning.

-- >>> ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
-- >>> ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
-- >>> CREATE POLICY org_isolation ON organisations USING (id = current_setting('app.current_org', true));

-- >>> DO $$
-- >>> DECLARE t text;
-- >>> BEGIN
-- >>>   FOREACH t IN ARRAY ARRAY[
-- >>>     'users','memberships','brand_kits','documents','chunks','rules','rule_versions','terms',
-- >>>     'facts','assets','content_items','content_versions','analysis_runs','findings','decisions',
-- >>>     'overrides','comments','approvals','audit_log','regression_runs'
-- >>>   ]
-- >>>   LOOP
-- >>>     EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
-- >>>     EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
-- >>>     EXECUTE format(
-- >>>       'CREATE POLICY org_isolation ON %I USING (org_id = current_setting(''app.current_org'', true))', t);
-- >>>   END LOOP;
-- >>> END $$;

-- >>> CREATE ROLE sentinel_app NOLOGIN;
-- >>> GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sentinel_app;
-- >>> GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sentinel_app;

-- Audit log is append-only at the database level too: no UPDATE/DELETE grants.
-- >>> REVOKE UPDATE, DELETE ON audit_log FROM sentinel_app;

-- Approvals: a database-level guard against self-approval, independent of the API.
-- >>> CREATE OR REPLACE FUNCTION reject_self_approval() RETURNS trigger AS $$
-- >>> BEGIN
-- >>>   IF EXISTS (SELECT 1 FROM content_items ci WHERE ci.id = NEW.content_item_id
-- >>>              AND ci.owner_id = NEW.actor_id AND NEW.action = 'approve') THEN
-- >>>     RAISE EXCEPTION 'Nobody can approve their own content item';
-- >>>   END IF;
-- >>>   RETURN NEW;
-- >>> END $$ LANGUAGE plpgsql;
-- >>> DROP TRIGGER IF EXISTS trg_no_self_approval ON approvals;
-- >>> CREATE TRIGGER trg_no_self_approval BEFORE INSERT ON approvals
-- >>>   FOR EACH ROW EXECUTE FUNCTION reject_self_approval();

-- Vector index for brand-kit retrieval (cosine distance).
-- >>> CREATE TABLE IF NOT EXISTS chunk_vectors (
-- >>>   chunk_id text PRIMARY KEY,
-- >>>   org_id   text NOT NULL,
-- >>>   embedding vector(1536)
-- >>> );
-- >>> CREATE INDEX IF NOT EXISTS ix_chunk_vectors_org ON chunk_vectors (org_id);
-- >>> CREATE INDEX IF NOT EXISTS ix_chunk_vectors_ivfflat
-- >>>   ON chunk_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
