import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("partner workspaces and invitations are row-level secured", async () => {
  const schema = await read("supabase/migrations/20260720193646_partner_portal.sql");
  assert.match(schema, /alter table public\.partner_organizations enable row level security/);
  assert.match(schema, /alter table public\.partner_memberships enable row level security/);
  assert.match(schema, /private\.has_partner_role/);
  assert.match(schema, /digest\(generated_token, 'sha256'\)/);
  assert.match(schema, /signed_in_email is distinct from lower\(selected_invitation\.email\)/);
  assert.match(schema, /target_event_type <> 'scan' and \(select auth\.uid\(\)\) is null/);
});

test("partner role changes and analytics columns are database hardened", async () => {
  const hardening = await read("supabase/migrations/20260720201500_partner_role_hardening.sql");
  const advisors = await read("supabase/migrations/20260720202500_partner_advisor_hardening.sql");
  assert.match(hardening, /Only an owner can change owner access/);
  assert.match(hardening, /Every partner organization must retain an active owner/);
  assert.match(hardening, /revoke update, delete on public\.partner_memberships from authenticated/);
  assert.match(hardening, /grant update \(\s*slug, name, summary, mission_id, location_tag, status,/);
  assert.doesNotMatch(hardening, /grant update \([^)]*scan_count/);
  assert.match(advisors, /partner_campaign_events_campaign_idx/);
  assert.match(advisors, /to anon\s+using \(\s+membership_status = 'active'/);
  assert.match(advisors, /to authenticated\s+using \(/);
});

test("partner routes connect campaign attribution to mission outcomes", async () => {
  const routes = await read("src/App.tsx");
  const platform = await read("src/partner-platform.ts");
  const missions = await read("src/pages/core.tsx");
  const marketplace = await read("src/pages/secondary.tsx");
  assert.match(routes, /path="\/partners" element={<RequireMember><PartnerPortalPage\/><\/RequireMember>}/);
  assert.match(routes, /path="\/partner\/:organizationId\/:campaignSlug" element={<PartnerCampaignResolverPage\/>}/);
  assert.match(platform, /recordActivePartnerCampaignEvent/);
  assert.match(missions, /recordActivePartnerCampaignEvent\("start",\s*mission\.id\)/);
  assert.match(missions, /recordActivePartnerCampaignEvent\("completion",\s*mission\.id\)/);
  assert.match(marketplace, /recordActivePartnerCampaignEvent\("marketplace"\)/);
});
