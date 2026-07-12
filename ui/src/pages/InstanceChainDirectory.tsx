/**
 * Instance-wide sibling of AmxChain.tsx's directory panel — same filter/table
 * UX, but crossing company boundaries (assertInstanceAdmin-gated server
 * side), with a Company column/filter since events aren't readable without
 * knowing which tenant they belong to.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, Search, BadgeCheck, Loader2 } from "lucide-react";
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
import { amxApi } from "@/api/amx";
import { companiesApi } from "@/api/companies";

const CHAIN_ACTIONS = [
  "CREDIT_SPEND",
  "CREDIT_REFUND",
  "AGENT_EARNINGS",
  "MARKETPLACE_CHARGE",
  "MARKETPLACE_PAYOUT",
  "CREDIT_PURCHASE",
  "MONTHLY_ALLOWANCE",
  "LEDGER_TRANSFER",
  "AUDIT_FINDING",
];

const DIRECTORY_PAGE_SIZE = 50;
const DIRECTORY_MAX_LIMIT = 200;

export function InstanceChainDirectory() {
  const [actionFilter, setActionFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [principalIdInput, setPrincipalIdInput] = useState("");
  const [principalIdFilter, setPrincipalIdFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [untilFilter, setUntilFilter] = useState("");
  const [limit, setLimit] = useState(DIRECTORY_PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setPrincipalIdFilter(principalIdInput.trim()), 300);
    return () => clearTimeout(t);
  }, [principalIdInput]);

  useEffect(() => {
    setLimit(DIRECTORY_PAGE_SIZE);
  }, [actionFilter, companyFilter, principalIdFilter, sinceFilter, untilFilter]);

  const { data: companies } = useQuery({
    queryKey: ["companies", "list"],
    queryFn: () => companiesApi.list(),
  });

  const filters = {
    action: actionFilter !== "all" ? actionFilter : undefined,
    companyId: companyFilter !== "all" ? companyFilter : undefined,
    principalId: principalIdFilter || undefined,
    since: sinceFilter ? `${sinceFilter}T00:00:00.000Z` : undefined,
    until: untilFilter ? `${untilFilter}T23:59:59.999Z` : undefined,
    limit,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["amx", "instanceChainDirectory", filters],
    queryFn: () => amxApi.getInstanceChainDirectory(filters),
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const hasMore = events.length < total && limit < DIRECTORY_MAX_LIMIT;

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
        <p className="text-muted-foreground font-bold">Failed to load the chain directory</p>
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
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                Instance Chain Directory
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Cross-company view of every AMX Chain event — credit spends, refunds, agent earnings, marketplace charges, purchases, and audit findings across all tenants.
            </p>
          </div>
          <div className="flex items-center gap-4 mt-2 md:mt-0">
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-black text-emerald-500">{total}</span>
              <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Total Events</span>
            </div>
          </div>
        </div>
      </section>

      <main className="px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Chain Directory</h3>
            <span className="text-[11px] font-bold text-muted-foreground">{events.length} of {total}</span>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
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

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-[12px] font-bold">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {CHAIN_ACTIONS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={principalIdInput}
                onChange={(e) => setPrincipalIdInput(e.target.value)}
                placeholder="Search by principal ID..."
                className="h-9 pl-8 text-[12px]"
              />
            </div>

            <Input
              type="date"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
              className="h-9 w-full sm:w-[150px] text-[12px]"
              aria-label="Since date"
            />
            <Input
              type="date"
              value={untilFilter}
              onChange={(e) => setUntilFilter(e.target.value)}
              className="h-9 w-full sm:w-[150px] text-[12px]"
              aria-label="Until date"
            />
          </div>

          <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
            <div className="min-w-[840px]">
              <div className="bg-accent/5 flex items-center px-6 py-3 text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                <div className="w-[12%]">Event ID</div>
                <div className="w-[16%]">Type</div>
                <div className="w-[16%]">Company</div>
                <div className="w-[21%]">Principal</div>
                <div className="w-[20%]">Details</div>
                <div className="w-[15%] text-right">Recorded</div>
              </div>

              <div className="divide-y divide-border/40">
                {events.length === 0 ? (
                  <div className="px-6 py-10 text-center text-[12px] text-muted-foreground">
                    No chain events match the current filters.
                  </div>
                ) : (
                  events.map((event) => {
                    const amount = event.payload?.["amount"];
                    const txId = event.payload?.["transactionId"];
                    return (
                      <div key={event.id} className="flex items-center px-6 py-4 hover:bg-accent/5 transition-colors">
                        <div className="w-[12%] text-[11px] font-mono text-muted-foreground">{event.id.slice(0, 8)}</div>
                        <div className="w-[16%]">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {event.action}
                          </span>
                        </div>
                        <div className="w-[16%] text-[12px] font-bold text-foreground truncate pr-2" title={event.companyName ?? undefined}>
                          {event.companyPrefix ?? event.companyName ?? "—"}
                        </div>
                        <div className="w-[21%] text-[12px] font-black text-foreground truncate pr-2" title={event.principalId}>
                          {event.principalType}:{event.principalId}
                        </div>
                        <div className="w-[20%] text-[12px] text-muted-foreground font-medium truncate pr-4">
                          {typeof amount === "number" ? `${amount.toLocaleString()} · ` : ""}
                          {typeof txId === "string" ? txId.slice(0, 8) : "—"}
                        </div>
                        <div className="w-[15%] text-right flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          {new Date(event.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    );
                  })
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
