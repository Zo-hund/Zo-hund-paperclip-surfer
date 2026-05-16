import type {
  Approval,
  DocumentRevision,
  Issue,
  IssueAttachment,
  IssueComment,
  IssueDocument,
  IssueLabel,
  IssueWorkProduct,
  UpsertIssueDocument,
} from "@paperclipai/shared";
import { api } from "./client";

export type MicroserviceWorkOrderStage = "pre_production" | "production" | "post_generation";

export interface MicroserviceWorkOrderTimeCard {
  id: string;
  phase: MicroserviceWorkOrderStage;
  title: string;
  hours: number;
  notes: string | null;
  recordedAt: string;
  recordedByUserId: string | null;
  recordedByAgentId: string | null;
}

export interface MicroserviceWorkOrderMetadata {
  kind: "microservice_work_order";
  version: 1;
  client: {
    name: string | null;
    email: string | null;
    company: string | null;
  };
  task: {
    listingId: string;
    transactionId: string | null;
    taskType: string;
    runPhase: string;
    targetUrl: string | null;
    title: string;
    instructions: string;
  };
  tracking: {
    currentStage: MicroserviceWorkOrderStage;
    preProductionNotes: string | null;
    productionNotes: string | null;
    postGenerationNotes: string | null;
    lastUpdatedAt: string;
  };
  timeCards: MicroserviceWorkOrderTimeCard[];
  emailLog: Array<{
    id: string;
    to: string;
    subject: string;
    stage: MicroserviceWorkOrderStage;
    sentAt: string;
    messageId: string | null;
  }>;
}

export interface MicroserviceWorkOrderResponse {
  issue: {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    billingCode: string | null;
  };
  workOrder: IssueWorkProduct;
  metadata: MicroserviceWorkOrderMetadata;
  summary: string;
}

export interface PublicTrackStatus {
  identifier: string | null;
  title: string;
  status: string;
  priority: string | null;
  agentName: string | null;
  createdAt: string;
  updatedAt: string;
}

