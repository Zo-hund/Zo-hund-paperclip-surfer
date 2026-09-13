/** AMX defaults and delivery contracts retained across upstream migration. */
export const AMX_REQUIRE_NEW_AGENT_APPROVAL = true;

export const OPPRRC_CATEGORY_SLUGS = [
  "01_organizations", "02_programs", "03_projects", "04_resources",
  "05_reports", "06_certificates",
] as const;
export type OpprcCategorySlug = (typeof OPPRRC_CATEGORY_SLUGS)[number];

export const OPPRRC_AUDIENCES = ["BOARD-INTERNAL", "CLIENTS-EXTERNAL"] as const;
export type OpprcAudience = (typeof OPPRRC_AUDIENCES)[number];

export const OPPRRC_DELIVERY_REVIEW_STATUSES = [
  "not_submitted", "pending_review", "approved", "revision_requested", "rejected",
] as const;
export type OpprcDeliveryReviewStatus = (typeof OPPRRC_DELIVERY_REVIEW_STATUSES)[number];
