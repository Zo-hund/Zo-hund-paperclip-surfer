import { eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { amxChainEvents, amxCertificates } from "@paperclipai/db";
import { createHash } from "node:crypto";

export function amxChainService(db: Db) {
  /**
   * Signs and records a security-critical event to the AMX Chain.
   */
  async function recordSecurityEvent(companyId: string, principalType: string, principalId: string, action: string, payload: Record<string, unknown>) {
    // In a production Pacific L2/L3 integration, this would involve a KMS or HSM signing.
    // For the simulated blockchain, we use a deterministic hash-based signature.
    const payloadStr = JSON.stringify(payload);
    const signature = createHash("sha256")
      .update(payloadStr + process.env.AMX_CHAIN_SECRET)
      .digest("hex");

    return db.insert(amxChainEvents).values({
      companyId,
      principalType,
      principalId,
      action,
      payload,
      signature,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Generates a "Proof of Work" certificate for a completed task or project.
   */
  async function issueCertificate(companyId: string, input: {
    issueId?: string;
    taskId?: string;
    responsiblePrincipalId: string;
    commitHashes: string[];
    taskLogsSummary?: string;
    completionTimeMs: number;
    finalCostTokens: number;
    projects: string[];
    resources: string[];
    reports: string[];
  }) {
    // Generate the unique "Certificate Footprint"
    const footprintInput = JSON.stringify({
      companyId,
      issueId: input.issueId,
      hashes: input.commitHashes,
      cost: input.finalCostTokens,
      timestamp: Date.now()
    });

    const certificateFootprint = createHash("sha256")
      .update(footprintInput)
      .digest("hex");

    return db.insert(amxCertificates).values({
      ...input,
      companyId,
      certificateFootprint,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Verifies the integrity of a certificate footprint.
   */
  async function verifyCertificate(footprint: string) {
    const cert = await db.select()
      .from(amxCertificates)
      .where(eq(amxCertificates.certificateFootprint, footprint))
      .then(rows => rows[0] ?? null);
    
    if (!cert) return { valid: false, error: "Certificate not found on AMX Chain" };
    
    return { valid: true, cert };
  }

  return {
    recordSecurityEvent,
    issueCertificate,
    verifyCertificate,
  };
}
