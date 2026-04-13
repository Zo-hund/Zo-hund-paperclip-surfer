import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companies, agents, issues, issueWorkProducts } from "../../packages/db/src/schema/index.js";
import { randomUUID } from "node:crypto";

const connectionString = process.env.DATABASE_URL || "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log("Starting Final Test Run...");

  // 1. Create Company
  const [company] = await db.insert(companies).values({
    id: randomUUID(),
    name: "FB Marketing Hub",
    description: "Industrializing social media deliverables",
    issuePrefix: "FB",
    status: "active",
  }).returning();
  console.log("Created Company:", company.id);

  // 2. Create Agent
  const [agent] = await db.insert(agents).values({
    id: randomUUID(),
    companyId: company.id,
    name: "AdStrategy-GPT",
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
    title: "Generate Facebook Ad Creative",
    description: "Create a carousel ad for the new product launch.",
    status: "done",
    priority: "high",
    assigneeAgentId: agent.id,
    identifier: "FB-101",
  }).returning();
  console.log("Created Issue:", issue.id);

  // 4. Create Work Product
  const [workProduct] = await db.insert(issueWorkProducts).values({
    id: randomUUID(),
    companyId: company.id,
    issueId: issue.id,
    type: "preview",
    title: "Facebook Carousel Ad - Draft v1",
    url: "https://facebook.com/ads/preview/fb-101",
    status: "active",
    healthStatus: "healthy",
    reviewState: "approved",
    isPrimary: true,
    metadata: { platform: "facebook", adType: "carousel" },
  }).returning();
  console.log("Created Deliverable (Work Product):", workProduct.id);

  console.log("\n✅ Test Run Successful!");
  console.log("The ad deliverable is now visible in the Master Briefcase.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
