import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { api } from "../api/client";
import { cn } from "../lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpprrcDeliveryStorage {
  id: string;
  liveStorage: string;
  vpsFilePath: string | null;
  vpsFileUrl: string | null;
  vpsVerifiedAt: string | null;
  backupStorage: string;
  googleDriveFileId: string | null;
  googleDriveFolderId: string | null;
  googleDriveFileUrl: string | null;
  backupStatus: "not_started" | "synced" | "failed" | "stale";
  lastBackupAt: string | null;
  runNumber: number | null;
}

interface OpprrcRunControl {
  totalRuns: number;
  hardStopAt: number;
  remainingRuns: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BACKUP_STATUS_CONFIG = {
  not_started: { label: "Google Backup Pending", dot: "bg-amber-400", text: "text-amber-500" },
  synced: { label: "Google Backup Synced", dot: "bg-green-400", text: "text-green-500" },
  failed: { label: "Google Backup Failed", dot: "bg-destructive", text: "text-destructive" },
  stale: { label: "Google Backup Stale", dot: "bg-amber-400", text: "text-amber-500" },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  deliveryId: string;
  issueId: string;
}

export function OpprrcStoragePanel({ deliveryId, issueId }: Props) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const storageQuery = useQuery<OpprrcDeliveryStorage>({
    queryKey: ["opprrc", "delivery", deliveryId, "storage"],
    queryFn: () =>
      api.get<OpprrcDeliveryStorage>(`/companies/${selectedCompanyId}/opprrc/deliveries/${deliveryId}/storage`),
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      api.post(`/companies/${selectedCompanyId}/opprrc/deliveries/${deliveryId}/sync-backup`, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["opprrc", "delivery", deliveryId, "storage"],
      });
    },
  });

  const d = storageQuery.data;
  if (!d) return null;

  const statusCfg = BACKUP_STATUS_CONFIG[d.backupStatus] ?? BACKUP_STATUS_CONFIG.not_started;
  const categoryDisplay = d.vpsFilePath
    ? d.vpsFilePath.split("/").find((seg) => /^\d{2}_/.test(seg)) ?? "OPPRRC"
    : "OPPRRC";

  const exportMetadata = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `opprrc-delivery-${deliveryId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-card/50 p-3 text-sm">
      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" />
          Live on VPS
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground/70">
          {categoryDisplay}
        </span>
        {d.vpsFilePath?.includes("CLIENTS-EXTERNAL") && (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground/70">
            CLIENTS-EXTERNAL
          </span>
        )}
        {d.runNumber != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-foreground/70">
            Run #{d.runNumber}
          </span>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
            d.backupStatus === "synced" ? "bg-green-500/10" : "bg-amber-500/10",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full inline-block", statusCfg.dot)} />
          <span className={statusCfg.text}>{statusCfg.label}</span>
        </span>
      </div>

      {/* VPS path */}
      {d.vpsFilePath && (
        <p className="text-[11px] text-muted-foreground mb-3 font-mono truncate" title={d.vpsFilePath}>
          {d.vpsFilePath}
        </p>
      )}

      {/* Primary action */}
      <div className="mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Primary</p>
        <a
          href={d.vpsFileUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold",
            "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
            !d.vpsFileUrl && "pointer-events-none opacity-50",
          )}
        >
          Open Live Deliverable
        </a>
      </div>

      {/* Backup actions */}
      <div className="mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Backup</p>
        <div className="flex flex-col gap-1">
          <a
            href={d.googleDriveFileUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium",
              "border border-border bg-background hover:bg-accent transition-colors",
              !d.googleDriveFileUrl && "pointer-events-none opacity-40",
            )}
          >
            Open Google Backup
          </a>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
          >
            {syncMutation.isPending ? "Syncing…" : "Sync to Google Drive"}
          </button>
          <button
            type="button"
            onClick={exportMetadata}
            className="inline-flex w-full items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent transition-colors"
          >
            Export Metadata JSON
          </button>
        </div>
      </div>

      {/* Last backup time */}
      {d.lastBackupAt && (
        <p className="text-[11px] text-muted-foreground mt-1">
          Last synced: {new Date(d.lastBackupAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ── Run Control Banner ────────────────────────────────────────────────────────

export function OpprrcRunControlBanner() {
  const { selectedCompanyId } = useCompany();

  const query = useQuery<OpprrcRunControl>({
    queryKey: ["opprrc", "run-control", selectedCompanyId],
    queryFn: () => api.get<OpprrcRunControl>(`/companies/${selectedCompanyId}/opprrc/run-control`),
    staleTime: 5 * 60_000,
  });

  const data = query.data;
  if (!data) return null;
  if (data.totalRuns < data.hardStopAt) return null;

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">
      OPPRRC hard stop: {data.totalRuns}/{data.hardStopAt} runs completed. Manual operator reset required.
    </div>
  );
}
