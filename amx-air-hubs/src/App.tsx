import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components";
import { CompletePage, HomePage, AgentsPage, MissionRunPage, MissionsPage, PreRunPage, RoleSelectPage } from "./pages/core";
import { AdminPage, AnalyticsPage, ControlPage, MarketplacePage, PodsPage, ScanResolver, SponsorPage, SponsorResolver, WalletPage } from "./pages/secondary";
import { QRStudioPage, RoleDashboardPage } from "./pages/operations";
import { TenantConsolePage } from "./TenantConsole";
import { NexusPage } from "./pages/nexus";
import { AMXXRStagePage } from "./pages/stage";
import { StageLiveViewerPage } from "./pages/stage-viewer";
import { AgentWorkbenchPage } from "./pages/agent-workbench";
import { RuntimeStatusPage } from "./pages/runtime-status";
import { PodInvitePage } from "./pages/invites";
import { AccountPage, PublicMemberProfilePage } from "./pages/account";
import { PartnerCampaignResolverPage, PartnerJoinPage, PartnerPortalPage } from "./pages/partners";
import { RequireMember } from "./member-auth";
import {
  AgentProfilePage, ComfortSettingsPage, ExperienceLauncherPage, HumanProfilePage,
  ModeExperiencePage, ReplayPage, RoomLobbyPage, TeamMonitorPage, TeamProfilePage,
  TeamsPage, ToolbeltPage,
} from "./pages/immersive";

const MissionWorldPage = lazy(async () => ({ default: (await import("./MissionWorld")).MissionWorldPage }));

function ShellRoutes() {
  return <AppShell><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/account" element={<AccountPage/>}/>
    <Route path="/members/:slug" element={<PublicMemberProfilePage/>}/>
    <Route path="/role" element={<RequireMember><RoleSelectPage/></RequireMember>}/>
    <Route path="/dashboard" element={<RequireMember><RoleDashboardPage/></RequireMember>}/>
    <Route path="/missions" element={<RequireMember><MissionsPage/></RequireMember>}/>
    <Route path="/agents" element={<RequireMember><AgentsPage/></RequireMember>}/>
    <Route path="/agents/:agentId/profile" element={<RequireMember><AgentProfilePage/></RequireMember>}/>
    <Route path="/agents/:agentId/workspace" element={<RequireMember><AgentWorkbenchPage/></RequireMember>}/>
    <Route path="/play/:missionId" element={<RequireMember><ExperienceLauncherPage/></RequireMember>}/>
    <Route path="/mission/:id/pre" element={<RequireMember><PreRunPage/></RequireMember>}/>
    <Route path="/mission/:id/complete" element={<RequireMember><CompletePage/></RequireMember>}/>
    <Route path="/wallet" element={<RequireMember><WalletPage/></RequireMember>}/>
    <Route path="/marketplace" element={<RequireMember><MarketplacePage/></RequireMember>}/>
    <Route path="/pods" element={<RequireMember><PodsPage/></RequireMember>}/>
    <Route path="/partners" element={<RequireMember><PartnerPortalPage/></RequireMember>}/>
    <Route path="/partners/join" element={<RequireMember><PartnerJoinPage/></RequireMember>}/>
    <Route path="/sponsor" element={<SponsorPage/>}/>
    <Route path="/admin" element={<RequireMember roles={["operator"]}><AdminPage/></RequireMember>}/>
    <Route path="/analytics" element={<RequireMember roles={["trainer", "operator"]}><AnalyticsPage/></RequireMember>}/>
    <Route path="/control" element={<RequireMember roles={["operator"]}><ControlPage/></RequireMember>}/>
    <Route path="/control/runtime" element={<RequireMember roles={["operator"]}><RuntimeStatusPage/></RequireMember>}/>
    <Route path="/nexus" element={<RequireMember><NexusPage/></RequireMember>}/>
    <Route path="/stage" element={<RequireMember roles={["operator"]}><AMXXRStagePage/></RequireMember>}/>
    <Route path="/qr-studio" element={<RequireMember roles={["trainer", "operator"]}><QRStudioPage/></RequireMember>}/>
    <Route path="/tenants" element={<RequireMember roles={["operator"]}><TenantConsolePage/></RequireMember>}/>
    <Route path="/settings/comfort" element={<RequireMember><ComfortSettingsPage/></RequireMember>}/>
    <Route path="/profiles/:userId" element={<RequireMember><HumanProfilePage/></RequireMember>}/>
    <Route path="/teams" element={<RequireMember><TeamsPage/></RequireMember>}/>
    <Route path="/teams/:teamId" element={<RequireMember><TeamProfilePage/></RequireMember>}/>
    <Route path="/teams/:teamId/runs" element={<RequireMember><TeamMonitorPage/></RequireMember>}/>
    <Route path="/teams/:teamId/rewards" element={<RequireMember><TeamProfilePage/></RequireMember>}/>
    <Route path="/rooms/:roomId/lobby" element={<RequireMember><RoomLobbyPage/></RequireMember>}/>
    <Route path="/rooms/:roomId/toolbelt" element={<RequireMember><ToolbeltPage/></RequireMember>}/>
    <Route path="/join/:token" element={<PodInvitePage/>}/>
    <Route path="/runs/team/:runId" element={<RequireMember><TeamMonitorPage/></RequireMember>}/>
    <Route path="/runs/:runId/replay" element={<RequireMember><ReplayPage/></RequireMember>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes></AppShell>;
}

export default function App() {
  return <Routes>
    <Route path="/missions/world" element={<RequireMember><Suspense fallback={<div className="scene-loading" aria-label="Loading Mission World"/>}><MissionWorldPage/></Suspense></RequireMember>}/>
    <Route path="/mission/:id/run" element={<RequireMember><MissionRunPage/></RequireMember>}/>
    <Route path="/play/2d/:missionId" element={<RequireMember><ModeExperiencePage mode="2d"/></RequireMember>}/>
    <Route path="/play/3d/:missionId" element={<RequireMember><ModeExperiencePage mode="3d"/></RequireMember>}/>
    <Route path="/play/ar/:missionId" element={<RequireMember><ModeExperiencePage mode="ar"/></RequireMember>}/>
    <Route path="/play/vr/:missionId" element={<RequireMember><ModeExperiencePage mode="vr"/></RequireMember>}/>
    <Route path="/play/mr/:missionId" element={<RequireMember><ModeExperiencePage mode="mr"/></RequireMember>}/>
    <Route path="/runs/2d/:runId" element={<RequireMember><ModeExperiencePage mode="2d"/></RequireMember>}/>
    <Route path="/worlds/:worldId" element={<RequireMember><ModeExperiencePage mode="3d"/></RequireMember>}/>
    <Route path="/ar/scan/:campaignId" element={<ModeExperiencePage mode="ar"/>}/>
    <Route path="/vr/pods/:podId" element={<RequireMember><ModeExperiencePage mode="vr"/></RequireMember>}/>
    <Route path="/mr/workspace/:workspaceId" element={<RequireMember><ModeExperiencePage mode="mr"/></RequireMember>}/>
    <Route path="/watch/:roomCode" element={<StageLiveViewerPage/>}/>
    <Route path="/partner/:organizationId/:campaignSlug" element={<PartnerCampaignResolverPage/>}/>
    <Route path="/scan/*" element={<ScanResolver/>}/>
    <Route path="/sponsor/*" element={<SponsorResolver/>}/>
    <Route path="*" element={<ShellRoutes/>}/>
  </Routes>;
}
