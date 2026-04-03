import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Mic,
  Settings,
  Plug,
  BarChart3,
  Zap,
  Factory,
  GraduationCap,
  ShieldCheck,
  Wallet,
  Store,
  Briefcase,
  ClipboardCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col">
      <div className="flex flex-col shrink-0 border-b border-border/40">
        <div className="flex items-center px-4 h-11 bg-accent/5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-3.5 bg-primary rounded-[2px] shadow-[0_0_10px_var(--primary)]" />
            <div className="flex flex-col -gap-1">
              <span className="text-[11px] font-black tracking-widest uppercase text-foreground/90 leading-none">
                AMX LABS
              </span>
              <span className="text-[7px] font-bold tracking-[0.2em] uppercase text-muted-foreground/60 leading-none mt-0.5">
                Powered by AMX-AIR-HUBS
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 px-3 h-10">
          {selectedCompany?.brandColor && (
            <div
              className="w-3.5 h-3.5 rounded-sm shrink-0 ml-1"
              style={{ backgroundColor: selectedCompany.brandColor }}
            />
          )}
          <span className="flex-1 text-[13px] font-semibold text-foreground/80 truncate pl-1">
            {selectedCompany?.name ?? "Select project"}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground/50 shrink-0 hover:text-foreground"
            onClick={openSearch}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Issue</span>
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/meetings" label="Meetings" icon={Mic} textBadge="New" textBadgeTone="amber" />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          <SidebarNavItem to="/routines" label="Routines" icon={Repeat} textBadge="Beta" textBadgeTone="amber" />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Company">
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
          <SidebarNavItem to="/mcp-servers" label="MCPs" icon={Plug} />
          <SidebarNavItem to="/analytics" label="Analytics" icon={BarChart3} />
          <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        <SidebarSection label="AMX XP HUB">
          <SidebarNavItem to="/marketplace" label="Marketplace" icon={Store} textBadge="Hire" />
          <SidebarNavItem to="/xp/exchange" label="XP Exchange" icon={Zap} textBadge="Live" />
          <SidebarNavItem to="/rq/portal" label="RQ Portal" icon={Factory} />
          <SidebarNavItem to="/lms/dashboard" label="TECH AT NITE" icon={GraduationCap} />
          <SidebarNavItem to="/amx/chain" label="AMX Chain" icon={ShieldCheck} />
          <SidebarNavItem to="/audit/team" label="Audit Team" icon={ClipboardCheck} textBadge="V3" textBadgeTone="amber" />
          <SidebarNavItem to="/xp/wallet" label="Wallet" icon={Wallet} />
          <SidebarNavItem to="/briefcase" label="Master Briefcase" icon={Briefcase} textBadge="Board" textBadgeTone="amber" />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
