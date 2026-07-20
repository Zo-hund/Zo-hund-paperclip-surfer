import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { Link, Navigate, useLocation } from "react-router-dom";
import { LockKeyhole, ShieldAlert } from "lucide-react";

export type MembershipRole = "member" | "trainer" | "operator";
export type MembershipStatus = "active" | "pending" | "suspended";
export type ProfileVisibility = "public" | "private";

export interface MemberProfile {
  id: string;
  member_code: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  organization: string;
  membership_role: MembershipRole;
  membership_status: MembershipStatus;
  profile_visibility: ProfileVisibility;
  created_at: string;
  updated_at: string;
}

interface ProfileUpdate {
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  profile_visibility: ProfileVisibility;
}

interface MemberAuthState {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  profile: MemberProfile | null;
  recoveryMode: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (displayName: string, email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  sendMagicLink: (email: string, returnPath?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
  claimInvite: (token: string) => Promise<MemberProfile>;
  loadPublicProfile: (slug: string) => Promise<MemberProfile | null>;
  clearError: () => void;
}

const MemberAuthContext = createContext<MemberAuthState | null>(null);
let memberClientPromise: Promise<SupabaseClient | null> | null = null;

async function createMemberClient() {
  const viteUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  const viteKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (viteUrl && viteKey) return createClient(viteUrl, viteKey);

  const injected = window.__AMX_CONFIG__;
  if (injected?.supabaseUrl && injected.supabasePublishableKey) {
    return createClient(injected.supabaseUrl, injected.supabasePublishableKey);
  }

  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
    const config = await response.json() as { supabaseUrl?: string; supabasePublishableKey?: string };
    if (!config.supabaseUrl || !config.supabasePublishableKey) return null;
    return createClient(config.supabaseUrl, config.supabasePublishableKey);
  } catch {
    return null;
  }
}

function getMemberClient() {
  memberClientPromise ||= createMemberClient();
  return memberClientPromise;
}

export async function getMemberDataClient() {
  const client = await getMemberClient();
  if (!client) throw new Error("Member accounts are not configured for this environment.");
  return client;
}

function syncMemberCookie(session: Session | null) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  if (!session?.access_token) {
    document.cookie = `amx_member_session=; Path=/; Max-Age=0; SameSite=Strict${secure}`;
    return;
  }
  const maxAge = Math.max(0, Math.min(3600, (session.expires_at || 0) - Math.floor(Date.now() / 1000)));
  document.cookie = `amx_member_session=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure}`;
}

async function fetchMemberProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("member_profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as MemberProfile | null;
}

function memberAuthErrorMessage(error: { code?: string; message?: string }) {
  if (error.code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(error.message || "")) {
    return "Email limit reached. Wait before requesting another message, or change your password from a device where you are already signed in.";
  }
  return error.message || "The authentication request could not be completed.";
}

