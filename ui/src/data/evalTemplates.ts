export type EvalSector = "nonprofit" | "civic" | "chamber" | "business_org" | "government";

export type OpprrCategory =
  | "01_PROPOSALS"
  | "02_GRANTS"
  | "03_PRESENTATIONS"
  | "04_MEMOS"
  | "05_REPORTS"
  | "06_PLANS"
  | "07_RESEARCH"
  | "08_CORRESPONDENCE";

export type OpprrAudience = "BOARD-INTERNAL" | "CLIENTS-EXTERNAL";

export interface EvalInput {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "file_upload" | "date" | "number";
  required?: boolean;
  hint?: string;
  accept?: string;
  options?: string[];
  placeholder?: string;
}

export interface EvalTemplate {
  id: string;
  name: string;
  description: string;
  sector: EvalSector;
  taskRequest: string;
  louisvilleContext: string;
  inputs: EvalInput[];
  stages: string[];
  approvalGates: string[];
  scoringWeights: Record<string, number>;
  successCriteria: Record<string, unknown>;
  outputs: Record<string, unknown>;
  defaultOutputCategory: OpprrCategory;
  defaultOutputAudience: OpprrAudience;
  sampleData: Record<string, string>;
}

export const EVAL_TEMPLATES: EvalTemplate[] = [];

export const SECTOR_LABELS: Record<EvalSector, string> = {
  nonprofit: "Nonprofit",
  civic: "Civic",
  chamber: "Chamber",
  business_org: "Business Org",
  government: "Government",
};

export const OPPRRC_CATEGORIES: OpprrCategory[] = [
  "01_PROPOSALS",
  "02_GRANTS",
  "03_PRESENTATIONS",
  "04_MEMOS",
  "05_REPORTS",
  "06_PLANS",
  "07_RESEARCH",
  "08_CORRESPONDENCE",
];

export const OPPRRC_CATEGORY_LABELS: Record<OpprrCategory, string> = {
  "01_PROPOSALS": "Proposals",
  "02_GRANTS": "Grants",
  "03_PRESENTATIONS": "Presentations",
  "04_MEMOS": "Memos",
  "05_REPORTS": "Reports",
  "06_PLANS": "Plans",
  "07_RESEARCH": "Research",
  "08_CORRESPONDENCE": "Correspondence",
};

export function extractDriveFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export function opprrPath(company: string, category: OpprrCategory, audience: OpprrAudience): string {
  return `OPPRRC/${company}/${category}/${audience}`;
}

export interface AutoScoreResult {
  weighted_auto: number;
  completion: number;
  speed: number;
  cost_efficiency: number;
}

export function autoScore(
  _template: EvalTemplate,
  params: { status: string; durationSeconds: number | null; costCents: number | null | undefined },
): AutoScoreResult {
  const completion = params.status === "completed" ? 100 : 0;
  const speed = params.durationSeconds != null ? Math.max(0, Math.round((1 - params.durationSeconds / 300) * 100)) : 0;
  const cost_efficiency =
    params.costCents != null ? Math.max(0, Math.round((1 - params.costCents / 100) * 100)) : 0;
  const weighted_auto = completion * 0.6 + speed * 0.2 + cost_efficiency * 0.2;
  return { weighted_auto, completion, speed, cost_efficiency };
}
