import React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/50", className)}
      {...props}
    />
  );
}

export function EarnerCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden p-6 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton className="w-16 h-16 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 px-2" />
        <Skeleton className="h-5 w-16 px-2" />
        <Skeleton className="h-5 w-16 px-2" />
      </div>
      <div className="pt-4 border-t border-border/40 flex justify-between">
        <div className="space-y-1">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

export function RqSubmissionSkeleton() {
  return (
    <div className="p-6 rounded-2xl border border-border/40 bg-accent/5 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export function LedgerLogSkeleton() {
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-border/40">
      <div className="flex items-center gap-6">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
           <Skeleton className="h-4 w-32" />
           <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
         <Skeleton className="h-6 w-24" />
         <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
