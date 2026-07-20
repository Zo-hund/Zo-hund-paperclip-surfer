import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Check, Eye, EyeOff, ImagePlus, KeyRound, LockKeyhole, LogIn,
  LogOut, Mail, Save, ShieldCheck, Trash2, UserRound, UserRoundPlus,
} from "lucide-react";
import { MembershipCard3D } from "../MembershipCard3D";
import { PageHeader, StatusPill } from "../components";
import { uploadIdentityImage } from "../identity-media";
import { publicMemberPath, useMemberAuth, type MemberProfile, type ProfileVisibility } from "../member-auth";

type AccountMode = "signin" | "create" | "recover";

export function AccountPage() {
  const auth = useMemberAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AccountMode>(() => searchParams.get("mode") === "recovery" ? "recover" : "signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [claimStatus, setClaimStatus] = useState("");
  const attemptedInvite = useRef("");
  const queryInvite = searchParams.get("invite")?.trim() || "";
  const storedInvite = localStorage.getItem("amx_member_invite") || "";
  const invite = queryInvite || storedInvite;

  useEffect(() => {
    if (queryInvite) localStorage.setItem("amx_member_invite", queryInvite);
  }, [queryInvite]);

  useEffect(() => {
    if (!auth.session || !auth.profile || !invite || attemptedInvite.current === invite) return;
    attemptedInvite.current = invite;
    setClaimStatus("Applying membership invitation...");
    void auth.claimInvite(invite).then((profile) => {
      localStorage.removeItem("amx_member_invite");
      setClaimStatus(`${profile.membership_role === "operator" ? "Operator" : "Member"} access activated.`);
      navigate("/account", { replace: true });
    }).catch((error) => {
      localStorage.removeItem("amx_member_invite");
      setClaimStatus(error instanceof Error ? error.message : "Invitation could not be applied.");
      navigate("/account", { replace: true });
    });
  }, [auth.profile?.id, auth.session?.user.id, invite, navigate]);

  useEffect(() => {
    const next = searchParams.get("next");
    if (auth.session && auth.profile && !invite && next?.startsWith("/") && !next.startsWith("//")) navigate(next, { replace: true });
  }, [auth.profile, auth.session, invite, navigate, searchParams]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    auth.clearError();
    try {
      if (mode === "signin") {
        await auth.signIn(email, password);
        setNotice("Signed in. Your private workspace is ready.");
      } else if (mode === "create") {
        const result = await auth.signUp(displayName, email, password);
        setNotice(result.confirmationRequired ? "Check your email to confirm the account, then return here." : "Member account created.");
      } else if (auth.recoveryMode) {
        await auth.updatePassword(password);
        setNotice("Password updated. You can continue to your workspace.");
        setMode("signin");
      } else {
        await auth.requestPasswordReset(email);
        setNotice("Password recovery email sent.");
      }
    } catch {
      // The provider exposes the safe Auth error below the form.
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!email.trim()) { setNotice("Enter your email address first."); return; }
    setBusy(true);
    setNotice("");
    try {
      const returnPath = invite ? `/account?invite=${encodeURIComponent(invite)}` : "/account";
      await auth.sendMagicLink(email, returnPath);
      setNotice("Secure sign-in link sent. Open it on this device.");
    } catch {
      // The provider exposes the safe Auth error below the form.
    } finally {
      setBusy(false);
    }
  };

  if (auth.loading) return <div className="account-loading"><span className="live-dot"/>Checking AMX membership...</div>;
  if (auth.session && auth.profile) return <MemberAccount profile={auth.profile} claimStatus={claimStatus}/>;

  const recoveringPassword = mode === "recover" && auth.recoveryMode;
  return <div className="account-entry">
    <section className="account-brand-panel">
      <img src="/brand/amx-air-hubs-brand.png" alt="AMX AIR HUBS"/>
      <div>
        <span className="eyebrow">AMX MEMBER ACCESS</span>
        <h1>Public discovery. Private creation.</h1>
        <p>Watch public stages as a guest, or sign in to enter Skill Pods, XR worlds, proof, agents, and production workspaces.</p>
      </div>
      <div className="access-split">
        <span><Eye/><b>Public</b><small>Live viewer, public profiles, scans, invitations</small></span>
        <span><LockKeyhole/><b>Private</b><small>Member missions, Pods, Nexus, Stage, operator controls</small></span>
      </div>
    </section>
    <section className="account-form-panel">
      <div className="account-form-head">
        <Link to="/" className="account-home"><ArrowRight/>Continue as guest</Link>
        {invite && <StatusPill tone="gold">INVITATION READY</StatusPill>}
        <span className="eyebrow">SECURE ACCOUNT</span>
        <h2>{recoveringPassword ? "Set a new password" : mode === "create" ? "Create membership" : mode === "recover" ? "Recover account" : "Welcome back"}</h2>
        <p>{invite ? "Sign in or create an account to apply your private invitation." : "Your identity and member role are protected by Supabase Auth."}</p>
      </div>
      {!recoveringPassword && <div className="account-mode-tabs" role="tablist" aria-label="Account mode">
        <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setNotice(""); }}><LogIn/>Sign in</button>
        <button className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setNotice(""); }}><UserRoundPlus/>Join</button>
      </div>}
      <form className="account-form" onSubmit={submit}>
        {mode === "create" && <label><span>Display name</span><div><UserRound/><input required minLength={2} maxLength={80} autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name"/></div></label>}
        {!recoveringPassword && <label><span>Email</span><div><Mail/><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com"/></div></label>}
        {(mode !== "recover" || recoveringPassword) && <label><span>{recoveringPassword ? "New password" : "Password"}</span><div><KeyRound/><input required type="password" minLength={8} autoComplete={mode === "create" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 characters minimum"/></div></label>}
        <button className="button primary full large" disabled={busy || !auth.configured}>{busy ? "Working..." : recoveringPassword ? "Update password" : mode === "create" ? "Create member account" : mode === "recover" ? "Send recovery email" : "Sign in"}</button>
      </form>
      {mode === "signin" && <div className="account-alternatives">
        <button className="button secondary full" disabled={busy || !auth.configured} onClick={sendLink}><Mail/>Email me a sign-in link</button>
        <button className="text-button" onClick={() => { setMode("recover"); setNotice(""); }}>Forgot password?</button>
      </div>}
      {mode === "recover" && !recoveringPassword && <button className="text-button" onClick={() => setMode("signin")}>Back to sign in</button>}
      {!auth.configured && <p className="account-message error">Member accounts are not configured in this local environment.</p>}
      {auth.error && <p className="account-message error">{auth.error}</p>}
      {notice && <p className="account-message success"><Check/>{notice}</p>}
    </section>
  </div>;
}

function MemberAccount({ profile, claimStatus }: { profile: MemberProfile; claimStatus: string }) {
  const auth = useMemberAuth();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [handle, setHandle] = useState(profile.handle || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile.profile_visibility);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState("");
  const profilePath = publicMemberPath(profile);
  const canShare = profile.profile_visibility === "public";

  useEffect(() => {
    setDisplayName(profile.display_name);
    setHandle(profile.handle || "");
    setAvatarUrl(profile.avatar_url || "");
    setVisibility(profile.profile_visibility);
  }, [profile]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await auth.updateProfile({ display_name: displayName, handle: handle || null, avatar_url: avatarUrl || null, profile_visibility: visibility });
      setNotice("Member profile updated.");
    } catch {
      // The provider exposes the safe Auth error in this view.
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setNotice("");
    auth.clearError();
    try {
      const image = await uploadIdentityImage(file, `member-${profile.id}`, "profile-avatar");
      setAvatarUrl(image.url);
      await auth.updateProfile({ display_name: displayName, handle: handle || null, avatar_url: image.url, profile_visibility: visibility });
      setNotice("Profile photo uploaded and saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Profile photo upload failed.");
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setNotice("");
    auth.clearError();
    try {
      setAvatarUrl("");
      await auth.updateProfile({ display_name: displayName, handle: handle || null, avatar_url: null, profile_visibility: visibility });
      setNotice("Profile photo removed.");
    } catch {
      setAvatarUrl(profile.avatar_url || "");
    } finally {
      setPhotoBusy(false);
    }
  };

  const share = async () => {
    if (!canShare) { setNotice("Set the profile to public before sharing it."); return; }
    const url = `${window.location.origin}${profilePath}`;
    if (navigator.share) await navigator.share({ title: `${profile.display_name} / AMX member`, url });
    else await navigator.clipboard.writeText(url);
    setNotice("Public profile link ready.");
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    auth.clearError();
    setNotice("");
    if (newPassword !== confirmPassword) {
      setNotice("The new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await auth.updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password updated. Your member account remains signed in on this device.");
    } catch {
      // The provider exposes the safe Auth error in this view.
    } finally {
      setPasswordBusy(false);
    }
  };

  return <div className="page section-wrap member-account-page">
    <PageHeader eyebrow="MEMBER ACCOUNT" title={profile.display_name} description="Manage your AMX identity, public credential, and private workspace access." actions={<button className="button secondary" onClick={() => void auth.signOut()}><LogOut/>Sign out</button>}/>
    {(claimStatus || auth.error || notice) && <div className={`member-notice ${auth.error ? "error" : ""}`}>{auth.error || claimStatus || notice}</div>}
    <div className="member-account-summary">
      <div><span className="eyebrow">MEMBER ID</span><strong>{profile.member_code}</strong><small>{auth.session?.user.email}</small></div>
      <div><span className="eyebrow">ACCESS</span><StatusPill tone={profile.membership_role === "operator" ? "gold" : "green"}>{profile.membership_role}</StatusPill><small>{profile.membership_status}</small></div>
      <div><span className="eyebrow">PROFILE</span><StatusPill tone={profile.profile_visibility === "public" ? "cyan" : "neutral"}>{profile.profile_visibility}</StatusPill><small>{profile.profile_visibility === "public" ? "Shareable credential" : "Only you can view"}</small></div>
    </div>
    <MembershipCard3D memberName={profile.display_name} memberId={profile.member_code} organization={profile.organization} organizationType="Member network" color="#55e6ff" level={profile.membership_role.toUpperCase()} xp={0} badges={1} proofScope="amx-member" profilePath={profilePath} avatarUrl={profile.avatar_url} onShare={share}/>
    <div className="member-account-grid">
      <form className="member-profile-form" onSubmit={save}>
        <div className="section-heading"><div><span className="eyebrow">PROFILE SETTINGS</span><h2>Member identity</h2></div></div>
        <div className="member-photo-editor">
          <div className="member-photo-preview">{avatarUrl ? <img src={avatarUrl} alt="Profile preview"/> : <UserRound/>}</div>
          <div><b>Profile photo</b><small>PNG, JPEG, or WebP. Up to 5 MB.</small><span className="member-photo-actions"><label className={`button secondary ${photoBusy ? "disabled" : ""}`}><ImagePlus/>{photoBusy ? "Uploading..." : avatarUrl ? "Replace photo" : "Upload photo"}<input disabled={photoBusy} type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadPhoto}/></label>{avatarUrl && <button type="button" className="icon-button" title="Remove profile photo" aria-label="Remove profile photo" disabled={photoBusy} onClick={() => void removePhoto()}><Trash2/></button>}</span></div>
        </div>
        <label><span>Display name</span><input required minLength={2} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)}/></label>
        <label><span>Public handle</span><input pattern="[a-z0-9][a-z0-9_-]{2,29}" maxLength={30} value={handle} onChange={(event) => setHandle(event.target.value.toLowerCase())} placeholder="amx-member"/></label>
        <label><span>External image URL (optional)</span><input type="url" maxLength={500} value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..."/></label>
        <button className="button primary" disabled={busy}><Save/>{busy ? "Saving..." : "Save profile"}</button>
      </form>
      <section className="member-privacy-panel">
        <span className="eyebrow">PUBLIC / PRIVATE</span><h2>Profile visibility</h2>
        <p>Your account and private workspaces are never public. This setting controls only the shareable membership credential.</p>
        <div className="visibility-control">
          <button className={visibility === "public" ? "active" : ""} onClick={() => setVisibility("public")}><Eye/><span><b>Public credential</b><small>Anyone with the link can verify your member card.</small></span></button>
          <button className={visibility === "private" ? "active" : ""} onClick={() => setVisibility("private")}><EyeOff/><span><b>Private profile</b><small>Only your signed-in account can view the record.</small></span></button>
        </div>
        <button className="button secondary full" onClick={share} disabled={!canShare}><BadgeCheck/>Share public profile</button>
        {profile.membership_role === "operator" && <Link className="button ghost full" to="/control"><ShieldCheck/>Open operator control</Link>}
      </section>
    </div>
    <form className="member-security-panel" onSubmit={changePassword}>
      <div><span className="eyebrow">ACCOUNT SECURITY</span><h2>Change password</h2><p>Use an active signed-in session when email recovery is unavailable or rate limited.</p></div>
      <label><span>New password</span><input required type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="8 characters minimum"/></label>
      <label><span>Confirm password</span><input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat new password"/></label>
      <button className="button secondary" disabled={passwordBusy}><KeyRound/>{passwordBusy ? "Updating..." : "Update password"}</button>
    </form>
  </div>;
}

export function PublicMemberProfilePage() {
  const { slug = "" } = useParams();
  const auth = useMemberAuth();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const path = useMemo(() => profile ? publicMemberPath(profile) : "/", [profile]);

  useEffect(() => {
    setLoading(true);
    void auth.loadPublicProfile(slug).then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false));
  }, [auth, slug]);

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    if (navigator.share) await navigator.share({ title: `${profile?.display_name || "AMX"} / AMX member`, url });
    else await navigator.clipboard.writeText(url);
  };

  if (loading) return <div className="account-loading"><span className="live-dot"/>Loading verified member...</div>;
  if (!profile) return <div className="public-member-missing"><LockKeyhole/><span className="eyebrow">MEMBER PROFILE</span><h1>Private or unavailable</h1><p>This member has not published a public credential.</p><Link className="button primary" to="/">AMX AIR HUBS</Link></div>;
  return <div className="page section-wrap public-member-page">
    <PageHeader eyebrow="VERIFIED AMX MEMBER" title={profile.display_name} description={`${profile.organization} / ${profile.membership_role} / active membership`}/>
    <MembershipCard3D memberName={profile.display_name} memberId={profile.member_code} organization={profile.organization} organizationType="Member network" color="#55e6ff" level={profile.membership_role.toUpperCase()} xp={0} badges={1} proofScope="amx-member" profilePath={path} avatarUrl={profile.avatar_url} onShare={share}/>
    <div className="public-member-proof"><ShieldCheck/><div><span className="eyebrow">MEMBERSHIP STATUS</span><h2>Active and shareable</h2><p>This public credential is backed by the member's authenticated AMX account. Private workspace data is not exposed.</p></div><StatusPill tone="green">VERIFIED</StatusPill></div>
  </div>;
}
