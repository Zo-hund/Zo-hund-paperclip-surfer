import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components";
import { CompletePage, HomePage, AgentsPage, MissionRunPage, MissionsPage, PreRunPage, RoleSelectPage } from "./pages/core";
import { AdminPage, AnalyticsPage, ControlPage, MarketplacePage, PodsPage, ScanResolver, SponsorPage, SponsorResolver, WalletPage } from "./pages/secondary";
import { QRStudioPage, RoleDashboardPage, TenantConsolePage } from "./pages/operations";

function ShellRoutes() {
  return <AppShell><Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/role" element={<RoleSelectPage/>}/>
    <Route path="/dashboard" element={<RoleDashboardPage/>}/>
    <Route path="/missions" element={<MissionsPage/>}/>
    <Route path="/agents" element={<AgentsPage/>}/>
    <Route path="/mission/:id/pre" element={<PreRunPage/>}/>
    <Route path="/mission/:id/complete" element={<CompletePage/>}/>
    <Route path="/wallet" element={<WalletPage/>}/>
    <Route path="/marketplace" element={<MarketplacePage/>}/>
    <Route path="/pods" element={<PodsPage/>}/>
    <Route path="/sponsor" element={<SponsorPage/>}/>
    <Route path="/admin" element={<AdminPage/>}/>
    <Route path="/analytics" element={<AnalyticsPage/>}/>
    <Route path="/control" element={<ControlPage/>}/>
    <Route path="/qr-studio" element={<QRStudioPage/>}/>
    <Route path="/tenants" element={<TenantConsolePage/>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes></AppShell>;
}

export default function App() {
  return <Routes>
    <Route path="/mission/:id/run" element={<MissionRunPage/>}/>
    <Route path="/scan/*" element={<ScanResolver/>}/>
    <Route path="/sponsor/*" element={<SponsorResolver/>}/>
    <Route path="*" element={<ShellRoutes/>}/>
  </Routes>;
}
