import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { amxDispatchEvidence, amxDispatchLeases, amxNodes } from "@paperclipai/db";
import type {
  AmxCommandRiskLevel,
  AmxDispatchEvidence,
  AmxDispatchLease,
  AmxDispatchLeaseCreated,
  AmxNode,
  AmxNodeCapability,
  CreateAmxDispatchLease,
  CreateAmxNode,
  PrincipalType,
  SubmitAmxDispatchEvidence,
  UpdateAmxNode,
} from "@paperclipai/shared";
import { conflict, notFound, unauthorized, unprocessable } from "../errors.js";

const ROUTABLE_STATUSES = ["online", "idle", "busy"] as const;
const AUTO_GRANT_RISK_LEVELS = new Set<AmxCommandRiskLevel>(["view", "read"]);

function hashLeaseToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashResult(result: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(result)).digest("hex");
}

function normalizeNode(row: typeof amxNodes.$inferSelect): AmxNode {
  return {
    ...row,
    kind: row.kind as AmxNode["kind"],
    status: row.status as AmxNode["status"],
    trustTier: row.trustTier as AmxNode["trustTier"],
    connectionMode: row.connectionMode as AmxNode["connectionMode"],
    capabilities: row.capabilities as AmxNodeCapability[],
  };
}

function normalizeLease(row: typeof amxDispatchLeases.$inferSelect): AmxDispatchLease {
  return {
    id: row.id,
    companyId: row.companyId,
    nodeId: row.nodeId,
    requestedByType: row.requestedByType as PrincipalType,
    requestedById: row.requestedById,
    capability: row.capability as AmxNodeCapability,
    riskLevel: row.riskLevel as AmxCommandRiskLevel,
    status: row.status as AmxDispatchLease["status"],
    commandSummary: row.commandSummary,
    scope: row.scope,
    policyDecision: row.policyDecision,
    expiresAt: row.expiresAt,
    approvedAt: row.approvedAt,
    consumedAt: row.consumedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeEvidence(row: typeof amxDispatchEvidence.$inferSelect): AmxDispatchEvidence {
  return {
    id: row.id,
    companyId: row.companyId,
    nodeId: row.nodeId,
    leaseId: row.leaseId,
    evidenceId: row.evidenceId,
    status: row.status,
    capability: row.capability as AmxNodeCapability,
    riskLevel: row.riskLevel as AmxCommandRiskLevel,
    commandSummary: row.commandSummary,
    result: row.result,
    metadata: row.metadata,
    resultSha256: row.resultSha256,
    generatedAt: row.generatedAt,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function amxNodeService(db: Db) {
  async function list(companyId: string): Promise<AmxNode[]> {
    const rows = await db
      .select()
      .from(amxNodes)
      .where(eq(amxNodes.companyId, companyId))
      .orderBy(desc(amxNodes.lastSeenAt), desc(amxNodes.createdAt));
    return rows.map(normalizeNode);
  }

  async function get(companyId: string, nodeId: string): Promise<AmxNode | null> {
    const [row] = await db
      .select()
      .from(amxNodes)
      .where(and(eq(amxNodes.companyId, companyId), eq(amxNodes.id, nodeId)))
      .limit(1);
    return row ? normalizeNode(row) : null;
  }

  async function create(companyId: string, input: CreateAmxNode): Promise<AmxNode> {
    const [row] = await db
      .insert(amxNodes)
      .values({
        companyId,
        name: input.name,
        kind: input.kind,
        trustTier: input.trustTier,
        connectionMode: input.connectionMode,
        publicKey: input.publicKey ?? null,
        capabilities: input.capabilities,
        labels: input.labels ?? {},
        posture: input.posture ?? {},
        constraints: input.constraints ?? {},
      })
      .returning();
    if (!row) throw conflict("Failed to create AMX node");
    return normalizeNode(row);
  }

  async function update(companyId: string, nodeId: string, input: UpdateAmxNode): Promise<AmxNode> {
    const patch: Partial<typeof amxNodes.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) {
      patch.status = input.status;
      patch.suspendedAt = input.status === "suspended" ? new Date() : null;
    }
    if (input.trustTier !== undefined) patch.trustTier = input.trustTier;
    if (input.connectionMode !== undefined) patch.connectionMode = input.connectionMode;
    if (input.publicKey !== undefined) patch.publicKey = input.publicKey;
    if (input.capabilities !== undefined) patch.capabilities = input.capabilities;
    if (input.labels !== undefined) patch.labels = input.labels;
    if (input.posture !== undefined) patch.posture = input.posture;
    if (input.constraints !== undefined) patch.constraints = input.constraints;
    if (input.load !== undefined) patch.load = input.load;
    if (input.network !== undefined) patch.network = input.network;

    const [row] = await db
      .update(amxNodes)
      .set(patch)
      .where(and(eq(amxNodes.companyId, companyId), eq(amxNodes.id, nodeId)))
      .returning();
    if (!row) throw notFound("AMX node not found");
    return normalizeNode(row);
  }

  async function heartbeat(companyId: string, nodeId: string, input: UpdateAmxNode): Promise<AmxNode> {
    return update(companyId, nodeId, {
      ...input,
      status: input.status ?? "online",
      load: input.load ?? {},
      network: input.network ?? {},
    }).then(async () => {
      const [row] = await db
        .update(amxNodes)
        .set({ lastSeenAt: new Date(), updatedAt: new Date() })
        .where(and(eq(amxNodes.companyId, companyId), eq(amxNodes.id, nodeId)))
        .returning();
      if (!row) throw notFound("AMX node not found");
      return normalizeNode(row);
    });
  }

  async function listLeases(companyId: string): Promise<AmxDispatchLease[]> {
    const rows = await db
      .select()
      .from(amxDispatchLeases)
      .where(eq(amxDispatchLeases.companyId, companyId))
      .orderBy(desc(amxDispatchLeases.createdAt));
    return rows.map(normalizeLease);
  }

  async function listNodeLeases(companyId: string, nodeId: string): Promise<AmxDispatchLease[]> {
    const rows = await db
      .select()
      .from(amxDispatchLeases)
      .where(and(eq(amxDispatchLeases.companyId, companyId), eq(amxDispatchLeases.nodeId, nodeId)))
      .orderBy(desc(amxDispatchLeases.createdAt));
    return rows.map(normalizeLease);
  }

  async function listEvidence(companyId: string): Promise<AmxDispatchEvidence[]> {
    const rows = await db
      .select()
      .from(amxDispatchEvidence)
      .where(eq(amxDispatchEvidence.companyId, companyId))
      .orderBy(desc(amxDispatchEvidence.receivedAt));
    return rows.map(normalizeEvidence);
  }

  async function listNodeEvidence(companyId: string, nodeId: string): Promise<AmxDispatchEvidence[]> {
    const rows = await db
      .select()
      .from(amxDispatchEvidence)
      .where(and(eq(amxDispatchEvidence.companyId, companyId), eq(amxDispatchEvidence.nodeId, nodeId)))
      .orderBy(desc(amxDispatchEvidence.receivedAt));
    return rows.map(normalizeEvidence);
  }

  async function selectNode(companyId: string, input: CreateAmxDispatchLease) {
    if (input.nodeId) {
      const node = await get(companyId, input.nodeId);
      if (!node) throw notFound("AMX node not found");
      if (!node.capabilities.includes(input.capability)) {
        throw unprocessable(`AMX node does not advertise capability '${input.capability}'`);
      }
      return node;
    }

    const [row] = await db
      .select()
      .from(amxNodes)
      .where(
        and(
          eq(amxNodes.companyId, companyId),
          inArray(amxNodes.status, [...ROUTABLE_STATUSES]),
          sql`${amxNodes.capabilities}::jsonb ? ${input.capability}`,
        ),
      )
      .orderBy(desc(amxNodes.lastSeenAt), desc(amxNodes.createdAt))
      .limit(1);
    if (!row) throw notFound(`No online AMX node advertises capability '${input.capability}'`);
    return normalizeNode(row);
  }

  async function createLease(
    companyId: string,
    input: CreateAmxDispatchLease,
    actor: { actorType: PrincipalType; actorId: string | null },
  ): Promise<AmxDispatchLeaseCreated> {
    const node = await selectNode(companyId, input);
    const autoGranted = AUTO_GRANT_RISK_LEVELS.has(input.riskLevel);
    const leaseToken = autoGranted ? randomBytes(32).toString("base64url") : null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000);

    const [row] = await db
      .insert(amxDispatchLeases)
      .values({
        companyId,
        nodeId: node.id,
        requestedByType: actor.actorType,
        requestedById: actor.actorId,
        capability: input.capability,
        riskLevel: input.riskLevel,
        status: autoGranted ? "granted" : "pending_approval",
        commandSummary: input.commandSummary,
        scope: input.scope ?? {},
        policyDecision: {
          decision: autoGranted ? "granted" : "approval_required",
          reason: autoGranted
            ? "Low-risk dispatch lease can be auto-granted."
            : "Write, execute, and destructive capabilities require explicit approval.",
          selectedNodeId: node.id,
          selectedNodeTrustTier: node.trustTier,
          selectedNodeStatus: node.status,
        },
        leaseTokenHash: leaseToken ? hashLeaseToken(leaseToken) : null,
        expiresAt,
        approvedAt: autoGranted ? now : null,
      })
      .returning();
    if (!row) throw conflict("Failed to create AMX dispatch lease");
    return { ...normalizeLease(row), leaseToken };
  }

  async function revokeLease(companyId: string, leaseId: string): Promise<AmxDispatchLease> {
    const [row] = await db
      .update(amxDispatchLeases)
      .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(amxDispatchLeases.companyId, companyId), eq(amxDispatchLeases.id, leaseId)))
      .returning();
    if (!row) throw notFound("AMX dispatch lease not found");
    return normalizeLease(row);
  }

  async function consumeLease(companyId: string, nodeId: string, leaseId: string, leaseToken: string): Promise<AmxDispatchLease> {
    const [existing] = await db
      .select()
      .from(amxDispatchLeases)
      .where(
        and(
          eq(amxDispatchLeases.companyId, companyId),
          eq(amxDispatchLeases.nodeId, nodeId),
          eq(amxDispatchLeases.id, leaseId),
        ),
      )
      .limit(1);
    if (!existing) throw notFound("AMX dispatch lease not found");
    if (existing.status !== "granted") throw unprocessable("AMX dispatch lease is not granted");
    if (existing.expiresAt.getTime() <= Date.now()) throw unprocessable("AMX dispatch lease is expired");
    if (!existing.leaseTokenHash) throw unprocessable("AMX dispatch lease has no consumable token");

    const providedHash = hashLeaseToken(leaseToken);
    const expected = Buffer.from(existing.leaseTokenHash, "hex");
    const provided = Buffer.from(providedHash, "hex");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw unauthorized("Invalid AMX dispatch lease token");
    }

    const [row] = await db
      .update(amxDispatchLeases)
      .set({ status: "consumed", consumedAt: new Date(), updatedAt: new Date() })
      .where(eq(amxDispatchLeases.id, leaseId))
      .returning();
    if (!row) throw notFound("AMX dispatch lease not found");
    return normalizeLease(row);
  }

  async function submitEvidence(
    companyId: string,
    nodeId: string,
    leaseId: string,
    input: SubmitAmxDispatchEvidence,
  ): Promise<AmxDispatchEvidence> {
    const [lease] = await db
      .select()
      .from(amxDispatchLeases)
      .where(
        and(
          eq(amxDispatchLeases.companyId, companyId),
          eq(amxDispatchLeases.nodeId, nodeId),
          eq(amxDispatchLeases.id, leaseId),
        ),
      )
      .limit(1);
    if (!lease) throw notFound("AMX dispatch lease not found");
    if (lease.status !== "consumed") {
      throw unprocessable("AMX dispatch evidence requires a consumed lease");
    }
    if (lease.capability !== input.capability || lease.riskLevel !== input.riskLevel) {
      throw unprocessable("AMX dispatch evidence does not match lease policy");
    }

    const [row] = await db
      .insert(amxDispatchEvidence)
      .values({
        companyId,
        nodeId,
        leaseId,
        evidenceId: input.evidenceId,
        status: input.status,
        capability: input.capability,
        riskLevel: input.riskLevel,
        commandSummary: input.commandSummary,
        result: input.result,
        metadata: input.metadata ?? {},
        resultSha256: hashResult(input.result),
        generatedAt: input.generatedAt,
      })
      .returning();
    if (!row) throw conflict("Failed to submit AMX dispatch evidence");
    return normalizeEvidence(row);
  }

  return {
    list,
    get,
    create,
    update,
    heartbeat,
    listLeases,
    listNodeLeases,
    listEvidence,
    listNodeEvidence,
    createLease,
    revokeLease,
    consumeLease,
    submitEvidence,
  };
}