export const issuesApi = {
  list: (
    companyId: string,
    filters?: {
      status?: string;
      projectId?: string;
      assigneeAgentId?: string;
      participantAgentId?: string;
      assigneeUserId?: string;
      touchedByUserId?: string;
      inboxArchivedByUserId?: string;
      unreadForUserId?: string;
      labelId?: string;
      originKind?: string;
      originId?: string;
      includeRoutineExecutions?: boolean;
      q?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.projectId) params.set("projectId", filters.projectId);
    if (filters?.assigneeAgentId) params.set("assigneeAgentId", filters.assigneeAgentId);
    if (filters?.participantAgentId) params.set("participantAgentId", filters.participantAgentId);
    if (filters?.assigneeUserId) params.set("assigneeUserId", filters.assigneeUserId);
    if (filters?.touchedByUserId) params.set("touchedByUserId", filters.touchedByUserId);
    if (filters?.inboxArchivedByUserId) params.set("inboxArchivedByUserId", filters.inboxArchivedByUserId);
    if (filters?.unreadForUserId) params.set("unreadForUserId", filters.unreadForUserId);
    if (filters?.labelId) params.set("labelId", filters.labelId);
    if (filters?.originKind) params.set("originKind", filters.originKind);
    if (filters?.originId) params.set("originId", filters.originId);
    if (filters?.includeRoutineExecutions) params.set("includeRoutineExecutions", "true");
    if (filters?.q) params.set("q", filters.q);
    const qs = params.toString();
    return api.get<Issue[]>(`/companies/${companyId}/issues${qs ? `?${qs}` : ""}`);
  },
  listLabels: (companyId: string) => api.get<IssueLabel[]>(`/companies/${companyId}/labels`),
  createLabel: (companyId: string, data: { name: string; color: string }) =>
    api.post<IssueLabel>(`/companies/${companyId}/labels`, data),
  deleteLabel: (id: string) => api.delete<IssueLabel>(`/labels/${id}`),
  get: (id: string) => api.get<Issue>(`/issues/${id}`),
  markRead: (id: string) => api.post<{ id: string; lastReadAt: Date }>(`/issues/${id}/read`, {}),
  archiveFromInbox: (id: string) =>
    api.post<{ id: string; archivedAt: Date }>(`/issues/${id}/inbox-archive`, {}),
  unarchiveFromInbox: (id: string) =>
    api.delete<{ id: string; archivedAt: Date } | { ok: true }>(`/issues/${id}/inbox-archive`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Issue>(`/companies/${companyId}/issues`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Issue>(`/issues/${id}`, data),
  remove: (id: string) => api.delete<Issue>(`/issues/${id}`),
  trackPublic: (identifier: string) =>
    api.get<PublicTrackStatus>(`/public/track/${identifier}`),
  checkout: (id: string, agentId: string) =>
    api.post<Issue>(`/issues/${id}/checkout`, {
      agentId,
      expectedStatuses: ["todo", "backlog", "blocked"],
    }),
  release: (id: string) => api.post<Issue>(`/issues/${id}/release`, {}),
  listComments: (id: string) => api.get<IssueComment[]>(`/issues/${id}/comments`),
  addComment: (id: string, body: string, reopen?: boolean, interrupt?: boolean) =>
    api.post<IssueComment>(
      `/issues/${id}/comments`,
      {
        body,
        ...(reopen === undefined ? {} : { reopen }),
        ...(interrupt === undefined ? {} : { interrupt }),
      },
    ),
  listDocuments: (id: string) => api.get<IssueDocument[]>(`/issues/${id}/documents`),
  getDocument: (id: string, key: string) => api.get<IssueDocument>(`/issues/${id}/documents/${encodeURIComponent(key)}`),
  upsertDocument: (id: string, key: string, data: UpsertIssueDocument) =>
    api.put<IssueDocument>(`/issues/${id}/documents/${encodeURIComponent(key)}`, data),
  listDocumentRevisions: (id: string, key: string) =>
    api.get<DocumentRevision[]>(`/issues/${id}/documents/${encodeURIComponent(key)}/revisions`),
  deleteDocument: (id: string, key: string) =>
    api.delete<{ ok: true }>(`/issues/${id}/documents/${encodeURIComponent(key)}`),
  listAttachments: (id: string) => api.get<IssueAttachment[]>(`/issues/${id}/attachments`),
  uploadAttachment: (
    companyId: string,
    issueId: string,
    file: File,
    issueCommentId?: string | null,
  ) => {
    const form = new FormData();
    form.append("file", file);
    if (issueCommentId) {
      form.append("issueCommentId", issueCommentId);
    }
    return api.postForm<IssueAttachment>(`/companies/${companyId}/issues/${issueId}/attachments`, form);
  },
  deleteAttachment: (id: string) => api.delete<{ ok: true }>(`/attachments/${id}`),
  listApprovals: (id: string) => api.get<Approval[]>(`/issues/${id}/approvals`),
  linkApproval: (id: string, approvalId: string) =>
    api.post<Approval[]>(`/issues/${id}/approvals`, { approvalId }),
  unlinkApproval: (id: string, approvalId: string) =>
    api.delete<{ ok: true }>(`/issues/${id}/approvals/${approvalId}`),
  listWorkProducts: (id: string) => api.get<IssueWorkProduct[]>(`/issues/${id}/work-products`),
  createWorkProduct: (id: string, data: Record<string, unknown>) =>
    api.post<IssueWorkProduct>(`/issues/${id}/work-products`, data),
  updateWorkProduct: (id: string, data: Record<string, unknown>) =>
    api.patch<IssueWorkProduct>(`/work-products/${id}`, data),
  deleteWorkProduct: (id: string) => api.delete<IssueWorkProduct>(`/work-products/${id}`),
  getMicroserviceWorkOrder: (id: string) =>
    api.get<MicroserviceWorkOrderResponse>(`/issues/${id}/microservice-work-order`),
  updateMicroserviceWorkOrder: (
    id: string,
    data: Partial<{
      clientName: string | null;
      clientEmail: string | null;
      clientCompany: string | null;
      currentStage: MicroserviceWorkOrderStage;
      preProductionNotes: string | null;
      productionNotes: string | null;
      postGenerationNotes: string | null;
    }>,
  ) => api.put<MicroserviceWorkOrderResponse>(`/issues/${id}/microservice-work-order`, data),
  addMicroserviceTimeCard: (
    id: string,
    data: {
      phase: MicroserviceWorkOrderStage;
      title: string;
      hours: number;
      notes?: string | null;
    },
  ) => api.post<MicroserviceWorkOrderResponse & { timeCard: MicroserviceWorkOrderTimeCard }>(`/issues/${id}/microservice-work-order/time-cards`, data),
  sendMicroserviceClientUpdate: (
    id: string,
    data: {
      to?: string | null;
      clientName?: string | null;
      clientCompany?: string | null;
      stage?: MicroserviceWorkOrderStage;
      intro?: string | null;
      nextStep?: string | null;
      customMessage?: string | null;
    },
  ) =>
    api.post<MicroserviceWorkOrderResponse & { delivery: { provider: "resend"; accepted: boolean; messageId: string | null; recipient: string; subject: string } }>(
      `/issues/${id}/microservice-client-update`,
      data,
    ),
  bulkUpdate: (
    companyId: string,
    ids: string[],
    update: { status?: string; assigneeAgentId?: string | null; assigneeUserId?: string | null },
  ) =>
    api.post<{ updated: Issue[]; count: number }>(
      `/companies/${companyId}/issues/bulk-update`,
      { ids, update },
    ),
};
