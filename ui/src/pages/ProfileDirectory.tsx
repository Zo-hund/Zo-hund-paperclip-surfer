import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, User } from "lucide-react";
import { directoryApi, type DirectoryProfileFilters } from "@/api/directory";
import { useAccountIdentity } from "@/api/companies-query";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Public and private transports and cache entries never share data. */
export function ProfileDirectory({ instance = false, accountKey = "public", enabled = true }: {
  instance?: boolean;
  accountKey?: string;
  enabled?: boolean;
}) {
  const [type, setType] = useState<"all" | "agent" | "human">("all");
  const [skillInput, setSkillInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [filters, setFilters] = useState<DirectoryProfileFilters>({ limit: 50 });
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const scope = instance ? "instance-profiles" : "public-profiles";
  const result = useQuery({
    queryKey: ["directory", scope, accountKey, filters],
    queryFn: ({ signal }) => instance
      ? directoryApi.getInstanceProfiles(filters, signal)
      : directoryApi.getPublicProfiles(filters, signal),
    enabled,
    retry: false,
    gcTime: instance ? 0 : 5 * 60_000,
    refetchOnMount: "always",
  });
  const profiles = result.data?.profiles ?? [];
  const total = result.data?.total ?? 0;
  const busy = !enabled || result.isPending || (instance && result.isFetching);
  const denied = result.error instanceof ApiError && [401, 403].includes(result.error.status);
  useEffect(() => {
    if (!result.isSuccess || result.isFetching) return;
    // Keep choices after narrowing a result set, including an empty result.
    setCompanyNames((previous) => ({ ...previous, ...Object.fromEntries(result.data.profiles.map((p) => [p.companyId, p.companyName])) }));
  }, [result.isSuccess, result.isFetching, result.data]);

  if (instance && denied) return <main className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8" role="alert">
    <h1 className="text-2xl font-semibold">Instance Profile Directory</h1>
    <p>You do not have access to this directory. Sign in with an instance administrator account.</p>
    <Button variant="outline" onClick={() => void result.refetch()}>Retry</Button>
  </main>;

  return <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{instance ? "Instance Profile Directory" : "Profile Directory"}</h1>
      <p className="text-sm text-muted-foreground">{instance
        ? "Inspect agent and member profiles across companies. Instance administrator access is required."
        : "Browse agents and members whose company and profile have both opted into public visibility."}</p>
    </header>
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      setFilters({ type: type === "all" ? undefined : type, companyId: companyInput || undefined,
        skill: skillInput.trim() || undefined, limit: 50 });
    }}>
      <div className="flex flex-col gap-2">
        <label htmlFor="directory-type" className="text-sm">Profile type</label>
        <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
          <SelectTrigger id="directory-type"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="agent">Agents</SelectItem><SelectItem value="human">Members</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="directory-company" className="text-sm">Company</label>
        <Select value={companyInput || "all"} onValueChange={(value) => setCompanyInput(value === "all" ? "" : value)}>
          <SelectTrigger id="directory-company"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All companies</SelectItem>
            {Object.entries(companyNames).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="directory-skill" className="text-sm">Agent skill</label>
        <Input id="directory-skill" value={skillInput} maxLength={200} onChange={(event) => setSkillInput(event.target.value)} placeholder="Filter agent skills" />
      </div>
      <Button type="submit">Apply filters</Button>
      <Button type="button" variant="outline" onClick={() => {
        setType("all"); setCompanyInput(""); setSkillInput(""); setFilters({ limit: 50 });
      }}>Clear filters</Button>
    </form>
    {busy ? <p role="status" className="text-sm text-muted-foreground">Loading profiles…</p>
      : result.isError ? <div role="alert" className="flex flex-col gap-3">
        <p>{denied ? "You do not have access to this directory. Sign in with an instance administrator account." : "The directory could not be loaded. Try again."}</p>
        <Button variant="outline" onClick={() => void result.refetch()}>Retry</Button>
      </div>
        : <>
          <p role="status" className="text-sm text-muted-foreground">Showing {profiles.length} of {total} profiles</p>
          {profiles.length === 0 ? <p>No profiles match these filters.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => <Card key={`${profile.type}:${profile.id}`}>
              <CardHeader>
                <div className="flex items-center gap-2">{profile.type === "agent" ? <Bot aria-hidden="true" className="size-5" /> : <User aria-hidden="true" className="size-5" />}<CardTitle>{profile.name}</CardTitle></div>
                <CardDescription>{profile.title} · {profile.companyName}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">{profile.skills.map((skill, index) => <Badge variant="secondary" key={`${skill}:${index}`}>{skill}</Badge>)}</div>
                {instance && <Badge variant="outline">{profile.isPublicProfile ? "Profile opted in" : "Profile private"}</Badge>}
              </CardContent>
            </Card>)}
          </div>}
          {profiles.length < total && <div className="flex flex-col gap-2">
            {(filters.limit ?? 50) < 200 ? <Button variant="outline" onClick={() => setFilters((current) => ({ ...current, limit: Math.min((current.limit ?? 50) + 50, 200) }))}>Load more</Button>
              : <p className="text-sm text-muted-foreground">The directory shows up to 200 profiles. Narrow your filters to find more.</p>}
          </div>}
        </>}
  </main>;
}

export function PublicProfileDirectory() { return <ProfileDirectory />; }

export function InstanceProfileDirectory() {
  const { userId, settled } = useAccountIdentity();
  // Remount filters and the remembered company options on account changes.
  return <ProfileDirectory key={userId ?? "anonymous"} instance accountKey={userId ?? "anonymous"} enabled={settled} />;
}
