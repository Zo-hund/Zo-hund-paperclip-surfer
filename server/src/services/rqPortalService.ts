import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { rqSubmissions, rqAgentConfigs } from "@paperclipai/db";
import { heartbeatService } from "./heartbeat.js";

export function rqPortalService(db: Db) {
  const heartbeat = heartbeatService(db);

  /**
   * Submits a new Requirement (RQ) to the AI Factory.
   */
  async function submitRQ(companyId: string, userId: string, data: {
    tier: string;
    contextData: {
      userContext?: string;
      domainContext?: string;
      institutionalMemory?: string;
    },
    deploymentMode: string;
    amountPaidCents: number;
  }) {
    const submission = await db.insert(rqSubmissions).values({
      ...data,
      companyId,
      userId,
      status: "submitted",
    }).returning().then(rows => rows[0]);

    // Automatically trigger the Agent Swarm based on the tier
    // In a real implementation, this would queue a multi-agent workflow
    // For now, we update status to 'activating_agents'
    await db.update(rqSubmissions)
      .set({ status: "activating_agents", updatedAt: new Date() })
      .where(eq(rqSubmissions.id, submission.id));

    return submission;
  }

  /**
   * Lists requirements for a company.
   */
  async function listSubmissions(companyId: string) {
    return db.select()
      .from(rqSubmissions)
      .where(eq(rqSubmissions.companyId, companyId));
  }

  return {
    submitRQ,
    listSubmissions
  };
}
