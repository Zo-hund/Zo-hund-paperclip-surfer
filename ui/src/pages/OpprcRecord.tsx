import { useEffect, useMemo } from "react";
import { useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Download, Loader2, Tag, Calendar, Clock, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { issuesApi } from "../api/issues";
import { approvalsApi } from "../api/approvals";
import { opprrcApi } from "../api/opprrc";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";
import { useNavigate } from "@/lib/router";
import type { OpprcDeliveryReviewStatus } from "@paperclipai/shared";

const REVIEW_STATUS_CONFIG: Record<OpprcDeliveryReviewStatus, { label: string; badge: string }> = {
  not_submitted: { label: "Not Submitted", badge: statusBadgeDefault },
  pending_review: { label: "Pending Board Review", badge: statusBadge.pending_approval ?? statusBadgeDefault },
  approved: { label: "Approved", badge: statusBadge.approved ?? statusBadgeDefault },
  revision_requested: { label: "Revision Requested", badge: statusBadge.revision_requested ?? statusBadgeDefault },
  rejected: { label: "Rejected", badge: statusBadge.rejected ?? statusBadgeDefault },
};

export function OpprcRecord() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: "OPPRRC", href: "/opprrc" },
      { label: "Delivery Detail" },
    ]);
  }, [setBreadcrumbs]);

  const deliveryQuery = useQuery({
    queryKey: queryKeys.opprrc.delivery(selectedCompanyId ?? "", deliveryId ?? ""),
    queryFn: () => opprrcApi.getDelivery(selectedCompanyId!, deliveryId!),
    enabled: !!selectedCompanyId && !!deliveryId,
  });
  const delivery = deliveryQuery.data;

  const issueQuery = useQuery({
    queryKey: ["issues", "detail", delivery?.issueId],
    queryFn: () => issuesApi.get(delivery!.issueId),
    enabled: !!delivery?.issueId,
  });
  const issue = issueQuery.data;

  // Pending opprrc_delivery_review approvals for this company — used to
  // decide whether to show "Submit for Board Review" or a "Pending Board
  // Review" pill. Same pattern as PromoteToMarketControl / AgentResumeProfile.
  const pendingApprovalsQuery = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId ?? "", "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId,
  });
  const isPendingReview = useMemo(() => {
    for (const approval of pendingApprovalsQuery.data ?? []) {
      if (approval.type !== "opprrc_delivery_review") continue;
      const payload = (approval.payload ?? {}) as Record<string, unknown>;
      if (payload.deliveryId === deliveryId) return true;
    }
    return false;
  }, [pendingApprovalsQuery.data, deliveryId]);

  const submitForReviewMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId || !deliveryId) throw new Error("Missing company or delivery");
      return approvalsApi.create(selectedCompanyId, {
        type: "opprrc_delivery_review",
        payload: { deliveryId },
      });
    },
    onSuccess: () => {
      pushToast({ title: "Submitted for board review", body: "The board has been notified.", tone: "success" });
      if (selectedCompanyId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId, "pending") });
        void queryClient.invalidateQueries({ queryKey: queryKeys.opprrc.delivery(selectedCompanyId, deliveryId!) });
      }
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Could not submit for review",
        body: err instanceof Error ? err.message : "Please try again.",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId || !deliveryId) return null;

  if (deliveryQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading delivery…
      </div>
    );
  }

  if (!delivery) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Delivery not found.</div>;
  }

  const reviewCfg = REVIEW_STATUS_CONFIG[delivery.reviewStatus] ?? {
    label: delivery.reviewStatus,
    badge: statusBadgeDefault,
  };
  const canSubmitForReview = delivery.reviewStatus === "not_submitted" || delivery.reviewStatus === "revision_requested";
  const showReviewControl = canSubmitForReview || isPendingReview;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/opprrc")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{issue?.title ?? "OPPRRC Delivery"}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span
              className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", reviewCfg.badge)}
            >
              {reviewCfg.label}
            </span>
            <span>·</span>
            <span className="capitalize">{delivery.category.replace(/^\d+_/, "").replace(/_/g, " ")}</span>
            <span>·</span>
            <span>{delivery.audience}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(delivery.deliveredAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {showReviewControl ? (
            isPendingReview ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-500">
                <Clock className="h-3 w-3" /> Pending Board Review
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={submitForReviewMutation.isPending}
                onClick={() => submitForReviewMutation.mutate()}
              >
                {submitForReviewMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Submit for Board Review
              </Button>
            )
          ) : null}
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!delivery.vpsFileUrl}
            title={delivery.vpsFileUrl ? undefined : "No file attached to this delivery"}
            asChild={!!delivery.vpsFileUrl}
          >
            {delivery.vpsFileUrl ? (
              <a href={delivery.vpsFileUrl} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Summary</h2>
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {issue?.description ?? "No description provided."}
          </p>
        </div>

        <div className="bg-black/50 border border-white/8 rounded-xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Delivery Details</h2>
          <div className="flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium">{delivery.category}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Audience</span>
              <span className="font-medium">{delivery.audience}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Delivered</span>
              <span className="font-medium">{new Date(delivery.deliveredAt).toLocaleString()}</span>
            </div>
            {delivery.runNumber != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Run #</span>
                <span className="font-medium">{delivery.runNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Review Status</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", reviewCfg.badge)}>
                {reviewCfg.label}
              </span>
            </div>
            {!delivery.vpsFileUrl && (
              <p className="text-muted-foreground/70 pt-1">No file is attached to this delivery yet.</p>
            )}
          </div>
        </div>

        {issue && (issue.labels ?? []).length > 0 && (
          <div className="bg-black/50 border border-white/8 rounded-xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" /> Labels
            </h2>
            <div className="flex flex-wrap gap-2">
              {(issue.labels ?? []).map(label => (
                <span key={label.id} className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {label.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
