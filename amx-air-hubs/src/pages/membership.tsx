import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crown, ExternalLink, ShieldCheck, Sparkles, Users } from "lucide-react";
import { PageHeader, StatusPill } from "../components";
import { useMemberAuth } from "../member-auth";
import { createMembershipCheckout, createMembershipPortal, loadMemberSubscription, loadMembershipCatalog, type MemberSubscription, type MembershipCatalog, type MembershipPlan } from "../membership-platform";
import { getActiveTenant } from "../operations";

const money = (amountCents: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountCents / 100);

function PlanPrice({ plan }: { plan: MembershipPlan }) {
  if (plan.id === "explorer") return <div className="membership-price"><strong>Free</strong><span>community membership</span></div>;
  if (plan.amountCents === null) return <div className="membership-price pending"><strong>Pending</strong><span>Stripe price setup</span></div>;
  return <div className="membership-price"><strong>{money(plan.amountCents, plan.currency)}</strong><span>/{plan.intervalCount && plan.intervalCount > 1 ? `${plan.intervalCount} ` : ""}{plan.interval}</span></div>;
}

export function MembershipPage() {
  const auth = useMemberAuth();
  const tenantId = getActiveTenant();
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<MembershipCatalog | null>(null);
  const [subscription, setSubscription] = useState<MemberSubscription | null>(null);
  const [busyPlan, setBusyPlan] = useState("");
  const [notice, setNotice] = useState(() => searchParams.get("checkout") === "success" ? "Payment received. Your membership is being activated." : searchParams.get("checkout") === "cancelled" ? "Checkout was cancelled. Your current membership is unchanged." : "");

  useEffect(() => { void loadMembershipCatalog().then(setCatalog).catch((error) => setNotice(error instanceof Error ? error.message : "Membership plans could not be loaded.")); }, []);
  useEffect(() => {
    if (!auth.session) { setSubscription(null); return; }
    void loadMemberSubscription(tenantId).then(setSubscription).catch((error) => setNotice(error instanceof Error ? error.message : "Membership status could not be loaded."));
  }, [auth.session?.user.id, tenantId]);

  const activePlan = useMemo(() => catalog?.plans.find((plan) => plan.id === (subscription?.planId || "explorer")), [catalog, subscription]);
  const subscribe = async (plan: MembershipPlan) => {
    setBusyPlan(plan.id); setNotice("");
    try {
      const result = await createMembershipCheckout(tenantId, plan.id);
      window.location.assign(result.checkoutUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Membership checkout could not start."); }
    finally { setBusyPlan(""); }
  };
  const manage = async () => {
    setBusyPlan("portal"); setNotice("");
    try { window.location.assign((await createMembershipPortal(tenantId)).portalUrl); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Membership management could not open."); }
    finally { setBusyPlan(""); }
  };

  return <div className="page membership-page section-wrap">
    <PageHeader eyebrow="TECH AT NITE / AMX MEMBERSHIP" title="Learn. Build. Ambassador. Earn. Lead." description="One verified identity connects learning, XR missions, community work, marketplace opportunities, events, proof, and collective commerce." actions={auth.session ? <Link className="button secondary" to="/account"><ShieldCheck/>Member account</Link> : <Link className="button primary" to="/account?mode=create&next=%2Fmembership">Join AMX<ArrowRight/></Link>}/>
    <section className="membership-status-band">
      <div><span className="membership-status-icon"><Crown/></span><span><small>CURRENT MEMBERSHIP</small><strong>{auth.session ? activePlan?.name || "Explorer" : "Guest"}</strong></span></div>
      <div><StatusPill tone={subscription?.status === "past_due" ? "gold" : auth.session ? "green" : "neutral"}>{auth.session ? subscription?.status || "active" : "SIGN IN REQUIRED"}</StatusPill>{subscription?.currentPeriodEnd && <small>{subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</small>}</div>
      {subscription?.managed && <button className="button secondary" disabled={busyPlan === "portal"} onClick={() => void manage()}><ExternalLink/>{busyPlan === "portal" ? "Opening..." : "Manage billing"}</button>}
    </section>
    {notice && <p className="membership-notice" role="status"><Sparkles/>{notice}</p>}
    <section className="membership-principles"><div><Users/><span><b>One identity</b><small>Carry your plan, progress, credentials, and community record across tenants.</small></span></div><div><ShieldCheck/><span><b>Role-safe access</b><small>Purchasing a plan never grants trainer or operator privileges.</small></span></div><div><Sparkles/><span><b>Agent guidance</b><small>JAZ, TAZ, RAZ, NAZ, GAZ, and OPS support the benefits available to your tier.</small></span></div></section>
    <section className="membership-catalog" aria-label="Membership plans">
      {catalog?.plans.map((plan) => {
        const current = auth.session && plan.id === (subscription?.planId || "explorer");
        return <article className={`membership-plan plan-${plan.id} ${current ? "current" : ""}`} key={plan.id}>
          <header><div><span className="eyebrow">{plan.cadence === "free" ? "COMMUNITY ACCESS" : `${plan.cadence.toUpperCase()} MEMBERSHIP`}</span><h2>{plan.name}</h2></div>{current && <StatusPill tone="green">CURRENT</StatusPill>}</header>
          <PlanPrice plan={plan}/>
          <ul>{plan.benefits.map((benefit) => <li key={benefit}><Check/>{benefit}</li>)}</ul>
          {current ? <button className="button secondary full" disabled><Check/>Active plan</button> : !auth.session ? <Link className="button secondary full" to={`/account?mode=create&next=${encodeURIComponent("/membership")}`}>{plan.id === "explorer" ? "Join free" : "Sign in to choose"}<ArrowRight/></Link> : plan.id === "explorer" ? <span className="membership-included"><Check/>Included with every account</span> : <button className="button primary full" disabled={!plan.configured || Boolean(busyPlan)} onClick={() => void subscribe(plan)}>{busyPlan === plan.id ? "Opening checkout..." : plan.configured ? `Choose ${plan.name}` : "Price setup pending"}</button>}
        </article>;
      })}
    </section>
  </div>;
}
