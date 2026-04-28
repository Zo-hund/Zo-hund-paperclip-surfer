import { projects, projectWorkspaces } from "@paperclipai/db";
import { resolvePaperclipInstanceRoot } from "../src/home-paths.js";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import path from "node:path";

async function run() {
  const dbDir = path.resolve(resolvePaperclipInstanceRoot(), "db");
  const client = new PGlite(dbDir);
  const db = drizzle(client);

  const allProjects = await db.select().from(projects);
  const allWorkspaces = await db.select().from(projectWorkspaces);
  
  console.log(JSON.stringify({ projects: allProjects, workspaces: allWorkspaces }, null, 2));

  process.exit(0);
}
run().catch(console.error);
