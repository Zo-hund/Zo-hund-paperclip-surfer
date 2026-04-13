import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companies, agents, issues, issueWorkProducts } from "./packages/db/src/schema/index.js";
import { randomUUID } from "node:crypto";

const connectionString = process.env.DATABASE_URL || "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log("Starting Test Run...");

  // 1. Create Company
  const [company] = await db.insert(companies).values({
    id: randomUUID(),
    name: "SocialAds Co",
    description: "Test company for social media ads",
    issuePrefix: "SAD",
    status: "active",
  }).returning();
  console.log("Created Company:", company.id);

  // 2. Create Agent
  const [agent] = await db.insert(agents).values({
    id: randomUUID(),
    companyId: company.id,
    name: "AdCreator",
    role: "content",
    status: "active",
    type: "worker",
    adapterType: "gemini_local",
    adapterConfig: {},
    runtimeConfig: {},
    permissions: {},
  }).returning();
  console.log("Created Agent:", agent.id);

  // 3. Create Issue
  const [issue] = await db.insert(issues).values({
    id: randomUUID(),
    companyId: company.id,
    projectId: randomUUID(),
    title: "Create FB Social Media Ad",
    description: "Design a high-converting ad for Facebook.",
    status: "done",
    priority: "high",
    assigneeAgentId: agent.id,
    identifier: "SAD-1",
  }).returning();
  console.log("Created Issue:", issue.id);

  // 4. Create Work Product
  const [workProduct] = await db.insert(issueWorkProducts).values({
    id: randomUUID(),
    companyId: company.id,
    issueId: issue.id,
    type: "preview",
    title: "Facebook Ad Campaign v1",
    url: "https://example.com/ads/fb-v1",
    status: "active",
    healthStatus: "healthy",
    reviewState: "approved",
    isPrimary: true,
  }).returning();
  console.log("Created Deliverable:", workProduct.id);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
