CREATE TABLE IF NOT EXISTS public.lms_programs (
  id text PRIMARY KEY, tenant_id text NOT NULL, title text NOT NULL, mode text NOT NULL, status text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lms_programs_tenant_idx ON public.lms_programs (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id text PRIMARY KEY, tenant_id text NOT NULL, program_id text NOT NULL REFERENCES public.lms_programs(id) ON DELETE CASCADE,
  learner_id uuid NOT NULL REFERENCES auth.users(id), learner_name text NOT NULL, status text NOT NULL DEFAULT 'active', completed_module_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  attendance_minutes integer NOT NULL DEFAULT 0, evidence_count integer NOT NULL DEFAULT 0, score integer NOT NULL DEFAULT 0, earned_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, program_id, learner_id)
);
CREATE INDEX IF NOT EXISTS lms_enrollments_program_idx ON public.lms_enrollments (tenant_id, program_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS lms_enrollments_learner_idx ON public.lms_enrollments (tenant_id, learner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.lms_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text NOT NULL, program_id text NOT NULL REFERENCES public.lms_programs(id) ON DELETE CASCADE,
  enrollment_id text NOT NULL REFERENCES public.lms_enrollments(id) ON DELETE CASCADE, module_id text NOT NULL, event_type text NOT NULL, value integer NOT NULL DEFAULT 1,
  actor_id uuid NOT NULL REFERENCES auth.users(id), payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lms_activity_events_enrollment_idx ON public.lms_activity_events (tenant_id, enrollment_id, created_at DESC);

ALTER TABLE public.lms_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read published tenant programs" ON public.lms_programs FOR SELECT TO authenticated
USING (status = 'published' OR private.can_manage_connection_tenant(tenant_id));
CREATE POLICY "operators manage tenant programs" ON public.lms_programs FOR ALL TO authenticated
USING (private.can_manage_connection_tenant(tenant_id)) WITH CHECK (private.can_manage_connection_tenant(tenant_id));

CREATE POLICY "members read own tenant enrollments" ON public.lms_enrollments FOR SELECT TO authenticated
USING (learner_id = (SELECT auth.uid()) OR private.can_manage_connection_tenant(tenant_id));
CREATE POLICY "members create own tenant enrollments" ON public.lms_enrollments FOR INSERT TO authenticated
WITH CHECK (learner_id = (SELECT auth.uid()) AND (EXISTS (SELECT 1 FROM public.lms_programs p WHERE p.id = program_id AND p.tenant_id = tenant_id AND p.status = 'published')));
CREATE POLICY "members update own tenant enrollments" ON public.lms_enrollments FOR UPDATE TO authenticated
USING (learner_id = (SELECT auth.uid()) OR private.can_manage_connection_tenant(tenant_id))
WITH CHECK (learner_id = (SELECT auth.uid()) OR private.can_manage_connection_tenant(tenant_id));

CREATE POLICY "members read own activity" ON public.lms_activity_events FOR SELECT TO authenticated
USING ((EXISTS (SELECT 1 FROM public.lms_enrollments e WHERE e.id = enrollment_id AND e.learner_id = (SELECT auth.uid()))) OR private.can_manage_connection_tenant(tenant_id));
CREATE POLICY "members create own activity" ON public.lms_activity_events FOR INSERT TO authenticated
WITH CHECK (actor_id = (SELECT auth.uid()) AND (EXISTS (SELECT 1 FROM public.lms_enrollments e WHERE e.id = enrollment_id AND e.learner_id = (SELECT auth.uid()))));

GRANT SELECT, INSERT, UPDATE ON public.lms_programs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.lms_enrollments TO authenticated;
GRANT SELECT, INSERT ON public.lms_activity_events TO authenticated;

INSERT INTO public.lms_programs (id, tenant_id, title, mode, status, payload, created_by)
VALUES ('future-skills-live-runway', 'tech-at-nite', 'Future Skills Live Runway', 'market_sim', 'published',
  '{"id":"future-skills-live-runway","tenantId":"tech-at-nite","title":"Future Skills Live Runway","summary":"Train, rehearse, prove, and promote a community production team into a paid XR showcase.","mode":"market_sim","status":"published","facilitator":"JAZ + AMX Operator","modules":[{"id":"ai-production-brief","title":"AI Production Brief","stage":"learn","summary":"Build a responsible show brief with agent guidance.","durationMinutes":35,"unlockAfterModuleId":null,"availableAt":null,"missionId":"ai-101","liveRoom":null,"rewardXp":100,"rewardCents":0},{"id":"pod-rehearsal","title":"Pod Rehearsal","stage":"practice","summary":"Assign roles, route media, and rehearse cues in a live Pod.","durationMinutes":55,"unlockAfterModuleId":"ai-production-brief","availableAt":null,"missionId":"automations","liveRoom":"NEXUS1","rewardXp":140,"rewardCents":0},{"id":"operator-proof","title":"Operator Proof","stage":"prove","summary":"Submit run-of-show, tool traces, and reflection for approval.","durationMinutes":30,"unlockAfterModuleId":"pod-rehearsal","availableAt":null,"missionId":null,"liveRoom":null,"rewardXp":175,"rewardCents":0},{"id":"expo-showcase","title":"Expo Showcase","stage":"live","summary":"Promote the approved run to the AMX XR Stage.","durationMinutes":45,"unlockAfterModuleId":"operator-proof","availableAt":null,"missionId":null,"liveRoom":"AMXSTAGE","rewardXp":225,"rewardCents":0},{"id":"paid-production-run","title":"Paid Production Run","stage":"earn","summary":"Operator-approved project settlement through the earning ledger.","durationMinutes":60,"unlockAfterModuleId":"expo-showcase","availableAt":null,"missionId":null,"liveRoom":null,"rewardXp":250,"rewardCents":7500}]}'::jsonb,
  NULL)
ON CONFLICT (id) DO NOTHING;
