import React, { useState } from "react";
import {
  ShieldCheck,
  BadgeCheck,
  Key,
  FileCheck,
  ExternalLink,
  Activity,
  Fingerprint,
  Clock,
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { amxApi, certificatePdfUrl, type AmxCertificate, type VerifyCertificateResult } from "@/api/amx";
import { useCompany } from "@/context/CompanyContext";
import { CertificateQr } from "@/components/CertificateQr";

function buildVerifyUrl(footprint: string): string {
  return `${window.location.origin}/api/certificates/verify/${encodeURIComponent(footprint)}`;
}

function CertCard({
  cert,
  companyId,
}: {
  cert: AmxCertificate;
  companyId: string;
}) {
  const [verifyResult, setVerifyResult] = useState<VerifyCertificateResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await amxApi.verifyCertificate(cert.certificateFootprint);
      setVerifyResult(result);
    } catch {
      setVerifyResult({ valid: false, error: "Verification request failed" });
    } finally {
      setVerifying(false);
    }
  };

  const verifyUrl = buildVerifyUrl(cert.certificateFootprint);
  const principal = cert.responsiblePrincipalName ?? cert.responsiblePrincipalId;

  return (
    <div className="p-8 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col gap-6 relative group overflow-hidden">
      <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none group-hover:opacity-[0.06] transition-opacity">
        <ShieldCheck className="w-64 h-64" />
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileCheck className="h-5 w-5 text-primary" />
            <span className="text-lg md:text-xl font-black text-primary">
              {cert.issueIdentifier ?? cert.id.slice(0, 8).toUpperCase()}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                cert.status === "active"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-red-500/10 text-red-500 border-red-500/20"
              }`}
            >
              {cert.status}
            </span>
          </div>
          <p className="text-[12px] md:text-[13px] text-muted-foreground font-medium mt-1">
            Principal: {principal} &nbsp;|&nbsp; Issued:{" "}
            {new Date(cert.issuedAt).toLocaleDateString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {cert.completionTimeMs.toLocaleString()} ms &nbsp;·&nbsp;{" "}
            {cert.finalCostTokens.toLocaleString()} tokens &nbsp;·&nbsp;{" "}
            {cert.projects.length}P / {cert.resources.length}R / {cert.reports.length}Rep
          </p>
        </div>
        <CertificateQr verifyUrl={verifyUrl} size={96} />
      </div>

      <div className="p-4 rounded-xl bg-background/80 border border-primary/10 backdrop-blur-sm relative z-10">
        <div className="flex items-center gap-2 mb-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
          <Fingerprint className="h-3.5 w-3.5" />
          Cryptographic Footprint
        </div>
        <div className="text-[9px] md:text-[11px] font-mono break-all text-primary/80 font-bold leading-relaxed">
          {cert.certificateFootprint}
        </div>
      </div>

      {verifyResult && (
        <div
          className={`p-4 rounded-xl border relative z-10 ${
            verifyResult.valid
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
              : "bg-red-500/10 border-red-500/20 text-red-700"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest mb-1">
            {verifyResult.valid ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {verifyResult.valid ? "Certificate Valid" : "Verification Failed"}
          </div>
          {verifyResult.error && (
            <p className="text-[11px] font-medium">{verifyResult.error}</p>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10">
        <Button className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest justify-center" asChild>
          <a href={certificatePdfUrl(companyId, cert.id)} download>
            <Download className="h-4 w-4" />
            Download Certificate PDF
          </a>
        </Button>
        <Button
          variant="outline"
          className="h-10 px-6 gap-2 font-black text-[11px] uppercase tracking-widest border-border/60 justify-center"
          onClick={handleVerify}
          disabled={verifying}
        >
          {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Verify on Pacific L2
        </Button>
      </div>
    </div>
  );
}

export function AmxChain() {
  const { selectedCompanyId } = useCompany();

  const { data: chainData, isLoading: chainLoading, error: chainError } = useQuery({
    queryKey: ["amx", "chain", selectedCompanyId],
    queryFn: () => amxApi.getChain(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: certsData, isLoading: certsLoading } = useQuery({
    queryKey: ["amx", "certificates", selectedCompanyId],
    queryFn: () => amxApi.getCertificates(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (chainLoading || certsLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500/60" />
      </div>
    );
  }

  if (chainError) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground font-bold">Failed to load ledger data</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry</Button>
      </div>
    );
  }

  const logs = chainData?.logs ?? [];
  const certificates = certsData ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-background/50 animate-in fade-in duration-500">
      {/* Header Section */}
      <section className="px-4 md:px-8 py-8 md:py-10 border-b border-border/40 bg-accent/5 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground uppercase">
                AMX CHAIN EXPLORER
              </h1>
            </div>
            <p className="text-base md:text-xl text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Verifiable proof of work and immutable security auditing. Track every transaction, permission grant, and intelligence deliverable on the AMX Labs ledger.
            </p>
          </div>

          <div className="flex wrap items-center gap-4 mt-2 md:mt-0">
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-black text-emerald-500">{logs.length}</span>
              <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Security Events</span>
            </div>
            <div className="w-px h-10 bg-border/60 mx-2 md:mx-4" />
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-black text-emerald-500">{certificates.length}</span>
              <span className="text-[9px] md:text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Certificates</span>
            </div>
          </div>
        </div>
      </section>

      {/* Audit Panels */}
      <main className="px-4 md:px-8 py-6 md:py-10">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Recent Security Events */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Recent Security Events</h3>
              <Button variant="ghost" className="h-8 text-[11px] font-black uppercase tracking-widest text-primary hover:bg-primary/10">View Full Ledger</Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="bg-accent/5 flex items-center px-6 py-3 text-[10px] font-black tracking-widest uppercase text-muted-foreground">
                  <div className="w-[15%]">Event ID</div>
                  <div className="w-[20%]">Type</div>
                  <div className="w-[25%]">Principal</div>
                  <div className="w-[25%]">Hash</div>
                  <div className="w-[15%] text-right">Status</div>
                </div>

                <div className="divide-y divide-border/40">
                  {logs.length === 0 ? (
                    <div className="px-6 py-10 text-center text-[12px] text-muted-foreground">
                      No security events recorded yet.
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="flex items-center px-6 py-4 hover:bg-accent/5 transition-colors group">
                        <div className="w-[15%] text-[11px] font-mono text-muted-foreground">{log.id.slice(0, 8)}</div>
                        <div className="w-[20%]">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            {log.action}
                          </span>
                        </div>
                        <div className="w-[25%] text-[12px] font-black text-foreground">{log.principal}</div>
                        <div className="w-[25%] text-[12px] text-muted-foreground font-medium truncate pr-4" title={log.hash}>{log.hash}</div>
                        <div className="w-[15%] text-right">
                          <div className={`flex items-center justify-end gap-1.5 text-[10px] font-black uppercase tracking-widest ${log.status === "VERIFIED" ? "text-emerald-500" : "text-amber-500 animate-pulse"}`}>
                            {log.status === "VERIFIED" ? <BadgeCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            {log.status}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Certificate Explorer */}
            <div className="mt-12 space-y-6">
              <h3 className="text-[13px] font-black tracking-[0.3em] uppercase text-muted-foreground">Proof of Work Certificates</h3>

              {certificates.length === 0 ? (
                <div className="p-10 rounded-2xl border border-border/60 bg-card text-center text-[12px] text-muted-foreground">
                  No certificates issued yet.
                </div>
              ) : (
                certificates.map((cert) => (
                  <CertCard key={cert.id} cert={cert} companyId={selectedCompanyId!} />
                ))
              )}
            </div>
          </div>

          {/* Side Info */}
          <aside className="space-y-8">
            <div className="p-8 rounded-2xl bg-card border border-border shadow-md">
              <div className="flex items-center gap-2 mb-6 text-primary">
                <Activity className="h-5 w-5" />
                <h4 className="text-[12px] font-black uppercase tracking-widest">Ledger Health</h4>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Security Events</span>
                  <span className="text-[14px] font-black text-foreground">{logs.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Active Certificates</span>
                  <span className="text-[14px] font-black text-foreground">
                    {certificates.filter((c) => c.status === "active").length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Last Event</span>
                  <span className="text-[14px] font-black text-foreground">
                    {logs[0] ? new Date(logs[0].timestamp).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Latest Cert</span>
                  <span className="text-[14px] font-black text-foreground">
                    {certificates[0] ? new Date(certificates[0].issuedAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-border/40">
                <Button variant="outline" className="w-full h-11 uppercase font-black tracking-widest text-[11px] border-border/60">
                  Explorer Console
                </Button>
              </div>
            </div>

            <div className="p-8 rounded-2xl bg-card border border-border shadow-md">
              <div className="flex items-center gap-2 mb-4 text-emerald-500">
                <Key className="h-5 w-5" />
                <h4 className="text-[12px] font-black uppercase tracking-widest">Secure Access</h4>
              </div>
              <p className="text-[12px] text-muted-foreground font-medium leading-relaxed mb-6">
                Only authorized Principals (Owners, Adms, Security Guards) can view sensitive audit details.
              </p>
              <div className="p-4 rounded-xl bg-accent/5 border border-border/40 font-mono text-[11px] text-muted-foreground">
                Principal Key: PRE_AUTH_OK
                Status: SECURE_ENVIRONMENT
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
