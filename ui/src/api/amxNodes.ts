import type {
  AmxDispatchLease,
  AmxDispatchLeaseCreated,
  AmxDispatchEvidence,
  AmxNode,
  CreateAmxDispatchLease,
  CreateAmxNode,
  UpdateAmxNode,
} from "@paperclipai/shared";
import { api } from "./client";

const base = (companyId: string) => `/companies/${encodeURIComponent(companyId)}/amx-nodes`;

export const amxNodesApi = {
  list: (companyId: string) => api.get<AmxNode[]>(base(companyId)),
  get: (companyId: string, nodeId: string) =>
    api.get<AmxNode>(`${base(companyId)}/${encodeURIComponent(nodeId)}`),
  create: (companyId: string, data: CreateAmxNode) =>
    api.post<AmxNode>(base(companyId), data),
  update: (companyId: string, nodeId: string, data: UpdateAmxNode) =>
    api.patch<AmxNode>(`${base(companyId)}/${encodeURIComponent(nodeId)}`, data),
  heartbeat: (companyId: string, nodeId: string, data: UpdateAmxNode) =>
    api.post<AmxNode>(`${base(companyId)}/${encodeURIComponent(nodeId)}/heartbeat`, data),
  listLeases: (companyId: string) =>
    api.get<AmxDispatchLease[]>(`${base(companyId)}/dispatch/leases`),
  listEvidence: (companyId: string) =>
    api.get<AmxDispatchEvidence[]>(`${base(companyId)}/dispatch/evidence`),
  listNodeLeases: (companyId: string, nodeId: string) =>
    api.get<AmxDispatchLease[]>(
      `${base(companyId)}/${encodeURIComponent(nodeId)}/dispatch/leases`,
    ),
  listNodeEvidence: (companyId: string, nodeId: string) =>
    api.get<AmxDispatchEvidence[]>(
      `${base(companyId)}/${encodeURIComponent(nodeId)}/dispatch/evidence`,
    ),
  createLease: (companyId: string, data: CreateAmxDispatchLease) =>
    api.post<AmxDispatchLeaseCreated>(`${base(companyId)}/dispatch/leases`, data),
  revokeLease: (companyId: string, leaseId: string) =>
    api.post<AmxDispatchLease>(
      `${base(companyId)}/dispatch/leases/${encodeURIComponent(leaseId)}/revoke`,
      {},
    ),
  consumeLease: (companyId: string, nodeId: string, leaseId: string, leaseToken: string) =>
    api.postWithHeaders<AmxDispatchLease>(
      `${base(companyId)}/${encodeURIComponent(nodeId)}/dispatch/leases/${encodeURIComponent(leaseId)}/consume`,
      {},
      { Authorization: `Bearer ${leaseToken}` },
    ),
};
