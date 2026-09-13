import { z } from "zod";

export const directoryProfileQuerySchema = z.object({
  type: z.enum(["agent", "human"]).optional(),
  companyId: z.string().uuid().optional(),
  skill: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export interface DirectoryProfileFilters {
  type?: "agent" | "human";
  companyId?: string;
  skill?: string;
  limit?: number;
}

export interface DirectoryProfile {
  id: string;
  type: "agent" | "human";
  name: string;
  title: string;
  companyId: string;
  companyName: string;
  companyPrefix: string;
  skills: string[];
  avatarUrl?: string;
  href: string;
  /** Present only in the instance administrator response. */
  isPublicProfile?: boolean;
}

export interface DirectoryProfilesData {
  profiles: DirectoryProfile[];
  total: number;
}
