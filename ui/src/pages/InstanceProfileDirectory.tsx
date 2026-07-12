/**
 * Instance-admin sibling of PublicProfileDirectory.tsx — same idea (browse
 * agent + human profiles across every company) but assertInstanceAdmin-
 * gated server side, so it ignores the isPublicProfile/companies.isPublic
 * restriction entirely and shows a visibility badge per row instead.
 * Structure mirrors InstanceChainDirectory.tsx: header stats, filter bar,
 * table, Load More pagination up to 200.
 */
import { useEffect, useState } from "react";
import { Users, Search, Eye, EyeOff, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { directoryApi } from "@/api/directory";
import { companiesApi } from "@/api/companies";

const DIRECTORY_PAGE_SIZE = 50;
const DIRECTORY_MAX_LIMIT = 200;

export function InstanceProfileDirectory() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [skillInput, setSkillInput] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [limit, setLimit] = useState(DIRECTORY_PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setSkillFilter(skillInput.trim()), 300);
    return () => clearTimeout(t);
  }, [skillInput]);

  useEffect(() => {
    setLimit(DIRECTORY_PAGE_SIZE);
  }, [typeFilter, companyFilter, skillFilter]);

  const { data: companies } = useQuery({
    queryKey: ["companies", "list"],
    queryFn: () => companiesApi.list(),
  });

  const filters = {
    type: typeFilter !== "all" ? (typeFilter as "agent" | "human") : undefined,
    companyId: companyFilter !== "all" ? companyFilter : undefined,
    skill: skillFilter || undefined,
    limit,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["directory", "instance-profiles", filters],
    queryFn: () => directoryApi.getInstanceProfiles(filters),
  });

  const profiles = data?.profiles ?? [];
  const total = data?.total ?? 0;
  const hasMore = profiles.length < total && limit < DIRECTORY_MAX_LIMIT;

  if (isLoading && !data) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">Failed to load the profile directory</p>
        <p className="text-[12px] text-muted-foreground">Instance admin access is required.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      <section className="px-4 md:px-8 py-8 md:py-10 border-b border-border/40 bg-accent/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Users className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                Instance Profile Directory
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Cross-company view of every agent and member profile, public or private — visibility state is shown per row.
            </p>
          </div>
          <div className="flex items-center gap-4 mt-2 md:mt-0">
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-black text-emerald-500">{total}</span>
              <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Total Profiles</span>
            </div>
          </div>
        </div>
      </section>

      <main className="px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Profile Directory</h3>
            <span className="text-[11px] font-bold text-muted-foreground">{profiles.length} of {total}</span>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[160px] text-[12px] font-bold">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="agent">Agents</SelectItem>
                <SelectItem value="human">Humans</SelectItem>
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[200px] text-[12px] font-bold">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {(companies ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                placeholder="Filter agents by skill..."
                className="h-9 pl-8 text-[12px]"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="bg-accent/5 flex items-center px-6 py-3 text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                <div className="w-[8%]">Type</div>
                <div className="w-[22%]">Name</div>
                <div className="w-[20%]">Title</div>
                <div className="w-[18%]">Company</div>
                <div className="w-[22%]">Skills</div>
                <div className="w-[10%] text-right">Visibility</div>
              </div>

              <div className="divide-y divide-border/40">
                {profiles.length === 0 ? (
                  <div className="px-6 py-10 text-center text-[12px] text-muted-foreground">
                    No profiles match the current filters.
                  </div>
                ) : (
                  profiles.map((profile) => (
                    <div key={`${profile.type}:${profile.id}`} className="flex items-center px-6 py-4 hover:bg-accent/5 transition-colors">
                      <div className="w-[8%]">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          {profile.type}
                        </span>
                      </div>
                      <div className="w-[22%] text-[12px] font-black text-foreground truncate pr-2">{profile.name}</div>
                      <div className="w-[20%] text-[12px] text-muted-foreground font-medium truncate pr-2">{profile.title}</div>
                      <div className="w-[18%] text-[12px] font-bold text-foreground truncate pr-2" title={profile.companyName}>
                        {profile.companyPrefix ?? profile.companyName}
                      </div>
                      <div className="w-[22%] text-[11px] text-muted-foreground truncate pr-4">
                        {profile.skills.length > 0 ? profile.skills.slice(0, 3).join(", ") : "—"}
                      </div>
                      <div className="w-[10%] text-right flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-widest">
                        {profile.isPublicProfile ? (
                          <span className="flex items-center gap-1 text-emerald-500"><Eye className="h-3.5 w-3.5" /> Public</span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3.5 w-3.5" /> Private</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {hasMore && (
              <div className="flex items-center justify-center px-6 py-4 border-t border-border/40">
                <Button
                  variant="outline"
                  className="h-9 px-6 text-[11px] font-black uppercase tracking-widest"
                  onClick={() => setLimit((l) => Math.min(l + DIRECTORY_PAGE_SIZE, DIRECTORY_MAX_LIMIT))}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                  Load More
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
