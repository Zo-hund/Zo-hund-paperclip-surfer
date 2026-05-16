export const AIR_HUB_EMAILS = {
  booking: "booking@amx-air-hubs.cc",
  sales: "sales@amx-air-hubs.cc",
  agents: "agents@amx-air-hubs.cc",
  support: "support@amx-air-hubs.cc",
  onboarding: "onboarding@amx-air-hubs.cc",
  collectives: "collectives@amx-air-hubs.cc",
  electives: "electives@amx-air-hubs.cc",
  community: "community@amx-air-hubs.cc",
} as const;

export type MarketplaceRoleIntent = "none" | "member" | "partner";
export type MarketplacePartnerStatus =
  | "none"
  | "pending"
  | "active"
  | "rejected";

export function getCurrentAirHubLane(
  roleIntent: MarketplaceRoleIntent,
  partnerStatus: MarketplacePartnerStatus,
): "community" | "collective" {
  if (partnerStatus !== "none" || roleIntent === "partner") {
    return "collective";
  }
  return "community";
}

export function getCurrentAirHubLaneLabel(
  roleIntent: MarketplaceRoleIntent,
  partnerStatus: MarketplacePartnerStatus,
): string {
  return getCurrentAirHubLane(roleIntent, partnerStatus) === "collective"
    ? "Collective"
    : "Community";
}
