CREATE TABLE IF NOT EXISTS public.x402_payment_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_id text NOT NULL,
  service_id text NOT NULL,
  agent_id text NOT NULL,
  identity_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  approval_status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS x402_payment_events_tenant_idx ON public.x402_payment_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS x402_payment_events_quote_idx ON public.x402_payment_events (tenant_id, quote_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.x402_approval_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_id text NOT NULL UNIQUE,
  service_id text NOT NULL,
  agent_id text NOT NULL,
  identity_id text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS x402_approval_requests_tenant_idx ON public.x402_approval_requests (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.x402_service_meter_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  service_id text NOT NULL,
  agent_id text NOT NULL,
  identity_id text NOT NULL,
  unit text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount_cents integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS x402_service_meter_events_tenant_idx ON public.x402_service_meter_events (tenant_id, created_at DESC);

ALTER TABLE public.x402_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x402_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x402_service_meter_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own or tenant x402 payment events" ON public.x402_payment_events;
CREATE POLICY "members read own or tenant x402 payment events"
  ON public.x402_payment_events
  FOR SELECT
  TO authenticated
  USING (identity_id = (SELECT auth.uid())::text OR private.can_manage_connection_tenant(tenant_id));

DROP POLICY IF EXISTS "operators manage tenant x402 payment events" ON public.x402_payment_events;
CREATE POLICY "operators manage tenant x402 payment events"
  ON public.x402_payment_events
  FOR ALL
  TO authenticated
  USING (private.can_manage_connection_tenant(tenant_id))
  WITH CHECK (private.can_manage_connection_tenant(tenant_id));

DROP POLICY IF EXISTS "members read own or tenant x402 approvals" ON public.x402_approval_requests;
CREATE POLICY "members read own or tenant x402 approvals"
  ON public.x402_approval_requests
  FOR SELECT
  TO authenticated
  USING (identity_id = (SELECT auth.uid())::text OR private.can_manage_connection_tenant(tenant_id));

DROP POLICY IF EXISTS "operators manage tenant x402 approvals" ON public.x402_approval_requests;
CREATE POLICY "operators manage tenant x402 approvals"
  ON public.x402_approval_requests
  FOR ALL
  TO authenticated
  USING (private.can_manage_connection_tenant(tenant_id))
  WITH CHECK (private.can_manage_connection_tenant(tenant_id));

DROP POLICY IF EXISTS "members read own or tenant x402 meters" ON public.x402_service_meter_events;
CREATE POLICY "members read own or tenant x402 meters"
  ON public.x402_service_meter_events
  FOR SELECT
  TO authenticated
  USING (identity_id = (SELECT auth.uid())::text OR private.can_manage_connection_tenant(tenant_id));

DROP POLICY IF EXISTS "operators manage tenant x402 meters" ON public.x402_service_meter_events;
CREATE POLICY "operators manage tenant x402 meters"
  ON public.x402_service_meter_events
  FOR ALL
  TO authenticated
  USING (private.can_manage_connection_tenant(tenant_id))
  WITH CHECK (private.can_manage_connection_tenant(tenant_id));

GRANT SELECT, INSERT, UPDATE ON public.x402_payment_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.x402_approval_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.x402_service_meter_events TO authenticated;
