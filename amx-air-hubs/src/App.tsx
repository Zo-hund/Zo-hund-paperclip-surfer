import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components";
import { CompletePage, HomePage, AgentsPage, MissionRunPage, MissionsPage, PreRunPage, RoleSelectPage } from "./pages/core";
import { AdminPage, AnalyticsPage, ControlPage, MarketplacePage, PodsPage, ScanResolver, SponsorPage, SponsorResolver, WalletPage } from "./pages/secondary";
import { QRStudioPage, RoleDashboardPage, TenantConsolePage } from "./pages/operations";
import { NexusPage } from "./pages/nexus";
import { AgentWorkbenchPage } from "./pages/agent-workbench";
import {
  AgentProfilePage, ComfortSettingsPage, ExperienceLauncherPage, HumanProfilePage,
  ModeExperiencePage, ReplayPage, RoomLobbyPage, TeamMonitorPage, TeamProfilePage,
  TeamsPage, ToolbeltPage,
} from "./pages/immersive";

function ShellRoutes() {
  return <AppShell><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/role" element={<RoleSelectPage/>}/>
    <Route path="/dashboard" element={<RoleDashboardPage/>}/>
    <Route path="/missions" element={<MissionsPage/>}/>
    <Route path="/agents" element={<AgentsPage/>}/>
    <Route path="/agents/:agentId/profile" element={<AgentProfilePage/>}/>
    <Route path="/agents/:agentId/workspace" element={<AgentWorkbenchPage/>}/>
    <Route path="/play/:missionId" element={<ExperienceLauncherPage/>}/>
    <Route path="/mission/:id/pre" element={<PreRunPage/>}/>
    <Route path="/mission/:id/complete" element={<CompletePage/>}/>
    <Route path="/wallet" element={<WalletPage/>}/>
    <Route path="/marketplace" element={<MarketplacePage/>}/>
    <Route path="/pods" element={<PodsPage/>}/>
    <Route path="/sponsor" element={<SponsorPage/>}/>
    <Route path="/admin" element={<AdminPage/>}/>
    <Route path="/analytics" element={<AnalyticsPage/>}/>
    <Route path="/control" element={<ControlPage/>}/>
    <Route path="/nexus" element={<NexusPage/>}/>
    <Route path="/qr-studio" element={<QRStudioPage/>}/>
    <Route path="/tenants" element={<TenantConsolePage/>}/>
    <Route path="/settings/comfort" element={<ComfortSettingsPage/>}/>
    <Route path="/profiles/:userId" element={<HumanProfilePage/>}/>
    <Route path="/teams" element={<TeamsPage/>}/>
    <Route path="/teams/:teamId" element={<TeamProfilePage/>}/>
    <Route path="/teams/:teamId/runs" element={<TeamMonitorPage/>}/>
    <Route path="/teams/:teamId/rewards" element={<TeamProfilePage/>}/>
    <Route path="/rooms/:roomId/lobby" element={<RoomLobbyPage/>}/>
    <Route path="/rooms/:roomId/toolbelt" element={<ToolbeltPage/>}/>
    <Route path="/runs/team/:runId" element={<TeamMonitorPage/>}/>
    <Route path="/runs/:runId/replay" element={<ReplayPage/>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes></AppShell>;
}

export default function App() {
  return <Routes>
    <Route path="/mission/:id/run" element={<MissionRunPage/>}/>
    <Route path="/play/2d/:missionId" element={<ModeExperiencePage mode="2d"/>}/>
    <Route path="/play/3d/:missionId" element={<ModeExperiencePage mode="3d"/>}/>
    <Route path="/play/ar/:missionId" element={<ModeExperiencePage mode="ar"/>}/>
    <Route path="/play/vr/:missionId" element={<ModeExperiencePage mode="vr"/>}/>
    <Route path="/play/mr/:missionId" element={<ModeExperiencePage mode="mr"/>}/>
    <Route path="/runs/2d/:runId" element={<ModeExperiencePage mode="2d"/>}/>
    <Route path="/worlds/:worldId" element={<ModeExperiencePage mode="3d"/>}/>
    <Route path="/ar/scan/:campaignId" element={<ModeExperiencePage mode="ar"/>}/>
    <Route path="/vr/pods/:podId" element={<ModeExperiencePage mode="vr"/>}/>
    <Route path="/mr/workspace/:workspaceId" element={<ModeExperiencePage mode="mr"/>}/>
    <Route path="/scan/*" element={<ScanResolver/>}/>
    <Route path="/sponsor/*" element={<SponsorResolver/>}/>
    <Route path="*" element={<ShellRoutes/>}/>
  </Routes>;
}
