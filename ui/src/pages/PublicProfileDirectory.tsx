/**
 * PublicProfileDirectory
 *
 * Public, session-independent cross-company directory of agent + human
 * profiles that have opted into visibility (agents.isPublicProfile /
 * lmsMemberProfiles.isPublicProfile, gated by companies.isPublic on the
 * server). Modeled on PublicPricing.tsx: data comes from a dedicated
 * unauthenticated API (directoryApi.getPublicProfiles), no dependency on
 * CompanyContext/CloudAccessGate.
 *
 * The company filter isn't backed by companiesApi.list() — that route
 * requires a session, which a visitor here doesn't have — so the dropdown
 * options are instead derived from the companies already present in the
 * fetched profiles.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Loader2, Search, User, Users } from "lucide-react";
import { directoryApi, type DirectoryProfile } from "@/api/directory";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function dicebearUrl(seed: string) {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

function ProfileCard({ profile }: { profile: DirectoryProfile }) {
  const avatar = profile.avatarUrl ?? (profile.type === "agent" ? dicebearUrl(profile.id) : null);
  return (
    <a
      href={profile.href}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        {avatar ? (
          <img src={avatar} alt={profile.name} className="h-12 w-12 rounded-lg object-cover border border-border" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{profile.name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.title}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {profile.type === "agent" ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
        <span className="capitalize">{profile.type}</span>
        <span>·</span>
        <span className="truncate">{profile.companyName}</span>
      </div>

      {profile.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

export function PublicProfileDirectory() {
  const [type, setType] = useState<"all" | "agent" | "human">("all");
  const [skillInput, setSkillInput] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");

  const filters = {
    type: type !== "all" ? type : undefined,
    skill: skillInput.trim() || undefined,
    companyId: companyFilter !== "all" ? companyFilter : undefined,
    limit: 50,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["directory", "public-profiles", filters],
    queryFn: () => directoryApi.getPublicProfiles(filters),
  });

  const profiles = data?.profiles ?? [];

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles) map.set(p.companyId, p.companyName);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [profiles]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile Directory</h1>
          <p className="text-sm text-muted-foreground">
            Browse public agent and member profiles across every participating company.
          </p>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="h-9 w-full sm:w-[160px] text-sm">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="agent">Agents</SelectItem>
            <SelectItem value="human">Humans</SelectItem>
          </SelectContent>
        </Select>

        {companyOptions.length > 0 && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-9 w-full sm:w-[200px] text-sm">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companyOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            placeholder="Filter agents by skill..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Failed to load the directory. Please try again shortly.
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No public profiles match the current filters yet.
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs font-medium text-muted-foreground">
            {profiles.length} of {data?.total ?? 0} profiles
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard key={`${profile.type}:${profile.id}`} profile={profile} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
