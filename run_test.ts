import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companies, agents, issues, issueWorkProducts, companyMemberships } from "./packages/db/src/schema/index.js";
import { v4 as uuidv4 } from "uuid";

const connectionString = process.env.DATABASE_URL || "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  console.log("Starting Test Run...");

  // 1. Create Company
  const [company] = await db.insert(companies).values({
    id: uuidv4(),
    name: "SocialAds Co",
    description: "Test company for social media ads",
    issuePrefix: "SAD",
    status: "active",
  }).returning();
  console.log("Created Company:", company.id);

  // 2. Create Agent
  const [agent] = await db.insert(agents).values({
    id: uuidv4(),
    companyId: company.id,
    name: "AdCreator",
    role: "content",
    status: "active",
    type: "worker",
  }).returning();
  console.log("Created Agent:", agent.id);

  // 3. Create Issue
  const [issue] = await db.insert(issues).values({
    id: uuidv4(),
    companyId: company.id,
    projectId: uuidv4(), // Mock project ID
    title: "Create FB Social Media Ad",
    description: "Design a high-converting ad for Facebook.",
    status: "done",
    priority: "high",
    assigneeAgentId: agent.id,
    identifier: "SAD-1",
  }).returning();
  console.log("Created Issue:", issue.id);

  // 4. Create Work Product (The Deliverable)
  const [workProduct] = await db.insert(issueWorkProducts).values({
    id: uuidv4(),
    companyId: company.id,
    issueId: issue.id,
    type: "preview",
    title: "Facebook Ad Campaign v1",
    url: "https://example.com/ads/fb-v1",
    status: "active",
    healthStatus: "healthy",
    reviewState: "approved",
    isPrimary: true,
    metadata: { platform: "facebook", format: "image" },
  }).returning();
  console.log("Created Work Product (Deliverable):", workProduct.id);

  console.log("Test Run Complete. Deliverable should now be visible in the Master Briefcase.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
