import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCheck, ChevronDown, X, UserMinus } from "lucide-react";
import { cn } from "../lib/utils";

export interface BulkAgent {
  id: string;
  name: string;
}

interface BulkActionToolbarProps {
  count: number;
  agents: BulkAgent[];
  onClose: () => void;
  onAssign: (agentId: string) => void;
  onUnassign: () => void;
  onClear: () => void;
  isPending: boolean;
}

export function BulkActionToolbar({
  count,
  agents,
  onClose,
  onAssign,
  onUnassign,
  onClear,
  isPending,
}: BulkActionToolbarProps) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl",
        "bg-background border border-border",
        isPending && "opacity-70 pointer-events-none",
      )}
    >
      <span className="text-sm font-medium text-foreground mr-1">
        {count} {count === 1 ? "issue" : "issues"} selected
      </span>

      <div className="h-4 w-px bg-border mx-1" />

      {/* Close (mark done) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={isPending}
        className="gap-1.5"
      >
        <CheckCheck className="h-3.5 w-3.5" />
        Close
      </Button>

      {/* Assign to agent */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending || agents.length === 0}
            className="gap-1.5"
          >
            Assign to
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
          {agents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => onAssign(agent.id)}
            >
              {agent.name}
            </DropdownMenuItem>
          ))}
          {agents.length === 0 && (
            <DropdownMenuItem disabled>No agents available</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Unassign */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onUnassign}
        disabled={isPending}
        className="gap-1.5"
      >
        <UserMinus className="h-3.5 w-3.5" />
        Unassign
      </Button>

      <div className="h-4 w-px bg-border mx-1" />

      {/* Clear selection */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={isPending}
        className="h-7 w-7 p-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
