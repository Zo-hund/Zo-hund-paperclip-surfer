import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/paperclip');

async function main() {
  const companies = await sql`SELECT id FROM companies LIMIT 1`;
  if (companies.length === 0) {
    console.error('No company found');
    process.exit(1);
  }
  const companyId = companies[0].id;

  const projects = await sql`SELECT id FROM projects WHERE company_id = ${companyId} LIMIT 1`;
  const projectId = projects.length > 0 ? projects[0].id : null;

  const tasks = [
    { title: "[NEW] Visual Diagram Downloads (Mermaid)", description: "Implement high-fidelity flowchart/diagram generation and export for agent runs." },
    { title: "[NEW] R&D Context Mode for Briefcase", description: "Create a specialized Research & Development view in the Deliverables Briefcase for market insights." },
    { title: "[NEW] L&D Context Mode for Briefcase", description: "Create a specialized Learning & Development view in the Deliverables Briefcase for skill mastery." },
    { title: "[NEW] Eval System (Modify/Check Agent Runs)", description: "Implement a human-in-the-loop dashboard to review, modify, and re-run agent execution paths." },
    { title: "[NEW] RAG Memory Service Integration", description: "Index agent runs and work products into a RAG system to provide agents with long-term memory." }
  ];

  for (const task of tasks) {
    await sql`
      INSERT INTO issues (company_id, project_id, title, description, status, priority, origin_kind)
      VALUES (${companyId}, ${projectId}, ${task.title}, ${task.description}, 'backlog', 'medium', 'manual')
    `;
    console.log(`Created backlog task: ${task.title}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
