import type {
  AmxCommandRiskLevel,
  AmxDispatchLeaseStatus,
  AmxNodeCapability,
  AmxNodeConnectionMode,
  AmxNodeKind,
  AmxNodeStatus,
  AmxNodeTrustTier,
  PrincipalType,
} from "../constants.js";

export interface AmxNode {
  id: string;
  companyId: string;
  name: string;
  kind: AmxNodeKind;
  status: AmxNodeStatus;
  trustTier: AmxNodeTrustTier;
  connectionMode: AmxNodeConnectionMode;
  publicKey: string | null;
  capabilities: AmxNodeCapability[];
  labels: Record<string, string>;
  posture: Record<string, unknown>;
  constraints: Record<string, unknown>;
  load: Record<string, unknown>;
  network: Record<string, unknown>;
  lastSeenAt: Date | null;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmxDispatchLease {
  id: string;
  companyId: string;
  nodeId: string;
  requestedByType: PrincipalType;
  requestedById: string | null;
  capability: AmxNodeCapability;
  riskLevel: AmxCommandRiskLevel;
  status: AmxDispatchLeaseStatus;
  commandSummary: string;
  scope: Record<string, unknown>;
  policyDecision: Record<string, unknown>;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmxDispatchLeaseCreated extends AmxDispatchLease {
  leaseToken: string | null;
}

export interface AmxDispatchEvidence {
  id: string;
  companyId: string;
  nodeId: string;
  leaseId: string;
  evidenceId: string;
  status: string;
  capability: AmxNodeCapability;
  riskLevel: AmxCommandRiskLevel;
  commandSummary: string;
  result: Record<string, unknown>;
  metadata: Record<string, unknown>;
  resultSha256: string;
  generatedAt: Date;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
