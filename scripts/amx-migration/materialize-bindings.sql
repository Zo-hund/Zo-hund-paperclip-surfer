-- Run only inside the isolated conversion transaction, after data preservation
-- checks. Agent JSON is preserved; this builds explicit tenant-bound leases.
CREATE TEMP TABLE amx_expected_agent_bindings ON COMMIT DROP AS
SELECT a.company_id, a.id::text AS target_id, e.key AS env_key,
       e.value->>'secretId' AS secret_id,
       coalesce(e.value->>'version','latest') AS version_selector,
       coalesce(e.value->>'projectionClass','unclassified') AS projection_class,
       e.value->>'projectionAllowlistKey' AS projection_allowlist_key
FROM agents a
CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.adapter_config->'env')='object'
  THEN a.adapter_config->'env' ELSE '{}'::jsonb END) e
WHERE e.value->>'type'='secret_ref';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM amx_expected_agent_bindings b
    LEFT JOIN company_secrets s ON s.id::text=b.secret_id AND s.company_id=b.company_id
    WHERE s.id IS NULL OR s.scope <> 'company'
  ) THEN RAISE EXCEPTION 'Agent secret reference is missing or belongs to another company'; END IF;
  IF EXISTS (
    SELECT 1 FROM amx_expected_agent_bindings
    WHERE env_key !~ '^[A-Za-z_][A-Za-z0-9_]*$'
       OR version_selector !~ '^(latest|[1-9][0-9]*)$'
       OR projection_class <> 'unclassified' OR projection_allowlist_key IS NOT NULL
  ) THEN RAISE EXCEPTION 'Invalid legacy secret binding path or version'; END IF;
END $$;

INSERT INTO company_secret_bindings
  (company_id,secret_id,target_type,target_id,config_path,version_selector,required,projection_class,projection_allowlist_key)
SELECT company_id,secret_id::uuid,'agent',target_id,'env.'||env_key,version_selector,true,projection_class,projection_allowlist_key
FROM amx_expected_agent_bindings
ON CONFLICT (company_id,target_type,target_id,config_path) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM amx_expected_agent_bindings expected
    LEFT JOIN company_secret_bindings actual
      ON actual.company_id=expected.company_id AND actual.target_type='agent'
      AND actual.target_id=expected.target_id AND actual.config_path='env.'||expected.env_key
    WHERE actual.id IS NULL OR actual.secret_id::text <> expected.secret_id
       OR actual.version_selector <> expected.version_selector
       OR actual.projection_class <> expected.projection_class
       OR actual.projection_allowlist_key IS DISTINCT FROM expected.projection_allowlist_key
       OR NOT actual.required
  ) THEN RAISE EXCEPTION 'Existing secret binding conflicts with preserved agent configuration'; END IF;
END $$;
