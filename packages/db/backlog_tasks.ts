import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { companies, projects, issues } from "./src/index.js";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/paperclip";
const sql = postgres(connectionString);
const db = drizzle(sql);

async function main() {
  const [company] = await db.select().from(companies).limit(1);
  if (!company) {
    console.error("No company found");
    process.exit(1);
  }

  const [project] = await db.select().from(projects).where(eq(projects.companyId, company.id)).limit(1);
  const projectId = project?.id || null;

  const tasks = [
    { title: "[BACKLOG] Visual Diagram Downloads (Mermaid)", description: "Implement high-fidelity flowchart/diagram generation and export for agent runs." },
    { title: "[BACKLOG] R&D Context Mode for Briefcase", description: "Create a specialized Research & Development view in the Deliverables Briefcase for market insights." },
    { title: "[BACKLOG] L&D Context Mode for Briefcase", description: "Create a specialized Learning & Development view in the Deliverables Briefcase for skill mastery." },
    { title: "[BACKLOG] Eval System (Modify/Check Agent Runs)", description: "Implement a human-in-the-loop dashboard to review, modify, and re-run agent execution paths." },
    { title: "[BACKLOG] RAG Memory Service Integration", description: "Index agent runs and work products into a RAG system to provide agents with long-term memory." },
    { title: "[MULTIMODAL] Add Coding Skill to AMX Agents", description: "Provision full coding runtime tools (Code Interpreter/E2B) for AMX agents." },
    { title: "[MULTIMODAL] Add Video/Image/Audio Skills", description: "Integrate multimodal generation MCP servers (FFmpeg, DALL-E, ElevenLabs) into the agent toolbelt." },
    { title: "[CONTENT] Creative Content Creation Skill", description: "High-level orchestration skill for agents to create synchronized multimodal content (synchronized audio/video/scripts)." }
  ];

  for (const task of tasks) {
    await db.insert(issues).values({
      companyId: company.id,
      projectId: projectId,
      title: task.title,
      description: task.description,
      status: "backlog",
      priority: "medium",
      originKind: "manual",
    });
    console.log(`Created backlog task: ${task.title}`);
  }

  process.exit(0);
}

main().catch(console.error);
