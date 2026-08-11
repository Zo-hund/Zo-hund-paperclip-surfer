import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components";
import { CompletePage, HomePage, AgentsPage, MissionRunPage, MissionsPage, PreRunPage, RoleSelectPage } from "./pages/core";
import { AdminPage, AnalyticsPage, ControlPage, MarketplacePage, PodsPage, ScanResolver, SponsorPage, SponsorResolver, WalletPage } from "./pages/secondary";
import { PublicBoardPage, QRStudioPage, RoleDashboardPage } from "./pages/operations";
import { TenantConsolePage } from "./TenantConsole";
import { NexusPage } from "./pages/nexus";
import { AMXXRStagePage } from "./pages/stage";
import { StageLiveViewerPage } from "./pages/stage-viewer";
import { AgentWorkbenchPage } from "./pages/agent-workbench";
import { RuntimeStatusPage } from "./pages/runtime-status";
import { AirConnectPage } from "./pages/air-connect";
import { ConnectionsPage } from "./pages/connections";
import { PodInvitePage } from "./pages/invites";
import { AccountPage, PublicMemberProfilePage } from "./pages/account";
import { MerchOrdersPage, MerchStorefrontPage } from "./pages/merch";
import { MembershipPage } from "./pages/membership";
import { SkillMarketPage } from "./pages/skill-market";
import { X402EconomyPage } from "./pages/x402-economy";
import { LearnModePage, LearningControlPage } from "./pages/learn";
import { IdentityControlPage } from "./pages/identity-control";
import { PathfinderFacilitatorPage, PathfinderTrainingMissionPage } from "./pages/pathfinder-training";
import { PartnerCampaignResolverPage, PartnerJoinPage, PartnerPortalPage } from "./pages/partners";
import { H3ATPartnerPage } from "./pages/h3at-partner";
import { TenantLaunchKitPage } from "./pages/tenant-launch-kit";
import { ConnectionScannerPage } from "./pages/connect-scanner";
import { RequireMember } from "./member-auth";
import {
  AgentProfilePage, ComfortSettingsPage, ExperienceLauncherPage, HumanProfilePage,
  ModeExperiencePage, ReplayPage, RoomLobbyPage, TeamMonitorPage, TeamProfilePage,
  TeamsPage, ToolbeltPage,
} from "./pages/immersive";

const MissionWorldPage = lazy(async () => ({ default: (await import("./MissionWorld")).MissionWorldPage }));
const StageVenuePage = lazy(async () => ({ default: (await import("./pages/stage-venue")).StageVenuePage }));
const PathfinderPassportPage = lazy(async () => ({ default: (await import("./PathfinderPassport")).PathfinderPassportPage }));
const PathfinderCredentialPage = lazy(async () => ({ default: (await import("./PathfinderPassport")).PathfinderCredentialPage }));
const TrustControlPage = lazy(async () => ({ default: (await import("./pages/trust-control")).TrustControlPage }));

const deferred = (element: ReactNode) => <Suspense fallback={<div className="scene-loading" aria-label="Loading Pathfinder profile"/>}>{element}</Suspense>;

