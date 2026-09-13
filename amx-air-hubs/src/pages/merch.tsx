import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, Crown, ExternalLink, Minus, PackageCheck, Plus, ShieldCheck, ShoppingBag, Sparkles, Truck } from "lucide-react";
import { EmptyState, PageHeader, StatusPill } from "../components";
import { getActiveTenant } from "../operations";
import { getTenantRecord } from "../tenant-management";
import { createMerchCheckout, loadMerchCatalog, loadMerchOrders, previewMerchProducts, type MerchCatalog, type MerchOrder, type MerchProduct } from "../merch-platform";
import { loadMemberSubscription, type MemberSubscription } from "../membership-platform";
import { useMemberAuth } from "../member-auth";

interface CartLine { product: MerchProduct; variantId: string; quantity: number }
const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export function MerchStorefrontPage() {
  const { eventId } = useParams();
  const tenantId = getActiveTenant();
  const tenant = getTenantRecord(tenantId);
  const auth = useMemberAuth();
  const [catalog, setCatalog] = useState<MerchCatalog>({ configured: false, checkoutConfigured: false, source: "preview", products: previewMerchProducts });
  const [cart, setCart] = useState<CartLine[]>(() => { try { return JSON.parse(localStorage.getItem("amx_merch_cart") || "[]") as CartLine[]; } catch { return []; } });
  const [category, setCategory] = useState("all");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [membership, setMembership] = useState<MemberSubscription | null>(null);
  useEffect(() => { void loadMerchCatalog(tenantId, eventId).then(setCatalog); }, [tenantId, eventId]);
  useEffect(() => { if (auth.session) void loadMemberSubscription(tenantId).then(setMembership).catch(() => setMembership(null)); else setMembership(null); }, [auth.session?.user.id, tenantId]);
  useEffect(() => { localStorage.setItem("amx_merch_cart", JSON.stringify(cart)); }, [cart]);
  const products = catalog.products.filter((product) => category === "all" || product.category === category);
  const subtotal = cart.reduce((sum, line) => sum + (line.product.variants.find((variant) => variant.id === line.variantId)?.priceCents || 0) * line.quantity, 0);
  const add = (product: MerchProduct, variantId: string) => setCart((current) => {
    const found = current.find((line) => line.product.id === product.id && line.variantId === variantId);
    return found ? current.map((line) => line === found ? { ...line, quantity: Math.min(10, line.quantity + 1) } : line) : [...current, { product, variantId, quantity: 1 }];
  });
  const quantity = (index: number, delta: number) => setCart((current) => current.flatMap((line, lineIndex) => lineIndex === index ? (line.quantity + delta > 0 ? [{ ...line, quantity: Math.min(10, line.quantity + delta) }] : []) : [line]));
  const checkout = async () => {
    if (!cart.length) return;
    setBusy(true); setNotice("");
    try {
      const result = await createMerchCheckout({ tenantId, eventId, items: cart.map((line) => ({ productId: line.product.id, variantId: line.variantId, quantity: line.quantity })) });
      window.location.assign(result.checkoutUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Checkout could not start."); }
    finally { setBusy(false); }
  };
  return <div className="page merch-page section-wrap">
    <PageHeader eyebrow={eventId ? "EVENT MERCH DROP" : `${tenant.name.toUpperCase()} / COLLECTIVE STORE`} title={eventId ? `${eventId.replaceAll("-", " ")} collection` : "Wear the work. Fund the runway."} description="Made-to-order AMX gear supports featured creators, event partners, and community learning programs." actions={<><Link to="/membership" className="button ghost"><Crown/>{auth.session ? `${membership?.planId || "explorer"} member` : "Membership"}</Link><Link to="/account/orders" className="button secondary"><PackageCheck/>My orders</Link></>}/>
    <section className="merch-hero"><img src="/merch/amx-merch-collection.png" alt="AMX AIR Hubs apparel and creator accessories"/><div><StatusPill tone={catalog.configured ? "green" : "gold"}>{catalog.configured ? "PRINTFUL CONNECTED" : "CATALOG PREVIEW"}</StatusPill><span className="eyebrow">CREATE. CURATE. CONNECT.</span><h2>AMX AIR Creator Collection</h2><p>Limited event apparel and production gear fulfilled on demand. Each item shows the collective share returned to its featured partner.</p><a href="#merch-products" className="button primary">Shop the drop<ArrowRight/></a></div></section>
    {catalog.message && <p className="merch-notice"><ShieldCheck/>{catalog.message}</p>}
    <div className="merch-layout" id="merch-products"><section><div className="filter-row">{["all", "apparel", "accessories", "event"].map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="merch-grid">{products.map((product) => <MerchProductCard key={product.id} product={product} onAdd={add}/>)}</div></section>
      <aside className="merch-cart"><header><div><span className="eyebrow">YOUR BAG</span><h2>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</h2></div><ShoppingBag/></header>{cart.length ? <>{cart.map((line, index) => { const variant = line.product.variants.find((item) => item.id === line.variantId)!; return <div className="merch-cart-line" key={`${line.product.id}-${line.variantId}`}><img src={line.product.imageUrl} alt=""/><span><b>{line.product.name}</b><small>{variant.name}</small><strong>{money(variant.priceCents * line.quantity, variant.currency)}</strong></span><div><button onClick={() => quantity(index, -1)} aria-label="Remove one"><Minus/></button><b>{line.quantity}</b><button onClick={() => quantity(index, 1)} aria-label="Add one"><Plus/></button></div></div>; })}<div className="merch-total"><span>Subtotal</span><b>{money(subtotal)}</b><small>Shipping and tax calculated by the connected checkout provider.</small></div><button className="button primary full" disabled={busy || !catalog.checkoutConfigured} onClick={() => void checkout()}><ShoppingBag/>{busy ? "Opening checkout" : catalog.checkoutConfigured ? "Secure checkout" : "Checkout connection required"}</button>{notice && <p className="merch-error" role="alert">{notice}</p>}</> : <EmptyState icon={ShoppingBag} title="Your bag is ready" body="Choose a product and variant to begin."/>}</aside>
    </div>
    <section className="merch-trust"><div><Truck/><b>Print-on-demand</b><span>Production and shipping begin after payment confirmation.</span></div><div><Sparkles/><b>Event drops</b><span>Products can be attached to a Stage cue or event link.</span></div><div><ShieldCheck/><b>Collective ledger</b><span>Partner shares are recorded per order and tenant.</span></div></section>
  </div>;
}

function MerchProductCard({ product, onAdd }: { product: MerchProduct; onAdd: (product: MerchProduct, variantId: string) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id || "");
  const variant = useMemo(() => product.variants.find((item) => item.id === variantId) || product.variants[0], [product, variantId]);
  return <article className="merch-product"><div className={`merch-product-image product-${product.id}`}><img src={product.imageUrl} alt={product.name} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/merch/amx-merch-collection.png"; }}/><span>{product.collectiveSharePercent}% TO {product.partnerName.toUpperCase()}</span></div><div><span className="eyebrow">{product.category}</span><h3>{product.name}</h3><p>{product.description}</p><label>Variant<select value={variantId} onChange={(event) => setVariantId(event.target.value)}>{product.variants.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><footer><b>{money(variant?.priceCents || 0, variant?.currency)}</b><button className="button primary" disabled={!variant?.available} onClick={() => onAdd(product, variantId)}><Plus/>Add</button></footer></div></article>;
}

export function MerchOrdersPage() {
  const tenantId = getActiveTenant();
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { void loadMerchOrders(tenantId).then(setOrders).catch((reason) => setError(reason instanceof Error ? reason.message : "Orders could not be loaded.")).finally(() => setLoading(false)); }, [tenantId]);
  return <div className="page section-wrap merch-orders"><PageHeader eyebrow="MEMBER COMMERCE" title="Orders and tracking" description="Follow event merchandise from payment through Printful production and delivery." actions={<Link to="/marketplace/merch" className="button primary"><ShoppingBag/>Shop merch</Link>}/>{loading ? <p>Loading orders...</p> : error ? <EmptyState icon={ShieldCheck} title="Orders unavailable" body={error}/> : orders.length ? <div className="merch-order-list">{orders.map((order) => <article key={order.id}><PackageCheck/><div><span className="eyebrow">{order.status}</span><h3>{order.items.map((item) => `${item.quantity}x ${item.name}`).join(" / ")}</h3><p>{new Date(order.createdAt).toLocaleString()} / {money(order.totalCents, order.currency)}</p></div>{order.trackingUrl ? <a className="button secondary" href={order.trackingUrl} target="_blank" rel="noreferrer">Track<ExternalLink/></a> : <StatusPill tone="neutral">Processing</StatusPill>}</article>)}</div> : <EmptyState icon={PackageCheck} title="No merch orders yet" body="Your paid event and platform merchandise will appear here." action={<Link className="button primary" to="/marketplace/merch">Browse merch</Link>}/>}</div>;
}