export function publicMemberPath(profile: MemberProfile) {
  return `/members/${encodeURIComponent(profile.handle || profile.member_code)}`;
}

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    void getMemberClient().then(async (client) => {
      if (!active) return;
      if (!client) {
        setConfigured(false);
        setLoading(false);
        return;
      }
      setConfigured(true);
      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      syncMemberCookie(data.session);
      if (data.session) {
        try { setProfile(await fetchMemberProfile(client, data.session.user.id)); }
        catch (profileError) { setError(profileError instanceof Error ? profileError.message : "Unable to load member profile"); }
      }
      setLoading(false);

      const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        syncMemberCookie(nextSession);
        if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
        if (!nextSession) {
          setProfile(null);
          setRecoveryMode(false);
          return;
        }
        window.setTimeout(() => {
          void fetchMemberProfile(client, nextSession.user.id)
            .then((nextProfile) => { if (active) setProfile(nextProfile); })
            .catch((profileError) => { if (active) setError(profileError instanceof Error ? profileError.message : "Unable to load member profile"); });
        }, 0);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    });

    return () => { active = false; unsubscribe(); };
  }, []);

  const requireClient = async () => {
    const client = await getMemberClient();
    if (!client) throw new Error("Member accounts are not configured for this environment.");
    return client;
  };

  const refreshProfile = async (client: SupabaseClient, userId: string) => {
    const next = await fetchMemberProfile(client, userId);
    setProfile(next);
    return next;
  };

  const value = useMemo<MemberAuthState>(() => ({
    loading,
    configured,
    session,
    profile,
    recoveryMode,
    error,
    clearError: () => setError(""),
    signIn: async (email, password) => {
      setError("");
      const client = await requireClient();
      const { data, error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) { setError(signInError.message); throw signInError; }
      setSession(data.session);
      if (data.session) await refreshProfile(client, data.session.user.id);
    },
    signUp: async (displayName, email, password) => {
      setError("");
      const client = await requireClient();
      const { data, error: signUpError } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/account`,
        },
      });
      if (signUpError) { setError(signUpError.message); throw signUpError; }
      setSession(data.session);
      if (data.session) await refreshProfile(client, data.session.user.id);
      return { confirmationRequired: !data.session };
    },
    sendMagicLink: async (email, returnPath = "/account") => {
      setError("");
      const client = await requireClient();
      const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/account";
      const { error: linkError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${safePath}` },
      });
      if (linkError) {
        const message = memberAuthErrorMessage(linkError);
        setError(message);
        throw new Error(message);
      }
    },
    requestPasswordReset: async (email) => {
      setError("");
      const client = await requireClient();
      const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/account?mode=recovery`,
      });
      if (resetError) {
        const message = memberAuthErrorMessage(resetError);
        setError(message);
        throw new Error(message);
      }
    },
    updatePassword: async (password) => {
      setError("");
      const client = await requireClient();
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); throw updateError; }
      setRecoveryMode(false);
    },
    signOut: async () => {
      const client = await requireClient();
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) { setError(signOutError.message); throw signOutError; }
      setSession(null);
      setProfile(null);
    },
    updateProfile: async (update) => {
      setError("");
      if (!session) throw new Error("Sign in before updating your profile.");
      const client = await requireClient();
      const payload = {
        ...update,
        display_name: update.display_name.trim(),
        handle: update.handle?.trim().toLowerCase() || null,
        avatar_url: update.avatar_url?.trim() || null,
      };
      const { error: updateError } = await client.from("member_profiles").update(payload).eq("id", session.user.id);
      if (updateError) { setError(updateError.message); throw updateError; }
      await refreshProfile(client, session.user.id);
    },
    claimInvite: async (token) => {
      setError("");
      if (!session) throw new Error("Sign in before claiming an invitation.");
      const client = await requireClient();
      const { data, error: claimError } = await client.rpc("claim_member_invite", { invite_token: token });
      if (claimError) { setError(claimError.message); throw claimError; }
      const next = (Array.isArray(data) ? data[0] : data) as MemberProfile;
      setProfile(next);
      return next;
    },
    loadPublicProfile: async (slug) => {
      const client = await requireClient();
      const decoded = decodeURIComponent(slug).trim();
      const query = client.from("member_profiles").select("*");
      const { data, error: profileError } = decoded.toUpperCase().startsWith("AMX-")
        ? await query.eq("member_code", decoded.toUpperCase()).maybeSingle()
        : await query.eq("handle", decoded.toLowerCase()).maybeSingle();
      if (profileError) throw profileError;
      return data as MemberProfile | null;
    },
  }), [configured, error, loading, profile, recoveryMode, session]);

  return <MemberAuthContext.Provider value={value}>{children}</MemberAuthContext.Provider>;
}

export function useMemberAuth() {
  const value = useContext(MemberAuthContext);
  if (!value) throw new Error("useMemberAuth must be used inside MemberAuthProvider");
  return value;
}

export function RequireMember({ children, roles }: { children: ReactNode; roles?: MembershipRole[] }) {
  const auth = useMemberAuth();
  const location = useLocation();
  if (auth.loading) return <AccessState title="Checking membership" body="Loading your secure AMX session."/>;
  if (!auth.configured) return <AccessState title="Membership service unavailable" body="This environment is missing its Supabase member configuration."/>;
  if (!auth.session) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/account?next=${encodeURIComponent(next)}`} replace/>;
  }
  if (!auth.profile || auth.profile.membership_status !== "active") {
    return <AccessState title="Membership review required" body="Your account exists, but private workspaces are not active for this membership."/>;
  }
  if (roles && !roles.includes(auth.profile.membership_role)) {
    return <AccessState title="Operator access required" body="This enterprise console is limited to approved AMX trainers and operators." action={<Link className="button secondary" to="/account">View account</Link>}/>;
  }
  return children;
}

function AccessState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="access-state"><div><ShieldAlert/><span className="eyebrow">PRIVATE MEMBER ACCESS</span><h1>{title}</h1><p>{body}</p>{action || <Link className="button primary" to="/account"><LockKeyhole/>Member account</Link>}</div></div>;
}
