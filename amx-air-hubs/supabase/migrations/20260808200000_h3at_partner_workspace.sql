insert into public.partner_organizations (
  id, name, organization_type, status, brand_color, website_url, mission_ids, agent_ids, proof_scope,
  report_template, certificate_name, certificate_sponsor, proof_signature, marketplace_offer_ids
) values (
  'h3at-solutions', 'H3AT Solutions', 'Workforce & Innovation Partner', 'active', '#1bb5a7', 'https://www.h3atsolutions.com/',
  array['xrt-green-mode','project-checklist','sponsor-demo','webxr-creator'], array['jaz','taz','raz','naz','zohund'], 'h3at-solutions',
  'H3AT and AMX workforce, project, employer, and economic impact report.', 'H3AT + AMX Talent Passport', 'H3AT Solutions + AMX LAB',
  'h3at-amx-proof', array['next','cohort','workshop','trainer','sponsor','agent']
)
on conflict (id) do update set organization_type=excluded.organization_type, status='active', brand_color=excluded.brand_color,
website_url=excluded.website_url, mission_ids=excluded.mission_ids, agent_ids=excluded.agent_ids, proof_scope=excluded.proof_scope,
report_template=excluded.report_template, certificate_name=excluded.certificate_name, certificate_sponsor=excluded.certificate_sponsor,
proof_signature=excluded.proof_signature, marketplace_offer_ids=excluded.marketplace_offer_ids, updated_at=now();

insert into public.partner_memberships (organization_id, user_id, role, status)
select 'h3at-solutions', profiles.id, 'owner', 'active' from public.member_profiles profiles
where profiles.membership_role = 'operator' and profiles.membership_status = 'active'
on conflict (organization_id, user_id) do update set role='owner', status='active', updated_at=now();

insert into public.partner_campaigns (organization_id, slug, name, summary, mission_id, location_tag, status, target_completions)
values ('h3at-solutions', 'workforce-innovation-pathway', 'H3AT + AMX Workforce Innovation Pathway',
'Learn, simulate, build, apply, connect, work, earn, and grow through verified workforce projects.', 'project-checklist', 'h3at-workforce', 'live', 500)
on conflict (organization_id, slug) do update set summary=excluded.summary, status='live', target_completions=excluded.target_completions, updated_at=now();
