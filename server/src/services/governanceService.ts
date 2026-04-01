import { eq, and } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { collectives, electives, communityBoards, boardCollaborations } from "@paperclipai/db";

export function governanceService(db: Db) {
  /**
   * Creates a new Collective (SME Skill Providers).
   */
  async function createCollective(companyId: string, data: {
    name: string;
    description?: string;
    knowledgeDomain: string;
    skillProviders: string[];
  }) {
    return db.insert(collectives).values({
      ...data,
      companyId,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Creates a new Elective (Employers/Businesses).
   */
  async function createElective(companyId: string, data: {
    name: string;
    description?: string;
    industry: string;
    authorizedPrincipals?: string[];
  }) {
    return db.insert(electives).values({
      ...data,
      companyId,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Creates a Community Board for local project coordination.
   */
  async function createCommunityBoard(companyId: string, name: string, location: string) {
    return db.insert(communityBoards).values({
      companyId,
      name,
      location,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Maps a collaboration between a Collective and an Elective on a specific project.
   */
  async function collaborate(companyId: string, input: {
    collectiveId: string;
    electiveId: string;
    communityBoardId?: string;
    projectId?: string;
    role: string;
  }) {
    return db.insert(boardCollaborations).values({
      ...input,
      companyId,
    }).returning().then(rows => rows[0]);
  }

  /**
   * Lists all local governance entities for a company.
   */
  async function listEntities(companyId: string) {
    const [c, e, b] = await Promise.all([
      db.select().from(collectives).where(eq(collectives.companyId, companyId)),
      db.select().from(electives).where(eq(electives.companyId, companyId)),
      db.select().from(communityBoards).where(eq(communityBoards.companyId, companyId)),
    ]);
    return { collectives: c, electives: e, communityBoards: b };
  }

  return {
    createCollective,
    createElective,
    createCommunityBoard,
    collaborate,
    listEntities,
  };
}
