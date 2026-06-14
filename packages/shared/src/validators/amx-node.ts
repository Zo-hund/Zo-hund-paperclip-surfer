import { z } from "zod";
import {
  AMX_COMMAND_RISK_LEVELS,
  AMX_NODE_CAPABILITIES,
  AMX_NODE_CONNECTION_MODES,
  AMX_NODE_KINDS,
  AMX_NODE_STATUSES,
  AMX_NODE_TRUST_TIERS,
} from "../constants.js";

export const amxNodeKindSchema = z.enum(AMX_NODE_KINDS);
export const amxNodeStatusSchema = z.enum(AMX_NODE_STATUSES);
export const amxNodeTrustTierSchema = z.enum(AMX_NODE_TRUST_TIERS);
export const amxNodeConnectionModeSchema = z.enum(AMX_NODE_CONNECTION_MODES);
export const amxNodeCapabilitySchema = z.enum(AMX_NODE_CAPABILITIES);
export const amxCommandRiskLevelSchema = z.enum(AMX_COMMAND_RISK_LEVELS);

export const amxNodeLabelsSchema = z.record(z.string().min(1), z.string().max(120)).default({});
export const amxNodeJsonObjectSchema = z.record(z.unknown()).default({});

export const createAmxNodeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: amxNodeKindSchema.default("local_desktop"),
  trustTier: amxNodeTrustTierSchema.default("paired"),
  connectionMode: amxNodeConnectionModeSchema.default("outbound_websocket"),
  publicKey: z.string().trim().min(16).max(16_384).optional().nullable(),
  capabilities: z.array(amxNodeCapabilitySchema).min(1).default(["heartbeat_worker"]),
  labels: amxNodeLabelsSchema.optional(),
  posture: amxNodeJsonObjectSchema.optional(),
  constraints: amxNodeJsonObjectSchema.optional(),
});

export const updateAmxNodeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: amxNodeStatusSchema.optional(),
  trustTier: amxNodeTrustTierSchema.optional(),
  connectionMode: amxNodeConnectionModeSchema.optional(),
  publicKey: z.string().trim().min(16).max(16_384).optional().nullable(),
  capabilities: z.array(amxNodeCapabilitySchema).min(1).optional(),
  labels: amxNodeLabelsSchema.optional(),
  posture: amxNodeJsonObjectSchema.optional(),
  constraints: amxNodeJsonObjectSchema.optional(),
  load: amxNodeJsonObjectSchema.optional(),
  network: amxNodeJsonObjectSchema.optional(),
});

export const amxNodeHeartbeatSchema = z.object({
  status: amxNodeStatusSchema.default("online"),
  capabilities: z.array(amxNodeCapabilitySchema).min(1).optional(),
  posture: amxNodeJsonObjectSchema.optional(),
  constraints: amxNodeJsonObjectSchema.optional(),
  load: amxNodeJsonObjectSchema.optional(),
  network: amxNodeJsonObjectSchema.optional(),
});

export const createAmxDispatchLeaseSchema = z.object({
  nodeId: z.string().uuid().optional(),
  capability: amxNodeCapabilitySchema,
  riskLevel: amxCommandRiskLevelSchema.default("read"),
  commandSummary: z.string().trim().min(1).max(500),
  scope: amxNodeJsonObjectSchema.optional(),
  ttlSeconds: z.number().int().min(30).max(900).default(300),
});

export const submitAmxDispatchEvidenceSchema = z.object({
  evidenceId: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(80).default("executed"),
  capability: amxNodeCapabilitySchema,
  riskLevel: amxCommandRiskLevelSchema,
  commandSummary: z.string().trim().min(1).max(500),
  result: amxNodeJsonObjectSchema,
  metadata: amxNodeJsonObjectSchema.optional(),
  generatedAt: z.coerce.date(),
});

export type CreateAmxNode = z.infer<typeof createAmxNodeSchema>;
export type UpdateAmxNode = z.infer<typeof updateAmxNodeSchema>;
export type AmxNodeHeartbeat = z.infer<typeof amxNodeHeartbeatSchema>;
export type CreateAmxDispatchLease = z.infer<typeof createAmxDispatchLeaseSchema>;
export type SubmitAmxDispatchEvidence = z.infer<typeof submitAmxDispatchEvidenceSchema>;
