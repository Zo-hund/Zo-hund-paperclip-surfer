import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, UserX } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { AMX_ROLES, assignAmxRole, loadRoleAssignments, revokeAmxRole, type AmxRole, type AmxRoleAssignment } from "../amx-identity";

export function IdentityControlPage() {
  const [tenantId, setTenantId] = useState("tech-at-nite");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AmxRole>("MEMBER");
  const [reason, setReason] = useState("Approved AMX program role");
  const [assignments, setAssignments] = useState<AmxRoleAssignment[]>([]);
  const [message, setMessage] = useState("");
  const refresh = () => loadRoleAssignments(tenantId).then(setAssignments).catch((error) => setMessage(error.message));
  useEffect(() => { void refresh(); }, [tenantId]);
  const assign = async () => { try { await assignAmxRole(tenantId, userId.trim(), role, reason.trim()); setMessage(`${role} assigned.`); setUserId(""); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Role assignment failed"); } };
  const revoke = async (item: AmxRoleAssignment) => { try { await revokeAmxRole(item.id, "Operator revoked role access"); setMessage(`${item.role} revoked.`); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Role revocation failed"); } };
  return <div className="page section-wrap"><PageHeader eyebrow="IDENTITY / RBAC" title="Multi-role identity" description="Assign tenant-scoped business roles without changing the member, trainer, or operator security tier."/><section className="admin-panel"><div className="form-grid"><label>Tenant<input value={tenantId} onChange={(event) => setTenantId(event.target.value)}/></label><label>Member user ID<input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Supabase user UUID"/></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value as AmxRole)}>{AMX_ROLES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Approval reason<input value={reason} onChange={(event) => setReason(event.target.value)}/></label></div><button className="button primary" disabled={!userId.trim() || reason.trim().length < 3} onClick={assign}><UserPlus/>Assign role</button>{message && <p className="notice">{message}</p>}</section><section className="admin-panel"><h2><ShieldCheck/>Active role ledger</h2><div className="table-list">{assignments.map((item) => <article key={item.id}><div><b>{item.role}</b><small>{item.user_id}</small></div><StatusPill tone={item.status === "active" ? "green" : "red"}>{item.status}</StatusPill>{item.status === "active" && <button className="icon-button" title={`Revoke ${item.role}`} onClick={() => void revoke(item)}><UserX/></button>}</article>)}{!assignments.length && <p>No role assignments exist for this tenant.</p>}</div></section></div>;
}
