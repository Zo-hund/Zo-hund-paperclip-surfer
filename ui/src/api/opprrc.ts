import type { OpprcAudience, OpprcCategorySlug, OpprcDeliveryReviewStatus } from "@paperclipai/shared";
import { api } from "./client";

/** Mirrors packages/db/src/schema/opprrc_deliveries.ts opprrcDeliveries. */
export interface OpprcDelivery {
  id: string;
  companyId: string;
  issueId: string;
  assetId: string | null;
  category: OpprcCategorySlug;
  audience: OpprcAudience;
  locationSlug: string | null;

  liveStorage: string;
  vpsFilePath: string | null;
  vpsFileUrl: string | null;
  vpsVerifiedAt: string | null;

  backupStorage: string;
  googleDriveFileId: string | null;
  googleDriveFolderId: string | null;
  googleDriveFileUrl: string | null;
  backupStatus: "not_started" | "synced" | "failed" | "stale";
  lastBackupAt: string | null;

  reviewStatus: OpprcDeliveryReviewStatus;

  runNumber: number | null;
  runBatchId: string | null;

  deliveredAt: string;
  deliveredByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpprcDeliverResult {
  deliveryId: string;
  vpsFilePath: string;
  vpsFileUrl: string;
  runNumber: number;
}

export interface OpprcDeliverInput {
  issueId: string;
  assetId: string;
  category: OpprcCategorySlug;
  audience?: OpprcAudience;
  locationSlug?: string;
  costEstimateTokens?: number;
}

export const opprrcApi = {
  listDeliveries: (companyId: string, issueId?: string) =>
    api.get<OpprcDelivery[]>(
      `/companies/${companyId}/opprrc/deliveries${issueId ? `?issueId=${encodeURIComponent(issueId)}` : ""}`,
    ),
  getDelivery: (companyId: string, deliveryId: string) =>
    api.get<OpprcDelivery>(`/companies/${companyId}/opprrc/deliveries/${deliveryId}`),
  deliver: (companyId: string, body: OpprcDeliverInput) =>
    api.post<OpprcDeliverResult>(`/companies/${companyId}/opprrc/deliveries`, body),
};
