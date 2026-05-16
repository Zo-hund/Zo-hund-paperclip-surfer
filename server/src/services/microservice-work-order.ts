import type { IssueWorkProduct } from "@paperclipai/shared";

export const MICROSERVICE_WORK_ORDER_PROVIDER = "amx-microservices";
export const MICROSERVICE_WORK_ORDER_EXTERNAL_ID = "microservice-work-order";
export const MICROSERVICE_WORK_ORDER_KIND = "microservice_work_order";

export const MICROSERVICE_WORK_ORDER_STAGES = [
  "pre_production",
  "production",
  "post_generation",
] as const;

export type MicroserviceWorkOrderStage = (typeof MICROSERVICE_WORK_ORDER_STAGES)[number];

export interface MicroserviceWorkOrderClient {
  name: string | null;
  email: string | null;
  company: string | null;
}

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

export interface MicroserviceWorkOrderEmailLog {
  id: string;
  to: string;
  subject: string;
  stage: MicroserviceWorkOrderStage;
  sentAt: string;
  messageId: string | null;
}

export interface MicroserviceWorkOrderMetadata {
  kind: typeof MICROSERVICE_WORK_ORDER_KIND;
  version: 1;
  client: MicroserviceWorkOrderClient;
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
  emailLog: MicroserviceWorkOrderEmailLog[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isMicroserviceWorkOrderStage(value: unknown): value is MicroserviceWorkOrderStage {
  return typeof value === "string" && MICROSERVICE_WORK_ORDER_STAGES.includes(value as MicroserviceWorkOrderStage);
}

export function buildMicroserviceWorkOrderMetadata(input: {
  listingId: string;
  transactionId?: string | null;
  taskType: string;
  runPhase: string;
  targetUrl?: string | null;
  title: string;
  instructions: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientCompany?: string | null;
  currentStage?: MicroserviceWorkOrderStage;
}): MicroserviceWorkOrderMetadata {
  const now = new Date().toISOString();
  return {
    kind: MICROSERVICE_WORK_ORDER_KIND,
    version: 1,
    client: {
      name: asString(input.clientName),
      email: asString(input.clientEmail),
      company: asString(input.clientCompany),
    },
    task: {
      listingId: input.listingId,
      transactionId: asString(input.transactionId),
      taskType: input.taskType,
      runPhase: input.runPhase,
      targetUrl: asString(input.targetUrl),
      title: input.title,
      instructions: input.instructions,
    },
    tracking: {
      currentStage: input.currentStage ?? "pre_production",
      preProductionNotes: null,
      productionNotes: null,
      postGenerationNotes: null,
      lastUpdatedAt: now,
    },
    timeCards: [],
    emailLog: [],
  };
}

export function parseMicroserviceWorkOrderMetadata(value: unknown): MicroserviceWorkOrderMetadata | null {
  const root = asRecord(value);
  if (!root) return null;
  if (root.kind !== MICROSERVICE_WORK_ORDER_KIND) return null;

  const client = asRecord(root.client);
  const task = asRecord(root.task);
  const tracking = asRecord(root.tracking);
  if (!client || !task || !tracking) return null;

  const currentStage = isMicroserviceWorkOrderStage(tracking.currentStage)
    ? tracking.currentStage
    : "pre_production";

  const timeCards = Array.isArray(root.timeCards)
    ? root.timeCards
        .map((entry) => {
          const record = asRecord(entry);
          if (!record) return null;
          const phase = isMicroserviceWorkOrderStage(record.phase) ? record.phase : null;
          const hours = asNumber(record.hours);
          const title = asString(record.title);
          const id = asString(record.id);
          const recordedAt = asString(record.recordedAt);
          if (!phase || hours === null || !title || !id || !recordedAt) return null;
          return {
            id,
            phase,
            title,
            hours,
            notes: asString(record.notes),
            recordedAt,
            recordedByUserId: asString(record.recordedByUserId),
            recordedByAgentId: asString(record.recordedByAgentId),
          } satisfies MicroserviceWorkOrderTimeCard;
        })
        .filter((entry): entry is MicroserviceWorkOrderTimeCard => entry !== null)
    : [];

  const emailLog = Array.isArray(root.emailLog)
    ? root.emailLog
        .map((entry) => {
          const record = asRecord(entry);
          if (!record) return null;
          const id = asString(record.id);
          const to = asString(record.to);
          const subject = asString(record.subject);
          const stage = isMicroserviceWorkOrderStage(record.stage) ? record.stage : null;
          const sentAt = asString(record.sentAt);
          if (!id || !to || !subject || !stage || !sentAt) return null;
          return {
            id,
            to,
            subject,
            stage,
            sentAt,
            messageId: asString(record.messageId),
          } satisfies MicroserviceWorkOrderEmailLog;
        })
        .filter((entry): entry is MicroserviceWorkOrderEmailLog => entry !== null)
    : [];

  return {
    kind: MICROSERVICE_WORK_ORDER_KIND,
    version: 1,
    client: {
      name: asString(client.name),
      email: asString(client.email),
      company: asString(client.company),
    },
    task: {
      listingId: asString(task.listingId) ?? "",
      transactionId: asString(task.transactionId),
      taskType: asString(task.taskType) ?? "custom",
      runPhase: asString(task.runPhase) ?? "content-production",
      targetUrl: asString(task.targetUrl),
      title: asString(task.title) ?? "Microservice request",
      instructions: asString(task.instructions) ?? "",
    },
    tracking: {
      currentStage,
      preProductionNotes: asString(tracking.preProductionNotes),
      productionNotes: asString(tracking.productionNotes),
      postGenerationNotes: asString(tracking.postGenerationNotes),
      lastUpdatedAt: asString(tracking.lastUpdatedAt) ?? new Date().toISOString(),
    },
    timeCards,
    emailLog,
  };
}

export function isMicroserviceWorkOrderProduct(product: Pick<IssueWorkProduct, "provider" | "externalId" | "metadata">) {
  return (
    product.provider === MICROSERVICE_WORK_ORDER_PROVIDER &&
    product.externalId === MICROSERVICE_WORK_ORDER_EXTERNAL_ID &&
    parseMicroserviceWorkOrderMetadata(product.metadata) !== null
  );
}

export function findMicroserviceWorkOrderProduct<T extends Pick<IssueWorkProduct, "provider" | "externalId" | "metadata">>(
  products: T[],
) {
  return products.find((product) => isMicroserviceWorkOrderProduct(product)) ?? null;
}

export function summarizeMicroserviceWorkOrder(metadata: MicroserviceWorkOrderMetadata) {
  const totalHours = metadata.timeCards.reduce((sum, entry) => sum + entry.hours, 0);
  const stageLabel =
    metadata.tracking.currentStage === "pre_production"
      ? "Pre-production"
      : metadata.tracking.currentStage === "production"
        ? "Production"
        : "Post-generation";
  const clientLabel = metadata.client.company ?? metadata.client.name ?? "Client intake pending";
  const emailCount = metadata.emailLog.length;
  return `${stageLabel} · ${totalHours.toFixed(1)}h tracked · ${emailCount} client update${emailCount === 1 ? "" : "s"} · ${clientLabel}`;
}
