import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { rqSubmissions, rqAgentConfigs } from "@paperclipai/db";
import { heartbeatService } from "./heartbeat.js";
import { issueService } from "./issues.js";

export function rqPortalService(db: Db) {
  const heartbeat = heartbeatService(db);
  const issues = issueService(db);

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
    isSimulation?: boolean;
    /** Credits charged into RQ escrow for this run (0 for simulations). */
    creditCost?: number;
    /** Ledger transaction id of the escrow charge, when creditCost > 0. */
    amxTxId?: string | null;
  }) {
    const isSimulation = data.isSimulation ?? true;
    
    // 1. Create the Paperclip Issue for tracking
    const tierLabel = data.tier.replace("_", " ").toUpperCase();
    const prefix = isSimulation ? "[SIM-FACTORY]" : "[LIVE-FACTORY]";
    const issue = await issues.create(companyId, {
      title: `${prefix} ${tierLabel} Manufacturing`,
      description: `Requirement Portal Job\n\nMode: ${isSimulation ? "Simulation" : "Live Production"}\nUser Context: ${data.contextData.userContext || "None"}\nDomain Context: ${data.contextData.domainContext || "None"}\nDeployment: ${data.deploymentMode}`,
      status: "todo",
      createdByUserId: userId,
      priority: data.tier === "metaverse_enterprise" ? "high" : "medium",
    });

    // 2. Insert the submission linked to the issue
    const submission = await db.insert(rqSubmissions).values({
      tier: data.tier,
      contextData: data.contextData,
      deploymentMode: data.deploymentMode,
      amountPaidCents: data.amountPaidCents,
      creditCost: data.creditCost ?? 0,
      amxTxId: data.amxTxId ?? null,
      companyId,
      userId,
      issueId: issue.id,
      isSimulation,
      lifecycleStage: isSimulation ? "simulation" : "production",
      status: "submitted",
    }).returning().then(rows => rows[0]);

    // 3. Automatically trigger the Agent Swarm
    await db.update(rqSubmissions)
      .set({ 
        status: "activating_agents", 
        simulationStatus: "running",
        updatedAt: new Date() 
      })
      .where(eq(rqSubmissions.id, submission.id));

    return {
      ...submission,
      issueIdentifier: issue.identifier
    };
  }

  /**
   * Updates the lifecycle stage of a submission.
   */
  async function updateLifecycleStage(submissionId: string, stage: string) {
    return db.update(rqSubmissions)
      .set({ lifecycleStage: stage as any, updatedAt: new Date() })
      .where(eq(rqSubmissions.id, submissionId))
      .returning()
      .then(rows => rows[0]);
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
    updateLifecycleStage,
    listSubmissions
  };
}
