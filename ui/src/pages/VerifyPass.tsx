import { useEffect, useState } from "react";
import { useParams } from "@/lib/router";
import { ShieldCheck, ShieldAlert, Loader2, Building2, BadgeCheck } from "lucide-react";
import { PublicLayout } from "@/components/PublicLayout";
import { companiesApi } from "@/api/companies";

type VerifyState =
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "ok";
      valid: boolean;
      passId: string;
      memberName: string | null;
      tier: string;
      status: string;
      company: string | null;
      issuedAt: string | null;
    };

export function VerifyPassPage() {
  const { passId } = useParams<{ passId: string }>();
  const [state, setState] = useState<VerifyState>({ kind: "loading" });

  useEffect(() => {
    if (!passId) return;
    let cancelled = false;
    companiesApi.verifyPass(passId)
      .then((d) => { if (!cancelled) setState({ kind: "ok", ...d }); })
      .catch(() => { if (!cancelled) setState({ kind: "error" }); });
    return () => { cancelled = true; };
  }, [passId]);

  return (
    <PublicLayout>
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8">
          {state.kind === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying pass…</p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <ShieldAlert className="h-12 w-12 text-red-500" />
              <h1 className="text-xl font-bold">Pass not found</h1>
              <p className="text-sm text-muted-foreground">
                This membership pass could not be verified. It may be invalid or revoked.
              </p>
              <code className="text-[11px] text-muted-foreground mt-1">{passId}</code>
            </div>
          )}

          {state.kind === "ok" && (
            <div className="flex flex-col items-center gap-4 text-center">
              {state.valid ? (
                <>
                  <div className="p-3 rounded-full bg-emerald-500/10">
                    <ShieldCheck className="h-12 w-12 text-emerald-400" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Verified Member</h1>
                    <p className="text-sm text-emerald-400 font-medium mt-1">Active AMX membership</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-full bg-amber-500/10">
                    <ShieldAlert className="h-12 w-12 text-amber-400" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">Pass inactive</h1>
                    <p className="text-sm text-amber-400 font-medium mt-1">Status: {state.status}</p>
                  </div>
                </>
              )}

              <div className="w-full mt-2 rounded-xl border border-border/40 divide-y divide-border/40 text-left">
                {state.memberName && (
                  <Row icon={<BadgeCheck className="h-4 w-4" />} label="Member" value={state.memberName} />
                )}
                <Row icon={<ShieldCheck className="h-4 w-4" />} label="Access tier" value={state.tier} />
                {state.company && (
                  <Row icon={<Building2 className="h-4 w-4" />} label="Organization" value={state.company} />
                )}
                {state.issuedAt && (
                  <Row
                    icon={<BadgeCheck className="h-4 w-4" />}
                    label="Issued"
                    value={new Date(state.issuedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  />
                )}
              </div>

              <code className="text-[11px] text-muted-foreground mt-1">{state.passId}</code>
              <p className="text-[11px] text-muted-foreground">Verified by AMX Platform</p>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs uppercase tracking-widest text-muted-foreground flex-1">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}