function ShellRoutes() {
  return <AppShell><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/account" element={<AccountPage/>}/>
    <Route path="/membership" element={<MembershipPage/>}/>
    <Route path="/connect" element={<ConnectionScannerPage/>}/>
    <Route path="/board" element={<PublicBoardPage/>}/>
    <Route path="/members/:slug" element={<PublicMemberProfilePage/>}/>
    <Route path="/role" element={<RequireMember><RoleSelectPage/></RequireMember>}/>
    <Route path="/dashboard" element={<RequireMember><RoleDashboardPage/></RequireMember>}/>
    <Route path="/missions" element={<RequireMember><MissionsPage/></RequireMember>}/>
    <Route path="/learn" element={<RequireMember><LearnModePage/></RequireMember>}/>
    <Route path="/missions/pathfinder-educator" element={<RequireMember><PathfinderTrainingMissionPage/></RequireMember>}/>
    <Route path="/agents" element={<RequireMember><AgentsPage/></RequireMember>}/>
    <Route path="/agents/:agentId/profile" element={<RequireMember><AgentProfilePage/></RequireMember>}/>
    <Route path="/agents/:agentId/workspace" element={<RequireMember><AgentWorkbenchPage/></RequireMember>}/>
    <Route path="/play/:missionId" element={<RequireMember><ExperienceLauncherPage/></RequireMember>}/>
    <Route path="/mission/:id/pre" element={<RequireMember><PreRunPage/></RequireMember>}/>
    <Route path="/mission/:id/complete" element={<RequireMember><CompletePage/></RequireMember>}/>
    <Route path="/wallet" element={<RequireMember><WalletPage/></RequireMember>}/>
    <Route path="/profile" element={<RequireMember>{deferred(<PathfinderPassportPage/>)}</RequireMember>}/>
    <Route path="/profile/collectibles" element={<RequireMember>{deferred(<PathfinderPassportPage view="collectibles"/>)}</RequireMember>}/>
    <Route path="/profile/evidence" element={<RequireMember>{deferred(<PathfinderPassportPage view="evidence"/>)}</RequireMember>}/>
    <Route path="/profile/credentials" element={<RequireMember>{deferred(<PathfinderPassportPage view="credentials"/>)}</RequireMember>}/>
    <Route path="/profile/deployments" element={<RequireMember>{deferred(<PathfinderPassportPage view="deployments"/>)}</RequireMember>}/>
    <Route path="/profile/toolbelt" element={<RequireMember>{deferred(<PathfinderPassportPage/>)}</RequireMember>}/>
    <Route path="/marketplace" element={<RequireMember><MarketplacePage/></RequireMember>}/>
    <Route path="/marketplace/earn" element={<RequireMember><SkillMarketPage/></RequireMember>}/>
    <Route path="/marketplace/merch" element={<MerchStorefrontPage/>}/>
    <Route path="/events/:eventId/merch" element={<MerchStorefrontPage/>}/>
    <Route path="/account/orders" element={<RequireMember><MerchOrdersPage/></RequireMember>}/>
    <Route path="/pods" element={<RequireMember><PodsPage/></RequireMember>}/>
    <Route path="/partners" element={<RequireMember><PartnerPortalPage/></RequireMember>}/>
    <Route path="/partners/h3at" element={<RequireMember><H3ATPartnerPage/></RequireMember>}/>
    <Route path="/partners/join" element={<RequireMember><PartnerJoinPage/></RequireMember>}/>
    <Route path="/sponsor" element={<SponsorPage/>}/>
    <Route path="/admin" element={<RequireMember roles={["operator"]}><AdminPage/></RequireMember>}/>
    <Route path="/analytics" element={<RequireMember roles={["trainer", "operator"]}><AnalyticsPage/></RequireMember>}/>
    <Route path="/control" element={<RequireMember roles={["operator"]}><ControlPage/></RequireMember>}/>
    <Route path="/control/runtime" element={<RequireMember roles={["operator"]}><RuntimeStatusPage/></RequireMember>}/>
    <Route path="/control/air-connect" element={<RequireMember roles={["operator"]}><AirConnectPage/></RequireMember>}/>
    <Route path="/control/economy" element={<RequireMember roles={["operator"]}><X402EconomyPage/></RequireMember>}/>
    <Route path="/control/learning" element={<RequireMember roles={["trainer", "operator"]}><LearningControlPage/></RequireMember>}/>
    <Route path="/control/identity" element={<RequireMember roles={["operator"]}><IdentityControlPage/></RequireMember>}/>
    <Route path="/control/trust" element={<RequireMember roles={["operator"]}>{deferred(<TrustControlPage/>)}</RequireMember>}/>
    <Route path="/training/pathfinder/facilitator" element={<RequireMember roles={["trainer", "operator"]}><PathfinderFacilitatorPage/></RequireMember>}/>
    <Route path="/connections" element={<RequireMember roles={["operator"]}><ConnectionsPage/></RequireMember>}/>
    <Route path="/nexus" element={<RequireMember><NexusPage/></RequireMember>}/>
    <Route path="/stage" element={<RequireMember roles={["operator"]}><AMXXRStagePage/></RequireMember>}/>
    <Route path="/qr-studio" element={<RequireMember roles={["trainer", "operator"]}><QRStudioPage/></RequireMember>}/>
    <Route path="/tenants" element={<RequireMember roles={["operator"]}><TenantConsolePage/></RequireMember>}/>
    <Route path="/tenants/:tenantId/guide" element={<RequireMember><TenantLaunchKitPage/></RequireMember>}/>
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
    <Route path="/venues/:venueId" element={<RequireMember><Suspense fallback={<div className="scene-loading" aria-label="Loading multiplayer venue"/>}><StageVenuePage/></Suspense></RequireMember>}/>
    <Route path="/proof/:credentialId" element={deferred(<PathfinderCredentialPage/>)}/>
    <Route path="/partner/:organizationId/:campaignSlug" element={<PartnerCampaignResolverPage/>}/>
    <Route path="/scan/*" element={<ScanResolver/>}/>
    <Route path="/sponsor/*" element={<SponsorResolver/>}/>
    <Route path="*" element={<ShellRoutes/>}/>
  </Routes>;
}
