/**
 * SkillsDirectory
 *
 * Public, unauthenticated page listing the aggregated skill index from
 * GET /api/public/directory/skills as tag/pill cards with counts. Modeled on
 * PublicPricing.tsx's visual style: session-independent (no CompanyContext/
 * CloudAccessGate dependency), data comes from a dedicated public API client
 * (skillsDirectoryApi).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Sparkles } from "lucide-react";
import { skillsDirectoryApi } from "../api/skillsDirectory";
import { queryKeys } from "../lib/queryKeys";

const SOURCE_LABELS: Record<string, string> = {
  agent_skills: "Agent profiles",
  marketplace_listings: "Marketplace listings",
  company_skills: "Company skill libraries",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export function SkillsDirectory() {
  const [filter, setFilter] = useState("");

  const directoryQuery = useQuery({
    queryKey: queryKeys.skillsDirectory.list,
    queryFn: () => skillsDirectoryApi.list(),
    retry: false,
  });

  const skills = directoryQuery.data?.skills ?? [];
  const filteredSkills = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) => skill.name.toLowerCase().includes(needle));
  }, [filter, skills]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Skills Directory</h1>
          <p className="text-sm text-muted-foreground">
            Skills contributed by public companies across agent profiles, marketplace listings, and skill
            libraries.
          </p>
        </div>
      </header>

      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter skills"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {directoryQuery.isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading skills…</div>
      ) : directoryQuery.error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Couldn't load the skills directory. Try again later.
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {skills.length === 0
            ? "No public skills have been published yet."
            : "No skills match this filter."}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {filteredSkills.map((skill) => (
            <div
              key={skill.name}
              title={skill.sources.map(sourceLabel).join(", ")}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm"
            >
              <span className="font-medium">{skill.name}</span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
                {skill.sourceCount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
