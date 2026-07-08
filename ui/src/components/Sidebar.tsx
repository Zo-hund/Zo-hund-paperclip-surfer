import {
  Activity,
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  FolderKanban,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Mic,
  Settings,
  Plug,
  BarChart3,
  Brain,
  Zap,
  Factory,
  GraduationCap,
  ShieldCheck,
  Wallet,
  Store,
  Briefcase,
  ClipboardCheck,
  GitBranch,
  Route,
  UserPlus,
  Building2,
  CalendarDays,
  BookOpen,
  Users,
  Award,
  FileText,
  CreditCard,
  Tag,
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
        <div className="flex items-center px-4 h-14 bg-accent/5">
          <div className="flex items-center gap-2">
            <img src="/brand-logo.png" alt="AMX LABS Logo" className="w-6 h-6 object-contain hover:drop-shadow-[0_0_16px_var(--primary)] hover:scale-110 transition-all duration-300" />
            <div className="flex flex-col">
              <span className="text-[12px] font-black tracking-widest uppercase text-foreground/90 leading-none pt-1">
                AMX LABS x AMX-AIR-HUBS
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
              className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors text-left"
            >
              <SquarePen className="h-4 w-4 shrink-0" />
              <span className="truncate">New Issue</span>
            </button>
            <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
            <SidebarNavItem to="/meetings" label="Meeting Hub" icon={Mic} />
            <SidebarNavItem to="/calendar" label="Calendar" icon={CalendarDays} />
            <SidebarNavItem
              to="/inbox"
              label="Inbox"
              icon={Inbox}
              badge={inboxBadge.inbox}
              badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
              alert={inboxBadge.failedRuns > 0}
            />
          </div>

          <SidebarSection label="Work">
            <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
            <SidebarNavItem to="/projects" label="Projects" icon={FolderKanban} />
            <SidebarNavItem to="/onboarding" label="Onboarding" icon={UserPlus} />
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
          <SidebarNavItem to="/run-history" label="Run History" icon={GitBranch} liveCount={liveRunCount} />
          <SidebarNavItem to="/memories" label="Memories" icon={Brain} />
          <SidebarNavItem to="/tracing" label="Tracing" icon={Route} />
          <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        <SidebarSection label="AMX XP HUB">
          <SidebarNavItem to="/marketplace" label="Marketplace" icon={Store} textBadge="Hire" />
          <SidebarNavItem to="/xp/exchange" label="XP Exchange" icon={Zap} textBadge="Live" className="group" iconClassName="group-hover:animate-flash-shake group-hover:text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.3)] transition-colors duration-200 text-amber-500" />
          <SidebarNavItem to="/rq/portal" label="RQ Portal" icon={Factory} />
          <SidebarNavItem to="/lms/dashboard" label="TECH AT NITE" icon={GraduationCap} />
          <SidebarNavItem to="/lms/brand" label="TAN Brand Portal" icon={Building2} />
          <SidebarNavItem to="/lms/command-center" label="CRM Command" icon={BarChart3} />
          <SidebarNavItem to="/dispatch/remote-work" label="Local + Cloud" icon={Route} textBadge="Work" textBadgeTone="amber" />
          <SidebarNavItem to="/dispatch/chain" label="AMX Chain" icon={ShieldCheck} />
          <SidebarNavItem to="/audit/team" label="Audit Team" icon={ClipboardCheck} textBadge="V3" textBadgeTone="amber" />
          <SidebarNavItem to="/xp/wallet" label="Wallet" icon={Wallet} />
          <SidebarNavItem to="/tests/ux/runs" label="UX Trace Lab" icon={Activity} textBadge="Lab" />
          <SidebarNavItem to="/briefcase" label="Master Briefcase" icon={Briefcase} textBadge="Board" textBadgeTone="amber" />
        </SidebarSection>

        <SidebarSection label="TAN Workspace">
          <SidebarNavItem to="/lms/workshops" label="Workshops" icon={BookOpen} />
          <SidebarNavItem to="/lms/sessions" label="Sessions" icon={CalendarDays} />
          <SidebarNavItem to="/lms/enrollments" label="Enrollments" icon={Users} />
          <SidebarNavItem to="/opprrc" label="OPPRRC Vault" icon={Award} />
          <SidebarNavItem to="/reports" label="Reports" icon={FileText} />
          <SidebarNavItem to="/certificates" label="Certificates" icon={Tag} />
          <SidebarNavItem to="/billing" label="Billing" icon={CreditCard} />
          <SidebarNavItem to="/pricing" label="TAN Pricing" icon={DollarSign} textBadge="Plans" />
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
