import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { companies, projects, issues } from "./schema/index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const db = createDb(url);

console.log("Migrating backlog tasks...");

const [company] = await db.select({ id: companies.id }).from(companies).limit(1);
if (!company) {
  console.error("No company found");
  process.exit(1);
}

const [project] = await db
  .select({ id: projects.id })
  .from(projects)
  .where(eq(projects.companyId, company.id))
  .limit(1);
const projectId = project?.id ?? null;

const tasks = [
  { title: "[NEW] Visual Diagram Downloads (Mermaid)", description: "Implement high-fidelity flowchart/diagram generation and export for agent runs." },
  { title: "[NEW] R&D Context Mode for Briefcase", description: "Create a specialized Research & Development view in the Deliverables Briefcase for market insights." },
  { title: "[NEW] L&D Context Mode for Briefcase", description: "Create a specialized Learning & Development view in the Deliverables Briefcase for skill mastery." },
  { title: "[NEW] Eval System (Modify/Check Agent Runs)", description: "Implement a human-in-the-loop dashboard to review, modify, and re-run agent execution paths." },
  { title: "[NEW] RAG Memory Service Integration", description: "Index agent runs and work products into a RAG system to provide agents with long-term memory." }
];

for (const task of tasks) {
  await db.insert(issues).values({
    companyId: company.id,
    projectId,
    title: task.title,
    description: task.description,
    status: 'backlog',
    priority: 'medium',
    originKind: 'manual',
  });
  console.log(`Created backlog task: ${task.title}`);
}

console.log("Backlog migration complete");
process.exit(0);
