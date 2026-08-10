const rateBuckets = new Map();
const ephemeralRooms = new Map();
const memberSessionCache = new Map();
let databaseInitialization;
const printfulCatalogCache = new Map();
const membershipCatalogCache = new Map();
const PRINTFUL_API_BASE = "https://api.printful.com";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2025-02-24.acacia";

async function stripeRequest(env, path, params, idempotencyKey) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, "Stripe Checkout is not configured");
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(env.STRIPE_SECRET_KEY)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: params.toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    logEvent("warn", "stripe.request_failed", { path, status: response.status, type: safeId(payload?.error?.type) });
    throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? "Stripe request limit reached" : "Secure checkout could not be created");
  }
  return payload;
}

async function stripeGet(env, path, params = new URLSearchParams()) {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, "Stripe is not configured");
  const target = new URL(`${STRIPE_API_BASE}${path}`);
  for (const [key, value] of params) target.searchParams.append(key, value);
  const response = await fetch(target, {
    headers: { Authorization: `Bearer ${String(env.STRIPE_SECRET_KEY)}`, "Stripe-Version": STRIPE_API_VERSION, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    logEvent("warn", "stripe.request_failed", { path, status: response.status, type: safeId(payload?.error?.type) });
    throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? "Stripe request limit reached" : "Stripe account request failed");
  }
  return payload;
}

const MEMBERSHIP_PLANS = [
  { id: "explorer", name: "Explorer", cadence: "free", priceEnv: "", benefits: ["Community access", "AI newsletter", "Events", "Discord", "XR community"] },
  { id: "learner", name: "Learner", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_LEARNER", benefits: ["AI Labs", "XR workshops", "Community challenges", "Certificates", "Portfolio"] },
  { id: "builder", name: "Builder", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_BUILDER", benefits: ["Projects", "Hackathons", "Innovation Labs", "Portfolio reviews", "Mentorship"] },
  { id: "ambassador", name: "Ambassador", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_AMBASSADOR", benefits: ["Leadership", "Recruitment", "Community outreach", "Workshop support", "Recognition program"] },
  { id: "earner", name: "Earner", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_EARNER", benefits: ["Paid projects", "Marketplace access", "Client opportunities", "Revenue sharing", "Internships"] },
  { id: "parent", name: "Parent", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_PARENT", benefits: ["Family dashboard", "Progress reports", "Notifications", "Parent workshops", "Community resources"] },
  { id: "community", name: "Community", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_COMMUNITY", benefits: ["Innovation challenges", "Volunteer network", "Events", "Neighborhood programs", "Digital credentials"] },
  { id: "volunteer", name: "Volunteer", cadence: "month", priceEnv: "MEMBERSHIP_PRICE_VOLUNTEER", benefits: ["Training", "Scheduling", "Service hours", "Certificates", "Recognition"] },
  { id: "sponsor", name: "Sponsor", cadence: "year", priceEnv: "MEMBERSHIP_PRICE_SPONSOR", benefits: ["Brand placement", "Impact reports", "Scholarships", "Talent pipeline", "Executive dashboard"] },
  { id: "donor", name: "Donor", cadence: "year", priceEnv: "MEMBERSHIP_PRICE_DONOR", benefits: ["Community investment", "Scholarship fund", "Equipment fund", "Innovation fund", "Recognition wall"] },
];

function membershipPlan(id) {
  return MEMBERSHIP_PLANS.find((plan) => plan.id === safeId(id));
}

async function loadMembershipCatalog(env) {
  const key = MEMBERSHIP_PLANS.map((plan) => `${plan.id}:${plan.priceEnv ? String(env[plan.priceEnv] || "") : "free"}`).join("|");
  const cached = membershipCatalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.plans;
  const plans = await Promise.all(MEMBERSHIP_PLANS.map(async (plan) => {
    if (plan.id === "explorer") return { ...plan, configured: true, amountCents: 0, currency: "USD", interval: null };
    const priceId = safeId(env[plan.priceEnv]).slice(0, 120);
    if (!priceId) return { ...plan, configured: false, amountCents: null, currency: "USD", interval: plan.cadence };
    try {
      const price = await stripeGet(env, `/prices/${encodeURIComponent(priceId)}`);
      const recurring = isPlainObject(price.recurring) ? price.recurring : {};
      return { ...plan, configured: Boolean(price.active && recurring.interval), amountCents: Number.isSafeInteger(price.unit_amount) ? price.unit_amount : null, currency: safeId(price.currency, "usd").toUpperCase(), interval: safeId(recurring.interval, plan.cadence), intervalCount: Math.max(1, Number(recurring.interval_count || 1)) };
    } catch {
      return { ...plan, configured: false, amountCents: null, currency: "USD", interval: plan.cadence };
    }
  }));
  const publicPlans = plans.map(({ priceEnv, ...plan }) => plan);
  membershipCatalogCache.set(key, { plans: publicPlans, expiresAt: Date.now() + 5 * 60 * 1000 });
  return publicPlans;
}

function stripeAccountState(account) {
  const requirementsDue = Array.isArray(account?.requirements?.currently_due) ? account.requirements.currently_due.map((item) => safeLabel(item).slice(0, 120)).slice(0, 30) : [];
  const detailsSubmitted = Boolean(account?.details_submitted);
  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const onboardingStatus = payoutsEnabled && detailsSubmitted ? "active" : account?.requirements?.disabled_reason ? "disabled" : detailsSubmitted ? "restricted" : "pending";
  return { detailsSubmitted, chargesEnabled, payoutsEnabled, requirementsDue, onboardingStatus };
}

function secureHexEqual(left, right) {
  if (!left || left.length !== right.length || !/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const parts = String(signatureHeader).split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || !signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => secureHexEqual(signature, expected));
}

function printfulHeaders(env) {
  const headers = { Authorization: `Bearer ${String(env.PRINTFUL_API_TOKEN || "")}`, Accept: "application/json" };
  if (env.PRINTFUL_STORE_ID) headers["X-PF-Store-Id"] = String(env.PRINTFUL_STORE_ID);
  return headers;
}

async function printfulRequest(env, path, init = {}) {
  if (!env.PRINTFUL_API_TOKEN) throw new HttpError(503, "Printful fulfillment is not configured");
  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, { ...init, headers: { ...printfulHeaders(env), ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    logEvent("warn", "printful.request_failed", { path, status: response.status });
    throw new HttpError(response.status === 429 ? 429 : 502, response.status === 429 ? "Printful request limit reached" : "Printful service request failed");
  }
  return payload?.result ?? payload;
}

function normalizePrintfulProduct(item) {
  const variants = Array.isArray(item?.sync_variants) ? item.sync_variants : [];
  const thumbnail = safeLabel(item?.sync_product?.thumbnail_url || item?.thumbnail_url, "/merch/amx-merch-collection.png");
  return {
    id: String(item?.sync_product?.id || item?.id || "").slice(0, 80),
    name: safeLabel(item?.sync_product?.name || item?.name, "AMX Creator Product").slice(0, 120),
    description: "Made-to-order AMX creator merchandise fulfilled by Printful.",
    category: "apparel",
    imageUrl: /^https:\/\//i.test(thumbnail) ? thumbnail : "/merch/amx-merch-collection.png",
    partnerName: "Community Runway",
    collectiveSharePercent: 15,
    variants: variants.map((variant) => ({
      id: String(variant.id || "").slice(0, 80),
      name: safeLabel(variant.name, "Standard").slice(0, 120),
      priceCents: Math.max(0, Math.round(Number(variant.retail_price || 0) * 100)),
      currency: safeId(variant.currency, "USD").toUpperCase().slice(0, 3),
      available: Boolean(variant.id),
    })).filter((variant) => variant.id),
  };
}

async function loadPrintfulCatalog(env) {
  const cacheKey = String(env.PRINTFUL_STORE_ID || "default");
  const cached = printfulCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.products;
  const listed = await printfulRequest(env, "/store/products?status=synced&limit=24");
  const summaries = Array.isArray(listed) ? listed.slice(0, 12) : [];
  const details = await Promise.all(summaries.map((item) => printfulRequest(env, `/store/products/${encodeURIComponent(item.id)}`)));
  const products = details.map(normalizePrintfulProduct).filter((product) => product.id && product.variants.length);
  printfulCatalogCache.set(cacheKey, { products, expiresAt: Date.now() + 5 * 60 * 1000 });
  return products;
}

function normalizeMerchItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new HttpError(400, "One to twenty merchandise items are required");
  return value.map((item) => {
    const productId = safeId(item?.productId).slice(0, 80);
    const variantId = safeId(item?.variantId).slice(0, 80);
    const quantity = Math.max(1, Math.min(10, Math.floor(Number(item?.quantity || 1))));
    if (!productId || !variantId) throw new HttpError(400, "Every merchandise item requires a product and variant");
    return { productId, variantId, quantity };
  });
}

async function fulfillPaidMerchOrder(env, input) {
  if (!env.PRINTFUL_API_TOKEN || !env.DB) throw new HttpError(503, "Merchandise fulfillment is not fully configured");
  const orderId = safeId(input.orderId).slice(0, 80);
  const paymentReference = safeLabel(input.paymentReference).slice(0, 160);
  if (!orderId || !paymentReference) throw new HttpError(400, "orderId and paymentReference are required");
  await initialize(env.DB);
  const row = await env.DB.prepare("SELECT id, tenant_id, status, currency, total_cents, printful_order_id, payload FROM merch_orders WHERE id = ? LIMIT 1").bind(orderId).first();
  if (!row) throw new HttpError(404, "Merchandise order was not found");
  if (row.printful_order_id) return { orderId, printfulOrderId: row.printful_order_id, status: row.status, idempotent: true };
  if (row.status !== "pending_payment") throw new HttpError(409, "Merchandise order cannot be fulfilled from its current state");
  const amountCents = Math.round(Number(input.amountCents));
  const currency = safeId(input.currency, "USD").toUpperCase();
  if (amountCents !== Number(row.total_cents) || currency !== row.currency) throw new HttpError(409, "Confirmed payment does not match the merchandise order");
  const sourceRecipient = isPlainObject(input.recipient) ? input.recipient : {};
  const recipient = {
    name: safeLabel(sourceRecipient.name).slice(0, 120),
    address1: safeLabel(sourceRecipient.address1).slice(0, 180),
    address2: safeLabel(sourceRecipient.address2).slice(0, 180),
    city: safeLabel(sourceRecipient.city).slice(0, 100),
    state_code: safeLabel(sourceRecipient.stateCode).slice(0, 32),
    country_code: safeId(sourceRecipient.countryCode).toUpperCase().slice(0, 2),
    zip: safeLabel(sourceRecipient.zip).slice(0, 24),
    phone: safeLabel(sourceRecipient.phone).slice(0, 32),
    email: safeLabel(sourceRecipient.email).slice(0, 160),
  };
  if (!recipient.name || !recipient.address1 || !recipient.city || !recipient.country_code || !recipient.zip) throw new HttpError(400, "A complete shipping recipient is required");
  let payload = {}; try { payload = JSON.parse(row.payload || "{}"); } catch {}
  const items = Array.isArray(payload.items) ? payload.items.map((item) => ({
    sync_variant_id: Number(item.variantId),
    quantity: Math.max(1, Math.min(10, Math.floor(Number(item.quantity || 1)))),
    retail_price: (Number(item.unitPriceCents || 0) / 100).toFixed(2),
  })).filter((item) => Number.isSafeInteger(item.sync_variant_id) && item.sync_variant_id > 0) : [];
  if (!items.length) throw new HttpError(409, "The merchandise order has no fulfillable Printful variants");
  const printfulOrder = await printfulRequest(env, "/orders?confirm=true", { method: "POST", body: JSON.stringify({ external_id: orderId, recipient, items }) });
  const printfulOrderId = String(printfulOrder?.id || "").slice(0, 80);
  if (!printfulOrderId) throw new HttpError(502, "Printful did not return an order id");
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE merch_orders SET status = 'submitted', printful_order_id = ?, payload = ?, updated_at = ? WHERE id = ? AND status = 'pending_payment'")
    .bind(printfulOrderId, JSON.stringify({ ...payload, paymentReference }), now, orderId).run();
  await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'accrued' WHERE order_id = ? AND status = 'pending_payment'").bind(orderId).run();
  logEvent("info", "merch.order_submitted", { requestId: input.requestId, orderId, tenantId: row.tenant_id, printfulOrderId });
  return { orderId, printfulOrderId, status: "submitted", idempotent: false };
}

function publicMembershipSubscription(row) {
  if (!row) return { planId: "explorer", status: "active", currentPeriodEnd: null, cancelAtPeriodEnd: false, managed: false };
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    status: row.status,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    managed: Boolean(row.stripe_subscription_id),
  };
}

async function persistMembershipSubscription(env, input) {
  if (!env.DB) throw new HttpError(503, "Membership persistence is not configured");
  await initialize(env.DB);
  const subscriptionId = safeId(input.subscriptionId).slice(0, 120);
  const checkoutSessionId = safeId(input.checkoutSessionId).slice(0, 120);
  const id = subscriptionId || checkoutSessionId;
  const memberId = safeId(input.memberId).slice(0, 120);
  const tenantId = safeId(input.tenantId, "tech-at-nite").slice(0, 80);
  const plan = membershipPlan(input.planId);
  if (!id || !memberId || !plan || plan.id === "explorer") throw new HttpError(400, "Membership subscription metadata is incomplete");
  const status = ["trialing", "active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"].includes(safeId(input.status)) ? safeId(input.status) : "incomplete";
  const customerId = safeId(input.customerId).slice(0, 120);
  const currentPeriodEnd = Number(input.currentPeriodEnd) > 0 ? new Date(Number(input.currentPeriodEnd) * 1000).toISOString() : null;
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO membership_subscriptions (id, tenant_id, member_id, plan_id, status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, current_period_end, cancel_at_period_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET tenant_id = excluded.tenant_id, member_id = excluded.member_id, plan_id = excluded.plan_id, status = excluded.status, stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, stripe_checkout_session_id = COALESCE(excluded.stripe_checkout_session_id, membership_subscriptions.stripe_checkout_session_id), current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at")
    .bind(id, tenantId, memberId, plan.id, status, customerId || null, subscriptionId || null, checkoutSessionId || null, currentPeriodEnd, input.cancelAtPeriodEnd ? 1 : 0, now, now).run();
  return { id, tenantId, memberId, planId: plan.id, status };
}
const APP_HTML = "__AMX_APP_HTML__";
const CAPABILITY_POLICY = "camera=(self), microphone=(self), geolocation=(self), display-capture=(self), fullscreen=(self), xr-spatial-tracking=(self)";
const SERVICE_VERSION = "1.1.0";
const DEFAULT_DEPLOYMENT_REVISION = "local";
const MAX_AGENT_BODY_BYTES = 7 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_GATEWAY_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUIRED_SERVICE_NAMES = new Set(["database", "media", "realtime", "rooms", "agent", "mcp", "plugins", "livekit", "runway", "proof-signing", "telemetry", "observability"]);
const PRODUCTION_REQUIRED_SERVICES = [...REQUIRED_SERVICE_NAMES];
const DATA_CENTER_ADAPTERS = new Set(["redfish", "snmp", "modbus", "dcim"]);
const MEDIA_TYPES = new Set([
  "application/json", "application/octet-stream", "application/pdf", "model/gltf+json", "model/gltf-binary",
  "text/css", "text/javascript", "text/markdown", "text/plain", "text/typescript",
]);
const AGENT_TOOLS = [
  { name: "system.health", description: "Inspect AMX runtime health", source: "runtime", available: true },
  { name: "mission.context", description: "Read the active mission context", source: "skill", available: true },
  { name: "proof.latest", description: "Read the latest proof record", source: "runtime", available: true },
  { name: "spatial.capabilities", description: "Inspect browser XR and GPU support", source: "runtime", available: true },
  { name: "dcim.inspect", description: "Inspect the active tenant pod telemetry", source: "skill", available: true },
  { name: "rack.thermal-map", description: "Diagnose rack inlet temperature and airflow risk", source: "skill", available: true },
  { name: "tenant.capacity-plan", description: "Calculate tenant power and compute headroom", source: "skill", available: true },
  { name: "incident.runbook", description: "Build a guarded response plan for the active scenario", source: "skill", available: true },
  { name: "workshop.brief", description: "Generate a facilitator brief from the twin state", source: "skill", available: true },
];
const RUNWAY_API_BASE = "https://api.dev.runwayml.com";
const RUNWAY_API_VERSION = "2024-11-06";
const RUNWAY_PRESETS = [
  { id: "human-resource", name: "Human Resource", type: "preset", status: "READY" },
  { id: "tennis-coach", name: "Tennis Coach", type: "preset", status: "READY" },
  { id: "cooking-teacher", name: "Cooking Teacher", type: "preset", status: "READY" },
  { id: "fashion-designer", name: "Fashion Designer", type: "preset", status: "READY" },
  { id: "game-character", name: "Game Character", type: "preset", status: "READY" },
  { id: "game-character-man", name: "Game Character Man", type: "preset", status: "READY" },
  { id: "music-superstar", name: "Music Superstar", type: "preset", status: "READY" },
  { id: "influencer", name: "Influencer", type: "preset", status: "READY" },
  { id: "cat-character", name: "Cat Character", type: "preset", status: "READY" },
];
const RUNWAY_PRESET_IDS = new Set(RUNWAY_PRESETS.map((avatar) => avatar.id));
const RUNWAY_CLIENT_TOOLS = [
  { type: "client_event", name: "set_world_camera", description: "Switch the Nexus 3D world camera when the user asks to inspect a room viewpoint.", parameters: [{ name: "camera", type: "string", description: "Camera viewpoint", enum: ["overview", "entry", "rack", "briefing"] }] },
  { type: "client_event", name: "move_room_avatar", description: "Move the embodied GLB room avatar to a named Nexus waypoint when the user asks it to go somewhere.", parameters: [{ name: "destination", type: "string", description: "Room waypoint", enum: ["entry", "stage", "media", "rack", "briefing"] }] },
  { type: "client_event", name: "perform_room_action", description: "Trigger a visible action on the embodied GLB room avatar when the user asks it to wave, talk, or inspect.", parameters: [{ name: "action", type: "string", description: "Visible avatar action", enum: ["wave", "talk", "inspect"] }] },
  { type: "client_event", name: "open_nexus_panel", description: "Open a Nexus console panel when it is useful to show NPC controls, the LiveKit pod, media, vision, or the Runway avatar.", parameters: [{ name: "panel", type: "string", description: "Nexus console panel", enum: ["npc", "pod", "media", "vision", "runway"] }] },
  { type: "client_event", name: "invoke_amx_tool", description: "Run a governed AMX read-only skill when the user asks for mission context, pod inspection, a thermal map, or an incident plan.", parameters: [{ name: "tool", type: "string", description: "Governed AMX skill name", enum: ["mission.context", "dcim.inspect", "rack.thermal-map", "incident.runbook"] }] },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function capabilityHeaders(headers = {}) {
  return {
    ...headers,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": CAPABILITY_POLICY,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function htmlHeaders(nonce) {
  return capabilityHeaders({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://maps.googleapis.com https://maps.gstatic.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss: http://127.0.0.1:59650 http://localhost:59650 ws://127.0.0.1:59650 ws://localhost:59650",
      "frame-src https://*.readyplayer.me",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  });
}

function json(data, status = 200, requestId = crypto.randomUUID(), headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: capabilityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store", "X-Request-ID": requestId, ...headers }),
  });
}

function logEvent(level, event, fields = {}) {
  const output = JSON.stringify({ timestamp: new Date().toISOString(), level, event, service: "amx-air-hubs", version: SERVICE_VERSION, ...fields });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJson(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) throw new HttpError(415, "Content-Type must be application/json");
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "Request body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError(413, "Request body is too large");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new HttpError(400, "Request body must contain valid JSON"); }
  if (!isPlainObject(parsed)) throw new HttpError(400, "Request body must be a JSON object");
  return parsed;
}

function safeId(value, fallback = "") {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
}

function safeLabel(value, fallback = "") {
  return String(value || fallback).replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 180);
}

async function notifyOps(env, event, fields = {}) {
  if (!serviceUrlConfigured(env.OPS_ALERT_WEBHOOK_URL, ["https:"])) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetch(env.OPS_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(env.OPS_ALERT_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.OPS_ALERT_WEBHOOK_TOKEN}` } : {}) },
      body: JSON.stringify({ service: "amx-air-hubs", version: SERVICE_VERSION, event, timestamp: new Date().toISOString(), ...fields }),
      signal: controller.signal,
    });
  } catch (error) {
    logEvent("warn", "ops.alert_failed", { event, error: error instanceof Error ? error.message : "Alert delivery failed" });
  } finally {
    clearTimeout(timeout);
  }
}

function assetCacheControl(pathname) {
  return /^\/assets\/.+-[a-zA-Z0-9_-]{6,}\.(?:css|js|mjs|wasm|woff2?|png|jpe?g|webp|avif|svg)$/i.test(pathname)
    ? "public, max-age=31536000, immutable"
    : null;
}

function safeHexColor(value, fallback = "#55e6ff") {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function memberSessionToken(request) {
  const cookies = String(request.headers.get("Cookie") || "").split(";");
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name === "amx_member_session") {
      try { return decodeURIComponent(parts.join("=")); }
      catch { return ""; }
    }
  }
  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return bearer.split(".").length === 3 ? bearer : "";
}

function memberAuthRequired(env) {
  const setting = String(env.MEMBER_AUTH_REQUIRED || "").trim().toLowerCase();
  if (setting === "false") return false;
  return setting === "true" || Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

function publicApiRequest(request, url) {
  if (request.method === "GET" && ["/api/health", "/api/ready", "/api/config", "/api/agents/capabilities"].includes(url.pathname)) return true;
  if (request.method === "GET" && url.pathname.startsWith("/api/media/")) return true;
  if (request.method === "GET" && url.pathname === "/api/merch/catalog") return true;
  if (request.method === "GET" && url.pathname === "/api/membership/catalog") return true;
  if (request.method === "POST" && ["/api/livekit/viewer-token", "/api/analytics/events"].includes(url.pathname)) return true;
  if (request.method === "POST" && url.pathname === "/api/merch/payment-confirmed") return true;
  if (request.method === "POST" && url.pathname === "/api/merch/printful-webhook") return true;
  if (request.method === "POST" && url.pathname === "/api/merch/stripe-webhook") return true;
  if (request.method === "POST" && url.pathname === "/api/membership/stripe-webhook") return true;
  if (request.method === "POST" && url.pathname === "/api/telemetry/data-center") return true;
  if (request.method === "GET" && url.pathname === "/api/board/public/feed") return true;
  if (url.pathname.startsWith("/api/board/agent/")) return true;
  if (url.pathname.startsWith("/api/air-connect/edge/")) return true;
  if (url.pathname.startsWith("/api/pod-invites/")) {
    const segments = url.pathname.split("/").filter(Boolean);
    const action = segments[3] || "";
    return request.method === "GET" && !action;
  }
  return false;
}

function requiredMemberRoles(url) {
  if (url.pathname.startsWith("/api/air-connect")) return ["operator"];
  if (url.pathname.startsWith("/api/h3at/control-plane")) return ["operator"];
  if (url.pathname.startsWith("/api/stage/workflows/") || url.pathname.startsWith("/api/livekit/egress/dj/") || url.pathname === "/api/livekit/monitor-token") return ["operator"];
  if (url.pathname.startsWith("/api/decart/")) return ["operator"];
  if (url.pathname.startsWith("/api/merch/admin/")) return ["operator"];
  if (url.pathname.startsWith("/api/membership/admin/")) return ["operator"];
  return ["member", "trainer", "operator"];
}

async function verifyMemberRequest(request, env, roles) {
  if (!memberAuthRequired(env)) return null;
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!supabaseUrl || !publishableKey) throw new HttpError(503, "Member authentication is not configured");
  const token = memberSessionToken(request);
  if (!token) throw new HttpError(401, "Member sign-in required");

  const cacheKey = await sha256(token);
  const cached = memberSessionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!roles.includes(cached.profile.membership_role)) throw new HttpError(403, "This member role cannot access the requested operation");
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const headers = { Authorization: `Bearer ${token}`, apikey: publishableKey, Accept: "application/json" };
  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers, signal: controller.signal });
    if (!userResponse.ok) throw new HttpError(401, "Member session is invalid or expired");
    const user = await userResponse.json();
    if (!user?.id) throw new HttpError(401, "Member session did not resolve a user");

    const profileUrl = new URL(`${supabaseUrl}/rest/v1/member_profiles`);
    profileUrl.searchParams.set("select", "id,member_code,membership_role,membership_status");
    profileUrl.searchParams.set("id", `eq.${user.id}`);
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await fetch(profileUrl, { headers, signal: controller.signal });
    if (!profileResponse.ok) throw new HttpError(403, "Member profile authorization failed");
    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile || profile.membership_status !== "active") throw new HttpError(403, "An active member profile is required");
    if (!roles.includes(profile.membership_role)) throw new HttpError(403, "This member role cannot access the requested operation");

    const verified = { user: { id: user.id, email: user.email || "" }, profile, accessToken: token, expiresAt: Date.now() + 30_000 };
    if (memberSessionCache.size > 500) memberSessionCache.clear();
    memberSessionCache.set(cacheKey, verified);
    return verified;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.name === "AbortError") throw new HttpError(503, "Member authentication timed out");
    throw new HttpError(503, "Member authentication is unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function tenantAuthorizationRequired(env) {
  const setting = String(env.TENANT_AUTHORIZATION_REQUIRED || "").trim().toLowerCase();
  return setting === "true" || String(env.DEPLOYMENT_TIER || "").trim().toLowerCase() === "production";
}

async function verifyTenantAccess(member, env, tenantId) {
  if (!tenantAuthorizationRequired(env) || !member || member.profile.membership_role === "operator") return;
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const url = new URL(`${supabaseUrl}/rest/v1/partner_memberships`);
  url.searchParams.set("select", "organization_id");
  url.searchParams.set("organization_id", `eq.${tenantId}`);
  url.searchParams.set("user_id", `eq.${member.user.id}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${member.accessToken}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" } });
  if (!response.ok) throw new HttpError(503, "Tenant authorization is unavailable");
  const memberships = await response.json();
  if (!Array.isArray(memberships) || !memberships.length) throw new HttpError(403, "This member does not belong to the requested organization");
}

function podInviteStatus(row, now = Date.now()) {
  if (row.status === "revoked") return "revoked";
  if (Date.parse(row.expires_at) <= now) return "expired";
  if (Number(row.use_count) >= Number(row.max_uses)) return "full";
  return "active";
}

function publicPodInvite(row) {
  return {
    id: row.id,
    token: row.token,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantColor: row.tenant_color,
    podId: row.pod_id,
    roomCode: row.room_code,
    missionId: row.mission_id,
    title: row.title,
    description: row.description,
    hostName: row.host_name,
    role: row.guest_role,
    maxUses: Number(row.max_uses),
    useCount: Number(row.use_count),
    status: podInviteStatus(row),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    joinPath: `/join/${row.token}`,
  };
}

function validatePodInvite(body) {
  const roles = new Set(["viewer", "participant", "presenter"]);
  const tenantId = safeId(body.tenantId, "tech-at-nite");
  const podId = safeId(body.podId);
  const roomCode = safeId(body.roomCode).toUpperCase().slice(0, 64);
  const missionId = safeId(body.missionId, "xrt-green-mode");
  const role = safeId(body.role, "participant").toLowerCase();
  const maxUses = Math.round(Number(body.maxUses));
  const expiresInHours = Number(body.expiresInHours);
  if (!tenantId || !podId || !roomCode) throw new HttpError(400, "tenantId, podId, and roomCode are required");
  if (!roles.has(role)) throw new HttpError(400, "role must be viewer, participant, or presenter");
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) throw new HttpError(400, "maxUses must be between 1 and 100");
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) throw new HttpError(400, "expiresInHours must be between 1 and 168");
  return {
    tenantId, podId, roomCode, missionId, role, maxUses, expiresInHours,
    tenantName: safeLabel(body.tenantName, tenantId).slice(0, 100),
    tenantColor: safeHexColor(body.tenantColor),
    title: safeLabel(body.title, "AMX Skill Pod showcase").slice(0, 140),
    description: safeLabel(body.description, "Join this AMX Skill Pod showcase.").slice(0, 500),
    hostName: safeLabel(body.hostName, "AMX Host").slice(0, 100),
  };
}

function generateZkode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function normalizeZkode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

function validTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function serviceUrlConfigured(value, protocols) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const secure = parsed.protocol === "https:" || parsed.protocol === "wss:" || local;
    return protocols.includes(parsed.protocol) && secure && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}

function runtimeReadiness(env) {
  const configuredRequired = String(env.REQUIRED_SERVICES || "").split(",").map((item) => item.trim().toLowerCase()).filter((item) => REQUIRED_SERVICE_NAMES.has(item));
  const production = String(env.DEPLOYMENT_TIER || "").trim().toLowerCase() === "production";
  const required = new Set(production ? PRODUCTION_REQUIRED_SERVICES : configuredRequired);
  const configured = {
    database: Boolean(env.DB),
    media: Boolean(env.MEDIA),
    realtime: serviceUrlConfigured(env.SUPABASE_URL, ["https:"]) && Boolean(env.SUPABASE_PUBLISHABLE_KEY),
    rooms: Boolean(env.ROOMS) || (serviceUrlConfigured(env.SUPABASE_URL, ["https:"]) && Boolean(env.SUPABASE_PUBLISHABLE_KEY)),
    agent: serviceUrlConfigured(env.AGENT_RUNTIME_URL, ["https:", "http:"]) || Boolean(env.OPENAI_API_KEY),
    mcp: serviceUrlConfigured(env.MCP_GATEWAY_URL, ["https:", "http:"]),
    plugins: serviceUrlConfigured(env.PLUGIN_GATEWAY_URL, ["https:", "http:"]),
    livekit: serviceUrlConfigured(env.LIVEKIT_URL, ["wss:", "ws:"]) && Boolean(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET),
    runway: Boolean(String(env.RUNWAYML_API_SECRET || "").trim()),
    "proof-signing": Boolean(env.PROOF_SIGNING_SECRET),
    telemetry: Boolean(env.DB && env.DCIM_INGEST_TOKEN),
    observability: serviceUrlConfigured(env.OPS_ALERT_WEBHOOK_URL, ["https:"]) && Boolean(String(env.OPS_HEARTBEAT_TOKEN || "").trim()),
  };
  const missingRequired = [...required].filter((name) => !configured[name]);
  const optionalMissing = Object.entries(configured).filter(([, value]) => !value).map(([name]) => name);
  return {
    ready: missingRequired.length === 0 && Boolean(env.ASSETS),
    mode: missingRequired.length ? "not-ready" : optionalMissing.length ? "degraded" : "full",
    required: [...required],
    missingRequired,
    optionalMissing,
    components: configured,
    roomTransport: env.ROOMS ? "durable-object" : configured.realtime ? "supabase" : "local-only",
    deploymentTier: production ? "production" : "staging",
  };
}

async function probeReadiness(env) {
  const state = runtimeReadiness(env);
  if (state.components.database) {
    try {
      await initialize(env.DB);
      await env.DB.prepare("SELECT 1 AS ok").first();
    } catch { state.components.database = false; }
  }
  if (state.components.media) {
    try { await env.MEDIA.list({ limit: 1 }); }
    catch { state.components.media = false; }
  }
  state.missingRequired = state.required.filter((name) => !state.components[name]);
  state.optionalMissing = Object.entries(state.components).filter(([, value]) => !value).map(([name]) => name);
  state.ready = state.missingRequired.length === 0 && Boolean(env.ASSETS);
  state.mode = state.missingRequired.length ? "not-ready" : state.optionalMissing.length ? "degraded" : "full";
  return state;
}

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function policyValues(value) {
  return String(value || "").split(/[\n,]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function publicLiveKitRoomAllowed(env, room) {
  return policyValues(env.PUBLIC_LIVEKIT_ROOMS).includes(room.toLowerCase());
}

function liveKitOperatorHostAllowed(env, url) {
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return true;
  return policyValues(env.LIVEKIT_OPERATOR_HOSTS).includes(url.hostname.toLowerCase());
}

function stageOperatorHostAllowed(env, url) {
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return true;
  const hosts = policyValues(env.STAGE_OPERATOR_HOSTS || env.LIVEKIT_OPERATOR_HOSTS);
  return hosts.includes(url.hostname.toLowerCase());
}

async function createLiveKitToken(env, room, identity, name, role = "participant", clientType = role) {
  const viewer = role === "viewer";
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: env.LIVEKIT_API_KEY,
    sub: identity,
    identity,
    name,
    iat: now,
    nbf: now - 5,
    exp: now + 60 * 15,
    jti: crypto.randomUUID(),
    metadata: JSON.stringify({ app: "amx-air-hubs", room, role, clientType }),
    video: { room, roomJoin: true, canPublish: !viewer, canSubscribe: true, canPublishData: !viewer },
  }));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.LIVEKIT_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function createLiveKitAdminToken(env, room) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: env.LIVEKIT_API_KEY,
    sub: "amx-air-hubs-worker",
    identity: "amx-air-hubs-worker",
    name: "AMX AIR Hubs Worker",
    iat: now,
    nbf: now - 5,
    exp: now + 60,
    jti: crypto.randomUUID(),
    video: { room, roomAdmin: true },
  }));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function createLiveKitEgressToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64Url(JSON.stringify({
    iss: env.LIVEKIT_API_KEY,
    sub: "amx-air-hubs-egress",
    identity: "amx-air-hubs-egress",
    name: "AMX AIR Hubs Egress",
    iat: now,
    nbf: now - 5,
    exp: now + 60,
    jti: crypto.randomUUID(),
    video: { roomRecord: true },
  }));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

function liveKitEgressDestinations(env) {
  return String(env.DJ_RTMP_URLS || "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((value) => {
      const parsed = new URL(value);
      if (!["rtmp:", "rtmps:"].includes(parsed.protocol)) throw new Error("DJ stream destinations must use RTMP or RTMPS");
      if (!parsed.hostname) throw new Error("DJ stream destination host is required");
      return parsed.toString();
    });
}

const LIVEKIT_EGRESS_PROFILES = {
  "720p30": { id: "720p30", width: 1280, height: 720, frameRate: 30, preset: 0 },
  "1080p30": { id: "1080p30", width: 1920, height: 1080, frameRate: 30, preset: 2 },
  "1080p60": { id: "1080p60", width: 1920, height: 1080, frameRate: 60, preset: 3 },
};

function liveKitEgressProfile(value) {
  return LIVEKIT_EGRESS_PROFILES[safeId(value).toLowerCase()] || LIVEKIT_EGRESS_PROFILES["1080p30"];
}

async function matchesSecret(provided, expected) {
  if (!provided || !expected) return false;
  const values = await Promise.all([provided, expected].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const left = new Uint8Array(values[0]);
  const right = new Uint8Array(values[1]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

async function authorizeDjBroadcast(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!await matchesSecret(provided, env.DJ_STREAM_CONTROL_TOKEN)) throw new HttpError(403, "DJ broadcast control token is invalid");
}

function liveKitApiUrl(env, method) {
  const endpoint = new URL(env.LIVEKIT_URL);
  endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
  endpoint.pathname = `/twirp/livekit.Egress/${method}`;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint;
}

async function callLiveKitEgress(env, method, body) {
  const token = await createLiveKitEgressToken(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(liveKitApiUrl(env, method), {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new HttpError(response.status >= 500 ? 502 : response.status, safeLabel(result?.msg || result?.message || `LiveKit egress returned ${response.status}`, "LiveKit egress failed").slice(0, 240));
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeEgress(info) {
  const status = info?.status ?? "EGRESS_STARTING";
  return {
    id: safeId(info?.egress_id || info?.egressId).slice(0, 80),
    room: safeId(info?.room_name || info?.roomName).toUpperCase().slice(0, 64),
    status: typeof status === "number" ? ["EGRESS_STARTING", "EGRESS_ACTIVE", "EGRESS_ENDING", "EGRESS_COMPLETE", "EGRESS_FAILED", "EGRESS_ABORTED", "EGRESS_LIMIT_REACHED"][status] || "EGRESS_UNKNOWN" : safeId(status, "EGRESS_UNKNOWN").toUpperCase(),
  };
}

async function ensureLiveKitAgentDispatch(env, room, requestId) {
  const agentName = safeId(env.LIVEKIT_AGENT_NAME);
  if (!agentName) return { configured: false, dispatched: false };
  const endpoint = new URL(env.LIVEKIT_URL);
  endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
  endpoint.pathname = "/twirp/livekit.AgentDispatchService/ListDispatch";
  endpoint.search = "";
  endpoint.hash = "";
  const token = await createLiveKitAdminToken(env, room);
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const listResponse = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ room }), signal: controller.signal });
    if (!listResponse.ok && listResponse.status !== 404) throw new Error(`Agent dispatch list returned ${listResponse.status}`);
    const list = listResponse.ok ? await listResponse.json() : {};
    const dispatches = list.agent_dispatches || list.agentDispatches || [];
    if (Array.isArray(dispatches) && dispatches.some((dispatch) => dispatch.agent_name === agentName || dispatch.agentName === agentName)) {
      return { configured: true, dispatched: true, existing: true, agentName };
    }
    endpoint.pathname = "/twirp/livekit.AgentDispatchService/CreateDispatch";
    const createResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ agent_name: agentName, room, metadata: JSON.stringify({ app: "amx-air-hubs", room }) }),
      signal: controller.signal,
    });
    if (!createResponse.ok) throw new Error(`Agent dispatch create returned ${createResponse.status}`);
    return { configured: true, dispatched: true, existing: false, agentName };
  } catch (error) {
    logEvent("warn", "livekit.agent_dispatch_failed", { requestId, room, agentName, error: error instanceof Error ? error.message : "Agent dispatch failed" });
    return { configured: true, dispatched: false, agentName };
  } finally {
    clearTimeout(timeout);
  }
}
async function allowRequest(request, env, limit = 120, namespace = "api") {
  const key = `${namespace}:${request.headers.get("CF-Connecting-IP") || "local"}`;
  const now = Date.now();
  if (env.DB) {
    try {
      await initialize(env.DB);
      const bucketKey = await sha256(key);
      const windowStart = Math.floor(now / 60_000) * 60_000;
      await env.DB.prepare("INSERT INTO api_rate_limits (bucket_key, window_start, request_count, expires_at) VALUES (?, ?, 1, ?) ON CONFLICT(bucket_key) DO UPDATE SET request_count = CASE WHEN api_rate_limits.window_start = excluded.window_start THEN api_rate_limits.request_count + 1 ELSE 1 END, window_start = excluded.window_start, expires_at = excluded.expires_at")
        .bind(bucketKey, windowStart, new Date(windowStart + 120_000).toISOString()).run();
      const row = await env.DB.prepare("SELECT request_count FROM api_rate_limits WHERE bucket_key = ? LIMIT 1").bind(bucketKey).first();
      if (Number.isFinite(Number(row?.request_count))) return Number(row.request_count) <= limit;
    } catch (error) {
      logEvent("warn", "rate_limit.durable_fallback", { namespace, error: error instanceof Error ? error.message : "Durable rate limiter unavailable" });
    }
  }
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, value] of rateBuckets) if (now - value.start > 60_000) rateBuckets.delete(bucketKey);
  }
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= limit;
}

function gatewayUrl(base, path) {
  const parsed = new URL(base);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) throw new Error("Gateway URL must use HTTPS");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Gateway URL cannot include credentials, a query, or a fragment");
  return new URL(path.replace(/^\//, ""), parsed.toString().endsWith("/") ? parsed : `${parsed}/`);
}

async function gatewayRequest(base, token, path, payload, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const startedAt = Date.now();
  const target = gatewayUrl(base, path);
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Request-ID": requestId, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Gateway returned ${response.status}`);
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) throw new Error("Gateway did not return JSON");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("Gateway response is too large");
    const result = JSON.parse(text);
    if (!isPlainObject(result)) throw new Error("Gateway response must be a JSON object");
    logEvent("info", "gateway.completed", { requestId, host: target.hostname, path: target.pathname, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logEvent("warn", "gateway.failed", { requestId, host: target.hostname, path: target.pathname, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown gateway error" });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function openAIResponse(env, payload, requestId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const attachmentSummary = payload.attachments.length
    ? `\nAttachments: ${payload.attachments.map((attachment) => `${attachment.kind}:${attachment.name}`).join(", ")}`
    : "";
  const inputContent = [
    { type: "input_text", text: `${payload.text || "Review the supplied content."}${attachmentSummary}` },
    ...payload.attachments
      .filter((attachment) => attachment.kind === "image" && typeof attachment.dataUrl === "string" && attachment.dataUrl.startsWith("data:image/"))
      .slice(0, 4)
      .map((attachment) => ({ type: "input_image", image_url: attachment.dataUrl })),
  ];
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: JSON.stringify({
        model: safeLabel(env.OPENAI_MODEL, "gpt-5-mini"),
        store: false,
        max_output_tokens: 700,
        instructions: "You are an AMX AIR Hubs digital-twin operator. Explain telemetry and simulations clearly. Never claim a physical action occurred. Treat approved actions as recorded intent until a verified physical adapter reports completion.",
        input: [{ role: "user", content: inputContent }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenAI Responses API returned ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("OpenAI response is too large");
    const result = JSON.parse(text);
    const output = typeof result.output_text === "string"
      ? result.output_text
      : (Array.isArray(result.output) ? result.output : []).flatMap((item) => Array.isArray(item?.content) ? item.content : []).map((item) => item?.text).filter(Boolean).join("\n");
    if (!output) throw new Error("OpenAI returned no text output");
    return {
      text: output.slice(0, 30_000),
      transport: "remote",
      tools: [{ id: crypto.randomUUID(), name: "openai.responses", source: "runtime", status: "complete", detail: `Response generated by ${safeLabel(env.OPENAI_MODEL, "gpt-5-mini")}.`, timestamp: new Date().toISOString() }],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runwayRequest(env, path, options = {}, bearerToken) {
  const token = String(bearerToken || env.RUNWAYML_API_SECRET || "").trim();
  if (!token) throw new HttpError(503, "Runway Characters is not configured on this stage");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${RUNWAY_API_BASE}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Runway-Version": RUNWAY_API_VERSION,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_GATEWAY_RESPONSE_BYTES) throw new Error("Runway response is too large");
    let result = {};
    try { result = text ? JSON.parse(text) : {}; }
    catch { throw new Error("Runway returned an invalid response"); }
    if (!response.ok) {
      const detail = safeLabel(result?.error || result?.message || `Runway API returned ${response.status}`, "Runway request failed");
      throw new HttpError(response.status === 401 || response.status === 403 ? 503 : 502, detail);
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRunwayAvatars(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  return items.filter(isPlainObject).slice(0, 50).map((avatar) => ({
    id: safeId(avatar.id),
    name: safeLabel(avatar.name, "Runway Character").slice(0, 80),
    type: "custom",
    status: ["PROCESSING", "READY", "FAILED"].includes(avatar.status) ? avatar.status : "PROCESSING",
    imageUrl: typeof avatar.processedImageUri === "string" && avatar.processedImageUri.startsWith("https://") ? avatar.processedImageUri
      : typeof avatar.referenceImageUri === "string" && avatar.referenceImageUri.startsWith("https://") ? avatar.referenceImageUri : undefined,
  })).filter((avatar) => avatar.id);
}

async function createRunwaySession(env, body) {
  const avatarId = safeId(body.avatarId).slice(0, 96);
  const avatarType = body.avatarType === "custom" ? "custom" : "preset";
  if (!avatarId) throw new HttpError(400, "avatarId is required");
  if (avatarType === "preset" && !RUNWAY_PRESET_IDS.has(avatarId)) throw new HttpError(400, "Unknown Runway preset avatar");
  const roomCode = safeId(body.roomCode, "NEXUS1").toUpperCase().slice(0, 64);
  const personality = String(body.personality || "").trim().slice(0, 4_000);
  const startScript = String(body.startScript || "").trim().slice(0, 800);
  const created = await runwayRequest(env, "/v1/realtime_sessions", {
    method: "POST",
    body: JSON.stringify({
      model: "gwm1_avatars",
      avatar: avatarType === "custom" ? { type: "custom", avatarId } : { type: "runway-preset", presetId: avatarId },
      maxDuration: 300,
      ...(personality ? { personality } : {}),
      ...(startScript ? { startScript } : {}),
      tools: RUNWAY_CLIENT_TOOLS,
    }),
  });
  const sessionId = safeId(created?.id).slice(0, 96);
  if (!sessionId) throw new Error("Runway did not return a session ID");

  let sessionKey = "";
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const session = await runwayRequest(env, `/v1/realtime_sessions/${sessionId}`);
    if (session.status === "READY" && typeof session.sessionKey === "string") {
      sessionKey = session.sessionKey;
      break;
    }
    if (["FAILED", "CANCELLED", "COMPLETED"].includes(session.status)) throw new HttpError(502, safeLabel(session.failure, `Runway session ${session.status.toLowerCase()}`));
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  if (!sessionKey) throw new HttpError(504, "Runway session provisioning timed out");
  const credentials = await runwayRequest(env, `/v1/realtime_sessions/${sessionId}/consume`, { method: "POST" }, sessionKey);
  const serverUrl = typeof credentials.url === "string" ? credentials.url : credentials.serverUrl;
  const token = typeof credentials.token === "string" ? credentials.token : "";
  const roomName = safeLabel(credentials.roomName, roomCode);
  if (!serverUrl || !token || !roomName) throw new Error("Runway returned incomplete session credentials");
  return { sessionId, serverUrl, token, roomName };
}

function agentCapabilities(env) {
  const readiness = runtimeReadiness(env);
  const mcpGatewayConfigured = readiness.components.mcp;
  const pluginGatewayConfigured = readiness.components.plugins;
  return {
    transport: readiness.components.agent ? "remote" : "local",
    agentRuntimeConfigured: readiness.components.agent,
    mcpGatewayConfigured,
    pluginGatewayConfigured,
    livekitConfigured: readiness.components.livekit,
    runwayConfigured: readiness.components.runway,
    persistenceConfigured: readiness.components.database,
    mediaStorageConfigured: readiness.components.media,
    roomTransport: readiness.roomTransport,
    deploymentMode: readiness.mode,
    tools: [
      ...AGENT_TOOLS,
      { name: "plugin.catalog", description: "List tools from the configured Plugin gateway", source: "plugin", available: pluginGatewayConfigured },
      { name: "mcp.tools", description: "List tools from the configured MCP gateway", source: "mcp", available: mcpGatewayConfigured },
    ],
  };
}

function sanitizeAgentPayload(body) {
  const allowedKinds = new Set(["text", "audio", "image", "video", "code", "document"]);
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  return {
    agentId: safeId(body.agentId, "agent").slice(0, 64),
    agentName: safeLabel(body.agentName, "AMX Agent").slice(0, 80),
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    text: String(body.text || "").slice(0, 12_000),
    contentKind: allowedKinds.has(body.contentKind) ? body.contentKind : "text",
    attachments: attachments.filter(isPlainObject).slice(0, 12).map((attachment) => {
      const mimeType = String(attachment.mimeType || "application/octet-stream").toLowerCase().slice(0, 120);
      const dataUrl = typeof attachment.dataUrl === "string" && attachment.dataUrl.length <= 5_800_000 && attachment.dataUrl.startsWith(`data:${mimeType};base64,`)
        ? attachment.dataUrl
        : undefined;
      const storageUrl = typeof attachment.storageUrl === "string" && /^\/api\/media\/[a-zA-Z0-9_-]{8,120}$/.test(attachment.storageUrl)
        ? attachment.storageUrl
        : undefined;
      return {
      id: String(attachment.id || crypto.randomUUID()).slice(0, 80),
      kind: allowedKinds.has(attachment.kind) ? attachment.kind : "document",
      name: safeLabel(attachment.name, "attachment"),
      mimeType,
      size: Math.max(0, Math.min(Number(attachment.size) || 0, MAX_MEDIA_BYTES)),
      transfer: attachment.transfer === "inline" ? "inline" : attachment.transfer === "stored" && storageUrl ? "stored" : "metadata",
      content: typeof attachment.content === "string" ? attachment.content.slice(0, 60_000) : undefined,
      dataUrl,
      storageUrl,
    };
    }),
  };
}

function localAgentResult(payload) {
  const kinds = [...new Set(payload.attachments.map((attachment) => attachment.kind))];
  const timestamp = new Date().toISOString();
  const tools = [
    { id: crypto.randomUUID(), name: "mission.context", source: "skill", status: "complete", detail: "Local mission context loaded.", timestamp },
  ];
  if (kinds.includes("code")) tools.push({ id: crypto.randomUUID(), name: "scene-code.review", source: "skill", status: "complete", detail: "Code content registered for local review.", timestamp });
  if (kinds.some((kind) => ["audio", "image", "video"].includes(kind))) tools.push({ id: crypto.randomUUID(), name: "media.intake", source: "runtime", status: "complete", detail: "Media registered; inference requires the remote agent runtime.", timestamp });
  const subject = payload.text || (kinds.length ? `${kinds.join(" + ")} content` : "task");
  return {
    text: `${payload.agentName} accepted: "${subject.slice(0, 180)}" for local orchestration.${kinds.length ? ` ${payload.attachments.length} attachment${payload.attachments.length === 1 ? "" : "s"} registered.` : ""}`,
    transport: "local",
    tools,
  };
}

function normalizeRemoteTools(tools) {
  const validSources = new Set(["skill", "plugin", "mcp", "runtime"]);
  const validStatuses = new Set(["running", "complete", "blocked"]);
  if (!Array.isArray(tools)) return [];
  return tools.filter((tool) => tool && typeof tool === "object").slice(0, 30).map((tool) => ({
    id: String(tool.id || crypto.randomUUID()).slice(0, 120),
    name: String(tool.name || "remote.tool").slice(0, 160),
    source: validSources.has(tool.source) ? tool.source : "runtime",
    status: validStatuses.has(tool.status) ? tool.status : "complete",
    detail: String(tool.detail || "Remote tool completed.").slice(0, 1000),
    timestamp: typeof tool.timestamp === "string" && !Number.isNaN(Date.parse(tool.timestamp)) ? tool.timestamp : new Date().toISOString(),
  }));
}

function allowedMediaType(value) {
  const mimeType = String(value || "application/octet-stream").toLowerCase().split(";")[0].trim();
  if (mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/") || MEDIA_TYPES.has(mimeType)) return mimeType;
  throw new HttpError(415, "Unsupported media type");
}

function validateAnalyticsEvent(body) {
  const id = safeId(body.id);
  const eventName = safeId(body.eventName);
  if (!id || !eventName) throw new HttpError(400, "Analytics id and eventName are required");
  return {
    ...body,
    id,
    eventName,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    missionId: safeId(body.missionId) || undefined,
    campaignId: safeId(body.campaignId) || undefined,
    locationTag: safeLabel(body.locationTag) || undefined,
    timestamp: validTimestamp(body.timestamp) ? body.timestamp : new Date().toISOString(),
  };
}

function safeNumber(value, fallback = 0, minimum = -1_000_000, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function validateAnchorPayload(body) {
  const id = safeId(body.id);
  const roomCode = safeId(body.roomCode).toUpperCase().slice(0, 64);
  const source = ["webxr", "camera", "map"].includes(body.source) ? body.source : "map";
  const localPosition = Array.isArray(body.localPosition) && body.localPosition.length === 3
    ? body.localPosition.map((value) => safeNumber(value, 0, -10_000, 10_000))
    : [0, 0, 0];
  const orientation = Array.isArray(body.orientation) && body.orientation.length === 4
    ? body.orientation.map((value, index) => safeNumber(value, index === 3 ? 1 : 0, -1, 1))
    : [0, 0, 0, 1];
  if (!id || !roomCode) throw new HttpError(400, "Anchor id and roomCode are required");
  return {
    id,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    roomCode,
    label: safeLabel(body.label, "Spatial anchor").slice(0, 80),
    ownerId: safeId(body.ownerId, "participant"),
    latitude: body.latitude === null || body.latitude === undefined ? null : safeNumber(body.latitude, 0, -90, 90),
    longitude: body.longitude === null || body.longitude === undefined ? null : safeNumber(body.longitude, 0, -180, 180),
    altitude: body.altitude === null || body.altitude === undefined ? null : safeNumber(body.altitude, 0, -20_000, 100_000),
    accuracy: body.accuracy === null || body.accuracy === undefined ? null : safeNumber(body.accuracy, 0, 0, 100_000),
    localPosition,
    orientation,
    source,
    persistentHandle: typeof body.persistentHandle === "string" ? safeLabel(body.persistentHandle).slice(0, 240) : undefined,
    createdAt: validTimestamp(body.createdAt) ? body.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function validateTwinEvent(body) {
  const id = safeId(body.id);
  const twinId = safeId(body.twinId);
  const roomCode = safeId(body.roomCode).toUpperCase().slice(0, 64);
  const eventType = ["scenario", "approval", "telemetry", "skill"].includes(body.eventType) ? body.eventType : "";
  if (!id || !twinId || !roomCode || !eventType) throw new HttpError(400, "Twin id, roomCode, and supported eventType are required");
  return {
    id,
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    twinId,
    roomCode,
    eventType,
    payload: isPlainObject(body.payload) ? body.payload : {},
    createdAt: validTimestamp(body.createdAt) ? body.createdAt : new Date().toISOString(),
  };
}

function requireMetric(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new HttpError(400, `${label} is outside the supported range`);
  return number;
}

function validateDataCenterTelemetry(body) {
  const id = safeId(body.id);
  const tenantId = safeId(body.tenantId);
  const adapter = DATA_CENTER_ADAPTERS.has(body.adapter) ? body.adapter : "";
  const sourceSystem = safeLabel(body.sourceSystem).slice(0, 120);
  if (!id || !tenantId || !adapter || !sourceSystem || !validTimestamp(body.timestamp)) throw new HttpError(400, "Telemetry id, tenantId, adapter, sourceSystem, and timestamp are required");
  if (!isPlainObject(body.pod)) throw new HttpError(400, "Telemetry pod metrics are required");
  if (!Array.isArray(body.racks) || !body.racks.length || body.racks.length > 64) throw new HttpError(400, "Telemetry requires 1 to 64 racks");
  const racks = body.racks.map((rack, index) => {
    if (!isPlainObject(rack)) throw new HttpError(400, "Each rack telemetry entry must be an object");
    const label = safeLabel(rack.label, `R${index + 1}`).slice(0, 24);
    const inletC = requireMetric(rack.inletC, `${label} inletC`, -20, 90);
    const capacityPercent = requireMetric(rack.capacityPercent, `${label} capacityPercent`, 0, 150);
    const networkGbps = requireMetric(rack.networkGbps, `${label} networkGbps`, 0, 10_000);
    const health = inletC >= 31 || capacityPercent >= 102 || networkGbps < 1.5 ? "critical" : inletC >= 27 || capacityPercent >= 88 ? "watch" : "nominal";
    return {
      id: safeId(rack.id, `${tenantId}-r${index + 1}`),
      label,
      workload: safeLabel(rack.workload, "mapped workload").slice(0, 80),
      powerKw: requireMetric(rack.powerKw, `${label} powerKw`, 0, 5_000),
      inletC,
      capacityPercent: Math.round(capacityPercent),
      networkGbps,
      health,
    };
  });
  const pod = {
    itLoadKw: requireMetric(body.pod.itLoadKw, "pod.itLoadKw", 0, 100_000),
    facilityKw: requireMetric(body.pod.facilityKw, "pod.facilityKw", 0, 150_000),
    pue: requireMetric(body.pod.pue, "pod.pue", 1, 5),
    coolingKw: requireMetric(body.pod.coolingKw, "pod.coolingKw", 0, 100_000),
    networkGbps: requireMetric(body.pod.networkGbps, "pod.networkGbps", 0, 100_000),
    storageTb: requireMetric(body.pod.storageTb, "pod.storageTb", 0, 10_000_000),
    availabilityPercent: requireMetric(body.pod.availabilityPercent, "pod.availabilityPercent", 0, 100),
    carbonGramsPerKwh: requireMetric(body.pod.carbonGramsPerKwh, "pod.carbonGramsPerKwh", 0, 5_000),
  };
  return {
    id, tenantId, adapter, sourceSystem, timestamp: body.timestamp, receivedAt: new Date().toISOString(), pod, racks,
    alarms: Array.isArray(body.alarms) ? body.alarms.map((alarm) => safeLabel(alarm)).filter(Boolean).slice(0, 64) : [],
  };
}

function authorizedTelemetryIngest(request, env) {
  const supplied = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.DCIM_INGEST_TOKEN}`;
  if (supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function validateProjectLearningState(body) {
  const tenantId = safeId(body.tenantId);
  const learnerId = safeId(body.learnerId);
  const projectId = safeId(body.projectId);
  if (!tenantId || !learnerId || !projectId) throw new HttpError(400, "tenantId, learnerId, and projectId are required");
  const stage = ["know", "do", "be"].includes(body.stage) ? body.stage : "know";
  const toolRuns = normalizeRemoteTools(body.toolRuns);
  const reflection = safeLabel(body.reflection).slice(0, 600);
  const requiredTools = ["dcim.inspect", "rack.thermal-map", "incident.runbook"];
  const eligible = Boolean(body.knowledgeConfirmed) && reflection.length >= 20 && requiredTools.every((name) => toolRuns.some((run) => run.name === name && run.status === "complete"));
  return {
    version: 1,
    projectId,
    tenantId,
    learnerId,
    stage: eligible ? "be" : stage,
    knowledgeConfirmed: Boolean(body.knowledgeConfirmed),
    toolRuns,
    reflection,
    status: body.status === "complete" && eligible ? "complete" : "in_progress",
    updatedAt: validTimestamp(body.updatedAt) ? body.updatedAt : new Date().toISOString(),
  };
}

function validateProofPayload(body) {
  if (!isPlainObject(body)) throw new HttpError(400, "Proof payload is required");
  const proof = {
    ...body,
    id: safeId(body.id),
    tenantId: safeId(body.tenantId, "tech-at-nite"),
    learnerId: safeId(body.learnerId, "guest-user"),
    missionId: safeId(body.missionId),
    status: body.status === "complete" ? "complete" : "in_progress",
    timestamp: validTimestamp(body.timestamp) ? body.timestamp : new Date().toISOString(),
  };
  if (!proof.id || !proof.missionId) throw new HttpError(400, "Proof id and missionId are required");
  return proof;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).filter((key) => key !== "serverAttestation").sort().map((key) => [key, canonicalValue(value[key])]));
}

async function attestProof(proof, env) {
  if (!env.PROOF_SIGNING_SECRET) return proof;
  const signedAt = new Date().toISOString();
  const source = JSON.stringify(canonicalValue(proof));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.PROOF_SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source)));
  return { ...proof, serverAttestation: { algorithm: "HMAC-SHA256", signature, signedAt } };
}

async function recordAgentRun(env, input) {
  if (!env.DB) return;
  try {
    await initialize(env.DB);
    await env.DB.prepare("INSERT INTO agent_runs (id, tenant_id, agent_id, transport, content_kind, attachment_count, status, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), safeId(input.tenantId, "tech-at-nite"), safeId(input.agentId, "agent"), input.transport, input.contentKind, input.attachmentCount, input.status, input.requestId, new Date().toISOString()).run();
  } catch (error) {
    logEvent("warn", "agent.telemetry_failed", { requestId: input.requestId, error: error instanceof Error ? error.message : "Agent telemetry persistence failed" });
  }
}

async function persistAnalytics(env, event) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO analytics_events (id, tenant_id, event_name, mission_id, campaign_id, location_tag, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(event.id, event.tenantId, event.eventName, event.missionId || null, event.campaignId || null, event.locationTag || null, JSON.stringify(event), event.timestamp).run();
}

async function persistAnchor(env, anchor) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO geo_anchors (id, tenant_id, room_code, payload, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(anchor.id, anchor.tenantId, anchor.roomCode, JSON.stringify(anchor), anchor.updatedAt).run();
}

async function persistTwinEvent(env, event) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO digital_twin_events (id, tenant_id, twin_id, room_code, event_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(event.id, event.tenantId, event.twinId, event.roomCode, event.eventType, JSON.stringify(event.payload), event.createdAt).run();
}

async function persistDataCenterTelemetry(env, item) {
  if (!env.DB) throw new HttpError(503, "Telemetry database is not configured");
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO data_center_telemetry (id, tenant_id, adapter, source_system, observed_at, received_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(item.id, item.tenantId, item.adapter, item.sourceSystem, item.timestamp, item.receivedAt, JSON.stringify(item)).run();
}

async function persistProjectLearningState(env, item) {
  if (!env.DB) return;
  await initialize(env.DB);
  const id = `${item.tenantId}_${item.projectId}_${item.learnerId}`;
  await env.DB.prepare("INSERT OR REPLACE INTO project_learning_state (id, tenant_id, project_id, learner_id, status, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, item.tenantId, item.projectId, item.learnerId, item.status, JSON.stringify(item), item.updatedAt).run();
}

async function persistProof(env, proof) {
  if (!env.DB) return;
  await initialize(env.DB);
  await env.DB.prepare("INSERT OR REPLACE INTO proof_records (id, tenant_id, learner_id, mission_id, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(proof.id, proof.tenantId, proof.learnerId, proof.missionId, proof.status, JSON.stringify(proof), proof.timestamp, new Date().toISOString()).run();
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 32_768, bytes.length)));
  }
  return btoa(binary);
}

async function hydrateAttachmentsForGateway(payload, origin, env) {
  const attachments = await Promise.all(payload.attachments.map(async (attachment) => {
    if (!attachment.storageUrl || attachment.dataUrl || attachment.content || !env.MEDIA) {
      return { ...attachment, storageUrl: attachment.storageUrl ? new URL(attachment.storageUrl, origin).toString() : undefined };
    }
    const id = safeId(attachment.storageUrl.split("/").pop());
    try {
      const object = id ? await env.MEDIA.get(id) : null;
      if (!object) throw new Error("Stored attachment was not found");
      const buffer = await object.arrayBuffer();
      if (buffer.byteLength > MAX_MEDIA_BYTES) throw new Error("Stored attachment exceeds the gateway limit");
      const contentType = object.httpMetadata?.contentType || attachment.mimeType || "application/octet-stream";
      return { ...attachment, dataUrl: `data:${contentType};base64,${bytesToBase64(buffer)}`, transfer: "inline", storageUrl: new URL(attachment.storageUrl, origin).toString() };
    } catch {
      return { ...attachment, storageUrl: new URL(attachment.storageUrl, origin).toString() };
    }
  }));
  return { ...payload, attachments };
}

async function invokeBuiltInTool(toolName, context, env) {
  if (toolName === "system.health") return { service: "amx-air-hubs", online: true, timestamp: new Date().toISOString() };
  if (toolName === "mission.context") return { agentId: context.agentId || "agent", missionId: context.missionId || "webxr-creator", source: "client-context" };
  if (toolName === "spatial.capabilities") return context.browser || { webgpu: false, webxr: false, camera: false };
  if (toolName === "proof.latest") {
    await initialize(env.DB);
    if (!env.DB) return context.latestProof || { status: "No proof database is connected" };
    const result = await env.DB.prepare("SELECT payload FROM proof_records ORDER BY created_at DESC LIMIT 1").first();
    return result?.payload ? JSON.parse(result.payload) : { status: "No proof records" };
  }
  const tenant = isPlainObject(context.tenant) ? context.tenant : {};
  const pod = isPlainObject(context.pod) ? context.pod : {};
  const racks = Array.isArray(context.racks) ? context.racks.filter(isPlainObject).slice(0, 24) : [];
  const alarms = Array.isArray(context.alarms) ? context.alarms.map((alarm) => safeLabel(alarm)).filter(Boolean).slice(0, 24) : [];
  if (toolName === "dcim.inspect") return {
    tenant: safeLabel(tenant.name, "Active tenant"), source: safeLabel(context.provenance, "unknown"), scenario: safeId(context.scenario, "normal-operations"),
    itLoadKw: safeNumber(pod.itLoadKw), pue: safeNumber(pod.pue), networkGbps: safeNumber(pod.networkGbps), availabilityPercent: safeNumber(pod.availabilityPercent), alarms,
  };
  if (toolName === "rack.thermal-map") return {
    tenant: safeLabel(tenant.name, "Active tenant"),
    racks: racks.map((rack) => ({ label: safeLabel(rack.label), inletC: safeNumber(rack.inletC), capacityPercent: safeNumber(rack.capacityPercent), health: ["nominal", "watch", "critical"].includes(rack.health) ? rack.health : "unknown" })),
    recommendation: alarms.length ? "Inspect the highest-temperature inlet, verify airflow containment, and simulate load movement before operator approval." : "Thermal envelope is nominal; preserve the current airflow configuration.",
  };
  if (toolName === "tenant.capacity-plan") return {
    tenant: safeLabel(tenant.name, "Active tenant"),
    rackHeadroom: racks.map((rack) => ({ label: safeLabel(rack.label), headroomPercent: Math.max(0, 100 - safeNumber(rack.capacityPercent)) })),
    guardrail: "Keep at least 15% rack headroom and validate power, cooling, and SLA impact before workload admission.",
  };
  if (toolName === "incident.runbook") return {
    scenario: safeId(context.scenario, "normal-operations"), alarms,
    steps: ["Confirm tenant and telemetry provenance", "Identify affected racks and SLA impact", "Simulate a reversible response", "Request authorized operator approval", "Execute through the approved control plane", "Verify recovery and record proof"],
    physicalActuation: "locked",
  };
  if (toolName === "workshop.brief") return {
    tenant: safeLabel(tenant.name, "Active tenant"), scenario: safeId(context.scenario, "normal-operations"),
    objective: "Use the twin to observe, diagnose, simulate, request approval, and explain the evidence behind the decision.",
    deliverables: ["risk statement", "rack evidence", "scenario comparison", "human approval decision", "post-action verification"],
  };
  throw new Error("Unknown built-in tool");
}

function sanitizeRoomMessage(value, senderFallback = "participant") {
  let input = value;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > 16_384) throw new Error("Room message is too large");
    input = JSON.parse(value);
  }
  if (!isPlainObject(input)) throw new Error("Room message must be an object");
  const kind = ["chat", "presence", "progress"].includes(input.kind) ? input.kind : "chat";
  const text = String(input.text || "").trim().slice(0, 2000);
  if (!text) throw new Error("Room message text is required");
  return {
    id: safeId(input.id, crypto.randomUUID()),
    sender: safeId(input.sender, senderFallback),
    text,
    timestamp: validTimestamp(input.timestamp) ? input.timestamp : new Date().toISOString(),
    kind,
  };
}

function openEphemeralRoom(request, roomCode) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  const participant = safeId(new URL(request.url).searchParams.get("participant"), crypto.randomUUID().slice(0, 8));
  const room = ephemeralRooms.get(roomCode) || new Set();
  room.add(server);
  ephemeralRooms.set(roomCode, room);
  server.accept();
  const relay = (message, except) => {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    for (const socket of room) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { room.delete(socket); }
    }
  };
  relay({ id: crypto.randomUUID(), sender: participant, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
  server.addEventListener("message", (event) => {
    try { relay(sanitizeRoomMessage(event.data, participant), server); }
    catch (error) { server.send(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid room message" })); }
  });
  server.addEventListener("close", () => {
    room.delete(server);
    relay({ id: crypto.randomUUID(), sender: participant, text: "left the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    if (!room.size) ephemeralRooms.delete(roomCode);
  });
  return new Response(null, { status: 101, webSocket: client });
}

function airPositiveInteger(value, fallback, maximum = 10_000_000) {
  const parsed = Math.floor(Number(value ?? fallback));
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) throw new HttpError(400, "Resource values must be positive whole numbers");
  return parsed;
}

function parseStoredJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

function publicAirRuntime(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    poolId: row.pool_id,
    roomCode: row.room_code,
    name: row.name,
    allocationUnits: Number(row.allocation_units),
    consumedUnits: Number(row.consumed_units),
    learnerCount: Number(row.learner_count),
    trainerCount: Number(row.trainer_count),
    agentCount: Number(row.agent_count),
    learnerIds: parseStoredJson(row.learner_ids, []),
    bandwidthMbps: Number(row.bandwidth_mbps),
    videoProfile: row.video_profile,
    livekitRoom: row.livekit_room,
    livekitDispatch: parseStoredJson(row.livekit_dispatch, null),
    status: row.status,
    report: parseStoredJson(row.report_payload, null),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function airConnectState(db, tenantId) {
  const [poolRows, runtimeRows, walletSummary, transactionRows, providerRows, poolProfileRows, containerRows, nodeRows, policyRows, commandRows, usageRows, sessionRows, alertRows, reportRows] = await Promise.all([
    db.prepare("SELECT id, tenant_id, name, resource_type, total_units, available_units, status, created_by, created_at, updated_at FROM air_resource_pools WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 20").bind(tenantId).all(),
    db.prepare("SELECT * FROM air_room_runtimes WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 50").bind(tenantId).all(),
    db.prepare("SELECT COUNT(*) AS wallet_count, COALESCE(SUM(available_units), 0) AS credits_issued FROM air_resource_wallets WHERE tenant_id = ? AND resource_type = 'AIR_CREDIT'").bind(tenantId).first(),
    db.prepare("SELECT id, pool_id, runtime_id, wallet_id, transaction_type, resource_type, amount_units, balance_after, actor_id, reason, metadata, created_at FROM air_resource_transactions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId).all(),
    db.prepare("SELECT * FROM connectivity_providers WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 20").bind(tenantId).all(),
    db.prepare("SELECT * FROM connectivity_pool_profiles WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 20").bind(tenantId).all(),
    db.prepare("SELECT * FROM connectivity_container_profiles WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 50").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_nodes WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 20").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_policies WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_edge_commands WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT 50").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_usage_samples WHERE tenant_id = ? ORDER BY recorded_at DESC LIMIT 120").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_sessions WHERE tenant_id = ? ORDER BY connected_at DESC LIMIT 120").bind(tenantId).all(),
    db.prepare("SELECT * FROM network_alerts WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50").bind(tenantId).all(),
    db.prepare("SELECT * FROM connectivity_reports WHERE tenant_id = ? ORDER BY generated_at DESC LIMIT 50").bind(tenantId).all(),
  ]);
  const poolProfiles = new Map((poolProfileRows.results || []).map((row) => [row.pool_id, row]));
  const containers = new Map((containerRows.results || []).map((row) => [row.runtime_id, row]));
  return {
    pools: (poolRows.results || []).map((row) => { const profile = poolProfiles.get(row.id); return { id: row.id, tenantId: row.tenant_id, name: row.name, resourceType: row.resource_type, totalUnits: Number(row.total_units), availableUnits: Number(row.available_units), status: row.status, providerId: profile?.provider_id || null, locationId: profile?.location_id || null, downloadCapacityMbps: Number(profile?.download_capacity_mbps || 0), uploadCapacityMbps: Number(profile?.upload_capacity_mbps || 0), upstreamCostCents: Number(profile?.upstream_cost_cents || 0), currency: profile?.currency || "USD", createdAt: row.created_at, updatedAt: row.updated_at }; }),
    runtimes: (runtimeRows.results || []).map((row) => { const profile = containers.get(row.id); return { ...publicAirRuntime(row), profile: profile ? { roomId: profile.room_id, eventId: profile.event_id, programId: profile.program_id, reservedMb: Number(profile.reserved_mb), downloadLimitMbps: Number(profile.download_limit_mbps), uploadLimitMbps: Number(profile.upload_limit_mbps), minGuaranteedMbps: Number(profile.min_guaranteed_mbps), burstLimitMbps: Number(profile.burst_limit_mbps), maxUsers: Number(profile.max_users), maxDevices: Number(profile.max_devices), priorityClass: profile.priority_class, startsAt: profile.starts_at, endsAt: profile.ends_at, autoReturnUnused: Boolean(profile.auto_return_unused), networkPolicyId: profile.network_policy_id, edgeNodeId: profile.edge_node_id, policyVersion: Number(profile.policy_version), admissionsOpen: Boolean(profile.admissions_open), cost: parseStoredJson(profile.cost_payload, {}) } : null }; }),
    providers: (providerRows.results || []).map((row) => ({ id: row.id, name: row.name, providerType: row.provider_type, serviceType: row.service_type, downloadMbps: Number(row.download_mbps), uploadMbps: Number(row.upload_mbps), dataCapMb: Number(row.data_cap_mb), monthlyCostCents: Number(row.monthly_cost_cents), currency: row.currency, rights: { multiUser: Boolean(row.multi_user_allowed), commercialUse: Boolean(row.commercial_use_allowed), resale: Boolean(row.resale_allowed), guestAccess: Boolean(row.guest_access_allowed), publicAccess: Boolean(row.public_access_allowed), multiTenant: Boolean(row.multi_tenant_allowed), dataPooling: Boolean(row.data_pooling_allowed) }, status: row.status, updatedAt: row.updated_at })),
    nodes: (nodeRows.results || []).map((row) => ({ id: row.id, name: row.name, locationId: row.location_id, adapterType: row.adapter_type, status: row.status, lastHeartbeatAt: row.last_heartbeat_at, capabilities: parseStoredJson(row.capabilities, []), updatedAt: row.updated_at })),
    policies: (policyRows.results || []).map((row) => ({ id: row.id, runtimeId: row.runtime_id, roomId: row.room_id, version: Number(row.version), status: row.status, payload: parseStoredJson(row.payload, {}), appliedAt: row.applied_at, removedAt: row.removed_at, updatedAt: row.updated_at })),
    edgeCommands: (commandRows.results || []).map((row) => ({ id: row.id, nodeId: row.node_id, runtimeId: row.runtime_id, policyId: row.policy_id, action: row.action, status: row.status, issuedAt: row.issued_at, expiresAt: row.expires_at, signatureAlgorithm: row.signature_algorithm, acknowledgedAt: row.acknowledged_at })),
    usageSamples: (usageRows.results || []).map((row) => ({ id: row.id, runtimeId: row.runtime_id, roomId: row.room_id, deviceId: row.device_id, bytesDown: Number(row.bytes_down), bytesUp: Number(row.bytes_up), downloadMbps: Number(row.download_mbps), uploadMbps: Number(row.upload_mbps), latencyMs: Number(row.latency_ms), jitterMs: Number(row.jitter_ms), packetLoss: Number(row.packet_loss), recordedAt: row.recorded_at })),
    sessions: (sessionRows.results || []).map((row) => ({ id: row.id, runtimeId: row.runtime_id, userId: row.user_id, deviceId: row.device_id, roomId: row.room_id, connectedAt: row.connected_at, disconnectedAt: row.disconnected_at, bytesDown: Number(row.bytes_down), bytesUp: Number(row.bytes_up), totalMb: Number(row.total_mb), terminationReason: row.termination_reason })),
    alerts: (alertRows.results || []).map((row) => ({ id: row.id, runtimeId: row.runtime_id, type: row.alert_type, severity: row.severity, status: row.status, message: row.message, payload: parseStoredJson(row.payload, {}), createdAt: row.created_at })),
    reports: (reportRows.results || []).map((row) => ({ id: row.id, runtimeId: row.runtime_id, eventId: row.event_id, programId: row.program_id, type: row.report_type, payload: parseStoredJson(row.payload, {}), generatedAt: row.generated_at })),
    walletSummary: { wallets: Number(walletSummary?.wallet_count || 0), creditsIssued: Number(walletSummary?.credits_issued || 0) },
    transactions: (transactionRows.results || []).map((row) => ({ id: row.id, poolId: row.pool_id, runtimeId: row.runtime_id, walletId: row.wallet_id, type: row.transaction_type, resourceType: row.resource_type, amountUnits: Number(row.amount_units), balanceAfter: row.balance_after == null ? null : Number(row.balance_after), actorId: row.actor_id, reason: row.reason, metadata: parseStoredJson(row.metadata, {}), createdAt: row.created_at })),
  };
}

async function signAirEdgeCommand(env, command) {
  const secret = String(env.AIR_EDGE_COMMAND_SIGNING_KEY || "").trim();
  if (!secret) throw new HttpError(503, "AIR edge command signing is not configured");
  const source = JSON.stringify({ id: command.id, nodeId: command.nodeId, runtimeId: command.runtimeId, policyId: command.policyId, action: command.action, issuedAt: command.issuedAt, expiresAt: command.expiresAt, nonce: command.nonce, payload: command.payload });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source)));
}

async function airEdgeCommand(env, tenantId, nodeId, runtimeId, policyId, action, payload, now) {
  const command = { id: `edge-cmd-${crypto.randomUUID()}`, nodeId, runtimeId, policyId, action, issuedAt: now, expiresAt: new Date(Date.parse(now) + 5 * 60_000).toISOString(), nonce: crypto.randomUUID(), payload };
  const signature = await signAirEdgeCommand(env, command);
  return env.DB.prepare("INSERT INTO network_edge_commands (id, tenant_id, node_id, runtime_id, policy_id, action, status, issued_at, expires_at, nonce, payload, signature, signature_algorithm) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 'HMAC-SHA256')")
    .bind(command.id, tenantId, nodeId, runtimeId || null, policyId || null, action, command.issuedAt, command.expiresAt, command.nonce, JSON.stringify(payload), signature);
}

async function executeAirConnectAction(env, tenantId, action, body, actorId, requestId) {
  const db = env.DB;
  const now = new Date().toISOString();
  const transaction = (values) => db.prepare("INSERT INTO air_resource_transactions (id, tenant_id, pool_id, runtime_id, wallet_id, transaction_type, resource_type, amount_units, balance_after, actor_id, reason, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(`air-tx-${crypto.randomUUID()}`, tenantId, values.poolId || null, values.runtimeId || null, values.walletId || null, values.type, values.resourceType, values.amount, values.balanceAfter ?? null, actorId, values.reason, JSON.stringify(values.metadata || {}), now);

  if (action === "register_provider") {
    const id = safeId(body.providerId, `air-provider-${crypto.randomUUID()}`).slice(0, 96);
    const rights = isPlainObject(body.rights) ? body.rights : {};
    const dataCapMb = airPositiveInteger(body.dataCapMb, 5_000_000);
    const downloadMbps = airPositiveInteger(body.downloadMbps, 2_000, 100_000);
    const uploadMbps = airPositiveInteger(body.uploadMbps, 1_000, 100_000);
    const monthlyCostCents = airPositiveInteger(body.monthlyCostCents, 150_000, 100_000_000);
    await db.prepare("INSERT INTO connectivity_providers (id, tenant_id, name, provider_type, account_reference, service_type, contract_start, contract_end, download_mbps, upload_mbps, data_cap_mb, monthly_cost_cents, currency, multi_user_allowed, commercial_use_allowed, resale_allowed, guest_access_allowed, public_access_allowed, multi_tenant_allowed, data_pooling_allowed, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)")
      .bind(id, tenantId, safeLabel(body.name, "AMX Business Internet").slice(0, 140), safeId(body.providerType, "business-internet").slice(0, 40), safeLabel(body.accountReference, "").slice(0, 120) || null, safeId(body.serviceType, "fiber").slice(0, 40), safeLabel(body.contractStart, now.slice(0, 10)).slice(0, 40), safeLabel(body.contractEnd, "").slice(0, 40) || null, downloadMbps, uploadMbps, dataCapMb, monthlyCostCents, safeId(body.currency, "USD").toUpperCase().slice(0, 3), rights.multiUser === true ? 1 : 0, rights.commercialUse === true ? 1 : 0, rights.resale === true ? 1 : 0, rights.guestAccess === true ? 1 : 0, rights.publicAccess === true ? 1 : 0, rights.multiTenant === true ? 1 : 0, rights.dataPooling === true ? 1 : 0, now, now).run();
    return { action, provider: { id, dataCapMb, downloadMbps, uploadMbps, monthlyCostCents, rights } };
  }

  if (action === "register_edge_node") {
    const id = safeId(body.nodeId, `air-edge-${crypto.randomUUID()}`).slice(0, 96);
    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.map((value) => safeId(value).slice(0, 48)).filter(Boolean) : ["qos", "vlan", "client-count", "usage-meter"];
    await db.prepare("INSERT INTO network_nodes (id, tenant_id, location_id, name, adapter_type, status, capabilities, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'registered', ?, ?, ?)")
      .bind(id, tenantId, safeId(body.locationId, "hub-001").slice(0, 96), safeLabel(body.name, "AMX Edge Gateway 001").slice(0, 140), safeId(body.adapterType, "generic-http").slice(0, 48), JSON.stringify(capabilities), now, now).run();
    return { action, node: { id, status: "registered", capabilities } };
  }

  if (action === "create_pool") {
    const totalUnits = airPositiveInteger(body.totalUnits, 5_000_000);
    const providerId = safeId(body.providerId).slice(0, 96);
    const provider = providerId ? await db.prepare("SELECT * FROM connectivity_providers WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1").bind(providerId, tenantId).first() : null;
    if (!provider) throw new HttpError(404, "An active connectivity provider contract is required");
    if (!provider.multi_user_allowed || !provider.commercial_use_allowed || !provider.data_pooling_allowed) throw new HttpError(409, "Provider contract does not allow multi-user commercial data pooling");
    if (totalUnits > Number(provider.data_cap_mb)) throw new HttpError(409, "Pool exceeds the provider contract data cap");
    const id = safeId(body.poolId, `air-pool-${crypto.randomUUID()}`).slice(0, 96);
    const name = safeLabel(body.name, "Community Connectivity Pool").slice(0, 120);
    await db.batch([
      db.prepare("INSERT INTO air_resource_pools (id, tenant_id, name, resource_type, total_units, available_units, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'DATA_MB', ?, ?, 'active', ?, ?, ?)").bind(id, tenantId, name, totalUnits, totalUnits, actorId, now, now),
      db.prepare("INSERT INTO connectivity_pool_profiles (pool_id, tenant_id, provider_id, location_id, download_capacity_mbps, upload_capacity_mbps, billing_period_start, billing_period_end, upstream_cost_cents, currency, contract_type, resale_allowed, community_access_allowed, guest_access_allowed, public_access_allowed, multi_tenant_allowed, data_pooling_allowed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, tenantId, providerId, safeId(body.locationId, "hub-001").slice(0, 96), Number(provider.download_mbps), Number(provider.upload_mbps), safeLabel(body.billingPeriodStart, now.slice(0, 10)).slice(0, 40), safeLabel(body.billingPeriodEnd, "").slice(0, 40) || null, Number(provider.monthly_cost_cents), provider.currency, safeId(body.contractType, "business").slice(0, 40), Number(provider.resale_allowed), 1, Number(provider.guest_access_allowed), Number(provider.public_access_allowed), Number(provider.multi_tenant_allowed), Number(provider.data_pooling_allowed), now, now),
      transaction({ poolId: id, type: "POOL_CREATED", resourceType: "DATA_MB", amount: totalUnits, balanceAfter: totalUnits, reason: "Community connectivity capacity provisioned" }),
    ]);
    return { action, pool: { id, tenantId, providerId, name, resourceType: "DATA_MB", totalUnits, availableUnits: totalUnits, downloadCapacityMbps: Number(provider.download_mbps), uploadCapacityMbps: Number(provider.upload_mbps), upstreamCostCents: Number(provider.monthly_cost_cents), status: "active", createdAt: now, updatedAt: now } };
  }

  if (action === "allocate_room") {
    const poolId = safeId(body.poolId).slice(0, 96);
    const pool = poolId ? await db.prepare("SELECT * FROM air_resource_pools WHERE id = ? AND tenant_id = ? LIMIT 1").bind(poolId, tenantId).first() : null;
    if (!pool || pool.status !== "active") throw new HttpError(404, "An active tenant resource pool is required");
    const allocationUnits = airPositiveInteger(body.allocationUnits, 250_000);
    if (allocationUnits > Number(pool.available_units)) throw new HttpError(409, "The pool does not have enough available capacity");
    const learnerCount = airPositiveInteger(body.learnerCount, 30, 500);
    const trainerCount = airPositiveInteger(body.trainerCount, 3, 100);
    const agentCount = airPositiveInteger(body.agentCount, 3, 25);
    const roomCode = safeId(body.roomCode, "ROOM-A").toUpperCase().slice(0, 64);
    const name = safeLabel(body.name, "Room A Community Learning Runtime").slice(0, 140);
    const id = safeId(body.runtimeId, `air-runtime-${crypto.randomUUID()}`).slice(0, 96);
    const providedLearners = Array.isArray(body.learnerIds) ? body.learnerIds.map((value) => safeId(value).slice(0, 96)).filter(Boolean) : [];
    const learnerIds = [...new Set(providedLearners)].slice(0, learnerCount);
    while (learnerIds.length < learnerCount) learnerIds.push(`${roomCode.toLowerCase()}-learner-${String(learnerIds.length + 1).padStart(3, "0")}`);
    const bandwidthMbps = airPositiveInteger(body.bandwidthMbps, 500, 10_000);
    const uploadLimitMbps = airPositiveInteger(body.uploadLimitMbps, 250, 10_000);
    const minGuaranteedMbps = airPositiveInteger(body.minGuaranteedMbps, 100, 10_000);
    const burstLimitMbps = airPositiveInteger(body.burstLimitMbps, 700, 10_000);
    const maxUsers = airPositiveInteger(body.maxUsers, learnerCount + trainerCount, 2_000);
    const maxDevices = airPositiveInteger(body.maxDevices, 40, 5_000);
    const edgeNodeId = safeId(body.edgeNodeId).slice(0, 96);
    if (edgeNodeId && !await db.prepare("SELECT id FROM network_nodes WHERE id = ? AND tenant_id = ? LIMIT 1").bind(edgeNodeId, tenantId).first()) throw new HttpError(404, "The selected edge node was not found");
    const videoProfile = ["audio-first", "360p", "540p", "720p", "1080p"].includes(body.videoProfile) ? body.videoProfile : "720p";
    const update = await db.prepare("UPDATE air_resource_pools SET available_units = available_units - ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'active' AND available_units >= ?").bind(allocationUnits, now, poolId, tenantId, allocationUnits).run();
    if (!update.meta?.changes) throw new HttpError(409, "Pool capacity changed; refresh before allocating the room");
    try {
      await db.batch([
        db.prepare("INSERT INTO air_room_runtimes (id, tenant_id, pool_id, room_code, name, allocation_units, consumed_units, learner_count, trainer_count, agent_count, learner_ids, bandwidth_mbps, video_profile, livekit_room, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'allocated', ?, ?, ?)").bind(id, tenantId, poolId, roomCode, name, allocationUnits, learnerCount, trainerCount, agentCount, JSON.stringify(learnerIds), bandwidthMbps, videoProfile, `air-${tenantId}-${roomCode}`.toLowerCase().slice(0, 120), actorId, now, now),
        db.prepare("INSERT INTO connectivity_container_profiles (runtime_id, tenant_id, room_id, event_id, program_id, reserved_mb, download_limit_mbps, upload_limit_mbps, min_guaranteed_mbps, burst_limit_mbps, max_users, max_devices, priority_class, starts_at, ends_at, auto_return_unused, edge_node_id, cost_payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, '{}', ?, ?)").bind(id, tenantId, roomCode, safeId(body.eventId).slice(0, 96) || null, safeId(body.programId).slice(0, 96) || null, bandwidthMbps, uploadLimitMbps, minGuaranteedMbps, burstLimitMbps, maxUsers, maxDevices, ["P0", "P1", "P2", "P3", "P4", "P5"].includes(body.priorityClass) ? body.priorityClass : "P1", safeLabel(body.startsAt, now).slice(0, 40), safeLabel(body.endsAt, new Date(Date.parse(now) + 3 * 60 * 60_000).toISOString()).slice(0, 40), edgeNodeId || null, now, now),
        transaction({ poolId, runtimeId: id, type: "ROOM_ALLOCATED", resourceType: "DATA_MB", amount: -allocationUnits, balanceAfter: Number(pool.available_units) - allocationUnits, reason: `${roomCode} capacity reserved`, metadata: { learnerCount, trainerCount, agentCount, bandwidthMbps, videoProfile } }),
      ]);
    } catch (error) {
      await db.prepare("UPDATE air_resource_pools SET available_units = available_units + ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(allocationUnits, now, poolId, tenantId).run().catch(() => undefined);
      throw error;
    }
    return { action, runtime: publicAirRuntime({ id, tenant_id: tenantId, pool_id: poolId, room_code: roomCode, name, allocation_units: allocationUnits, consumed_units: 0, learner_count: learnerCount, trainer_count: trainerCount, agent_count: agentCount, learner_ids: JSON.stringify(learnerIds), bandwidth_mbps: bandwidthMbps, video_profile: videoProfile, livekit_room: `air-${tenantId}-${roomCode}`.toLowerCase().slice(0, 120), status: "allocated", created_at: now, updated_at: now }) };
  }

  const runtimeId = safeId(body.runtimeId).slice(0, 96);
  const runtime = runtimeId ? await db.prepare("SELECT * FROM air_room_runtimes WHERE id = ? AND tenant_id = ? LIMIT 1").bind(runtimeId, tenantId).first() : null;
  if (!runtime) throw new HttpError(404, "Room runtime was not found");

  if (action === "start_room") {
    if (runtime.status !== "allocated") throw new HttpError(409, "Only an allocated room can be started");
    const profile = await db.prepare("SELECT * FROM connectivity_container_profiles WHERE runtime_id = ? AND tenant_id = ? LIMIT 1").bind(runtimeId, tenantId).first();
    if (!profile?.edge_node_id) throw new HttpError(409, "An edge node must be assigned before the room can start");
    const policyId = `net-policy-${crypto.randomUUID()}`;
    const policyVersion = Number(profile.policy_version || 0) + 1;
    const policy = { ssid: safeLabel(body.ssid, `AMX-${runtime.room_code}`).slice(0, 64), vlan: airPositiveInteger(body.vlan, 120, 4094), dataLimitMb: Number(runtime.allocation_units), downloadLimitMbps: Number(profile.download_limit_mbps), uploadLimitMbps: Number(profile.upload_limit_mbps), minGuaranteedMbps: Number(profile.min_guaranteed_mbps), burstLimitMbps: Number(profile.burst_limit_mbps), maxUsers: Number(profile.max_users), maxDevices: Number(profile.max_devices), priorityClass: profile.priority_class, applicationPriorities: { P0: ["emergency", "operator-control"], P1: ["voice", "livekit-audio"], P2: ["trainer-video", "livekit-video", "lms"], P3: ["web"], P4: ["downloads"], P5: ["background-updates"] }, peerToPeerBlocked: true, backgroundTrafficThrottled: true };
    const commandStatement = await airEdgeCommand(env, tenantId, profile.edge_node_id, runtimeId, policyId, "ACTIVATE_CONTAINER", policy, now);
    const start = await db.prepare("UPDATE air_room_runtimes SET status = 'active', started_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'allocated'").bind(now, now, runtimeId, tenantId).run();
    if (!start.meta?.changes) throw new HttpError(409, "The room runtime has already changed state");
    const dispatch = env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET ? await ensureLiveKitAgentDispatch(env, runtime.livekit_room, requestId) : { configured: false, dispatched: false };
    await db.batch([
      db.prepare("INSERT INTO network_policies (id, tenant_id, runtime_id, room_id, version, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)").bind(policyId, tenantId, runtimeId, runtime.room_code, policyVersion, JSON.stringify(policy), now, now),
      commandStatement,
      db.prepare("UPDATE connectivity_container_profiles SET network_policy_id = ?, policy_version = ?, admissions_open = 1, updated_at = ? WHERE runtime_id = ? AND tenant_id = ?").bind(policyId, policyVersion, now, runtimeId, tenantId),
      db.prepare("UPDATE air_room_runtimes SET livekit_dispatch = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(JSON.stringify(dispatch), now, runtimeId, tenantId),
      transaction({ poolId: runtime.pool_id, runtimeId, type: "ROOM_STARTED", resourceType: "DATA_MB", amount: 0, balanceAfter: Number(runtime.allocation_units), reason: "Live room runtime started", metadata: { livekitRoom: runtime.livekit_room, dispatch } }),
    ]);
    return { action, runtimeId, status: "active", networkStatus: "policy-pending-edge-ack", policyId, policyVersion, livekitRoom: runtime.livekit_room, dispatch, startedAt: now };
  }

  if (action === "resize_room") {
    if (!["allocated", "active"].includes(runtime.status)) throw new HttpError(409, "Only allocated or active rooms can be resized");
    const profile = await db.prepare("SELECT * FROM connectivity_container_profiles WHERE runtime_id = ? AND tenant_id = ? LIMIT 1").bind(runtimeId, tenantId).first();
    if (!profile) throw new HttpError(409, "The room does not have a v0.2 container profile");
    const allocationUnits = airPositiveInteger(body.allocationUnits, Number(runtime.allocation_units));
    if (allocationUnits < Number(runtime.consumed_units)) throw new HttpError(409, "Allocation cannot be lower than recorded consumption");
    const delta = allocationUnits - Number(runtime.allocation_units);
    const pool = await db.prepare("SELECT * FROM air_resource_pools WHERE id = ? AND tenant_id = ? LIMIT 1").bind(runtime.pool_id, tenantId).first();
    if (delta > Number(pool.available_units)) throw new HttpError(409, "The pool does not have enough capacity for this resize");
    const downloadLimitMbps = airPositiveInteger(body.bandwidthMbps, Number(profile.download_limit_mbps), 10_000);
    const uploadLimitMbps = airPositiveInteger(body.uploadLimitMbps, Number(profile.upload_limit_mbps), 10_000);
    const poolUpdate = delta >= 0
      ? db.prepare("UPDATE air_resource_pools SET available_units = available_units - ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND available_units >= ?").bind(delta, now, runtime.pool_id, tenantId, delta)
      : db.prepare("UPDATE air_resource_pools SET available_units = available_units + ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(-delta, now, runtime.pool_id, tenantId);
    const statements = [
      poolUpdate,
      db.prepare("UPDATE air_room_runtimes SET allocation_units = ?, bandwidth_mbps = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(allocationUnits, downloadLimitMbps, now, runtimeId, tenantId),
      db.prepare("UPDATE connectivity_container_profiles SET download_limit_mbps = ?, upload_limit_mbps = ?, updated_at = ? WHERE runtime_id = ? AND tenant_id = ?").bind(downloadLimitMbps, uploadLimitMbps, now, runtimeId, tenantId),
      transaction({ poolId: runtime.pool_id, runtimeId, type: delta >= 0 ? "ROOM_RESIZED" : "CAPACITY_RETURNED", resourceType: "DATA_MB", amount: -delta, balanceAfter: Number(pool.available_units) - delta, reason: "Active room entitlement resized", metadata: { allocationUnits, downloadLimitMbps, uploadLimitMbps } }),
    ];
    if (runtime.status === "active") statements.push(await airEdgeCommand(env, tenantId, profile.edge_node_id, runtimeId, profile.network_policy_id, "UPDATE_LIMITS", { allocationUnits, downloadLimitMbps, uploadLimitMbps }, now));
    await db.batch(statements);
    return { action, runtimeId, allocationUnits, downloadLimitMbps, uploadLimitMbps, edgeUpdateQueued: runtime.status === "active", updatedAt: now };
  }

  if (action === "record_usage") {
    if (runtime.status !== "active") throw new HttpError(409, "Usage can only be recorded for an active room");
    const consumedUnits = airPositiveInteger(body.consumedUnits, 1, Number(runtime.allocation_units));
    if (consumedUnits < Number(runtime.consumed_units)) throw new HttpError(409, "Meter readings cannot move backwards");
    const delta = consumedUnits - Number(runtime.consumed_units);
    const profile = await db.prepare("SELECT * FROM connectivity_container_profiles WHERE runtime_id = ? AND tenant_id = ? LIMIT 1").bind(runtimeId, tenantId).first();
    const downloadMbps = Math.max(0, Number(body.downloadMbps || 0));
    const uploadMbps = Math.max(0, Number(body.uploadMbps || 0));
    const latencyMs = Math.max(0, Number(body.latencyMs || 0));
    const jitterMs = Math.max(0, Number(body.jitterMs || 0));
    const packetLoss = Math.max(0, Number(body.packetLoss || 0));
    const statements = [
      db.prepare("INSERT INTO network_usage_samples (id, tenant_id, runtime_id, room_id, user_id, device_id, bytes_down, bytes_up, download_mbps, upload_mbps, latency_ms, jitter_ms, packet_loss, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(`usage-${crypto.randomUUID()}`, tenantId, runtimeId, runtime.room_code, safeId(body.userId).slice(0, 96) || null, safeId(body.deviceId, "room-meter").slice(0, 96), Math.max(0, Math.floor(Number(body.bytesDown || delta * 1024 * 1024))), Math.max(0, Math.floor(Number(body.bytesUp || 0))), downloadMbps, uploadMbps, latencyMs, jitterMs, packetLoss, now),
      db.prepare("INSERT INTO network_sessions (id, tenant_id, runtime_id, user_id, device_id, room_id, connected_at, bytes_down, bytes_up, total_mb) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET bytes_down = excluded.bytes_down, bytes_up = excluded.bytes_up, total_mb = excluded.total_mb").bind(`net-session:${runtimeId}:${safeId(body.deviceId, "room-meter").slice(0, 96)}`, tenantId, runtimeId, safeId(body.userId).slice(0, 96) || null, safeId(body.deviceId, "room-meter").slice(0, 96), runtime.room_code, now, Math.max(0, Math.floor(Number(body.bytesDown || consumedUnits * 1024 * 1024))), Math.max(0, Math.floor(Number(body.bytesUp || 0))), consumedUnits),
      db.prepare("UPDATE air_room_runtimes SET consumed_units = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'active'").bind(consumedUnits, now, runtimeId, tenantId),
      transaction({ poolId: runtime.pool_id, runtimeId, type: "USAGE_RECORDED", resourceType: "DATA_MB", amount: -delta, balanceAfter: Number(runtime.allocation_units) - consumedUnits, reason: "Room meter reading recorded", metadata: { consumedUnits } }),
    ];
    if (profile && (downloadMbps > Number(profile.download_limit_mbps) * 0.8 || latencyMs > 120 || packetLoss > 2 || Number(runtime.allocation_units) - consumedUnits < Number(runtime.allocation_units) * 0.1)) statements.push(db.prepare("INSERT INTO network_alerts (id, tenant_id, runtime_id, node_id, alert_type, severity, status, message, payload, created_at) VALUES (?, ?, ?, ?, 'adaptive-capacity', ?, 'open', ?, ?, ?)").bind(`net-alert-${crypto.randomUUID()}`, tenantId, runtimeId, profile.edge_node_id || null, packetLoss > 2 || latencyMs > 120 ? "high" : "medium", "Room network is approaching a policy or quality threshold", JSON.stringify({ downloadMbps, latencyMs, packetLoss, remainingUnits: Number(runtime.allocation_units) - consumedUnits, recommendation: "Review P4/P5 throttling or resize the room container" }), now));
    await db.batch(statements);
    return { action, runtimeId, consumedUnits, remainingUnits: Number(runtime.allocation_units) - consumedUnits, updatedAt: now };
  }

  if (action === "close_room") {
    if (runtime.status !== "active") throw new HttpError(409, "Only an active room can be closed");
    const claim = await db.prepare("UPDATE air_room_runtimes SET status = 'closing', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'active'").bind(now, runtimeId, tenantId).run();
    if (!claim.meta?.changes) throw new HttpError(409, "The room runtime is already being closed");
    const unusedUnits = Math.max(0, Number(runtime.allocation_units) - Number(runtime.consumed_units));
    const learnerIds = parseStoredJson(runtime.learner_ids, []);
    const rewardUnits = airPositiveInteger(body.rewardUnits, 100, 100_000);
    const profile = await db.prepare("SELECT * FROM connectivity_container_profiles WHERE runtime_id = ? AND tenant_id = ? LIMIT 1").bind(runtimeId, tenantId).first();
    const poolProfile = await db.prepare("SELECT * FROM connectivity_pool_profiles WHERE pool_id = ? AND tenant_id = ? LIMIT 1").bind(runtime.pool_id, tenantId).first();
    const pool = await db.prepare("SELECT total_units FROM air_resource_pools WHERE id = ? AND tenant_id = ? LIMIT 1").bind(runtime.pool_id, tenantId).first();
    const costCents = poolProfile ? Math.round(Number(runtime.consumed_units) / Math.max(1, Number(pool?.total_units || 1)) * Number(poolProfile.upstream_cost_cents)) : 0;
    const report = { runtimeId, tenantId, roomCode: runtime.room_code, status: "closed", learners: Number(runtime.learner_count), trainers: Number(runtime.trainer_count), agents: Number(runtime.agent_count), allocationUnits: Number(runtime.allocation_units), consumedUnits: Number(runtime.consumed_units), returnedUnits: unusedUnits, utilizationPercent: Math.round(Number(runtime.consumed_units) / Math.max(1, Number(runtime.allocation_units)) * 10_000) / 100, cost: { currency: poolProfile?.currency || "USD", connectivityCents: costCents, perLearnerCents: Math.round(costCents / Math.max(1, Number(runtime.learner_count))), perGbCents: Math.round(costCents / Math.max(1, Number(runtime.consumed_units) / 1000)) }, airCreditsPerLearner: rewardUnits, totalAirCreditsIssued: learnerIds.length * rewardUnits, livekitRoom: runtime.livekit_room, networkPolicyId: profile?.network_policy_id || null, privacy: { browsingHistoryCollected: false, aggregateUsageOnly: true }, startedAt: runtime.started_at, endedAt: now };
    const statements = [
      db.prepare("UPDATE air_resource_pools SET available_units = available_units + ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(unusedUnits, now, runtime.pool_id, tenantId),
      db.prepare("UPDATE air_room_runtimes SET status = 'closed', report_payload = ?, ended_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'closing'").bind(JSON.stringify(report), now, now, runtimeId, tenantId),
      db.prepare("UPDATE connectivity_container_profiles SET admissions_open = 0, cost_payload = ?, updated_at = ? WHERE runtime_id = ? AND tenant_id = ?").bind(JSON.stringify(report.cost), now, runtimeId, tenantId),
      db.prepare("UPDATE network_sessions SET disconnected_at = ?, termination_reason = 'room-closed' WHERE runtime_id = ? AND tenant_id = ? AND disconnected_at IS NULL").bind(now, runtimeId, tenantId),
      db.prepare("INSERT INTO connectivity_reports (id, tenant_id, runtime_id, event_id, program_id, report_type, payload, generated_at) VALUES (?, ?, ?, ?, ?, 'room-close', ?, ?)").bind(`air-report-${crypto.randomUUID()}`, tenantId, runtimeId, profile?.event_id || null, profile?.program_id || null, JSON.stringify(report), now),
      transaction({ poolId: runtime.pool_id, runtimeId, type: "CAPACITY_RETURNED", resourceType: "DATA_MB", amount: unusedUnits, reason: "Unused room capacity returned to community pool", metadata: { consumedUnits: Number(runtime.consumed_units) } }),
    ];
    if (profile?.edge_node_id && profile?.network_policy_id) {
      statements.push(await airEdgeCommand(env, tenantId, profile.edge_node_id, runtimeId, profile.network_policy_id, "REMOVE_POLICY", { stopAdmissions: true, closeLiveKitRoom: runtime.livekit_room }, now));
      statements.push(db.prepare("UPDATE network_policies SET status = 'removal-pending', updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, profile.network_policy_id, tenantId));
    }
    for (const learnerId of learnerIds) {
      const walletId = `air-wallet-${tenantId}-${learnerId}`.slice(0, 180);
      statements.push(db.prepare("INSERT INTO air_resource_wallets (id, tenant_id, owner_type, owner_id, resource_type, available_units, reserved_units, consumed_units, updated_at) VALUES (?, ?, 'member', ?, 'AIR_CREDIT', ?, 0, 0, ?) ON CONFLICT(tenant_id, owner_type, owner_id, resource_type) DO UPDATE SET available_units = air_resource_wallets.available_units + excluded.available_units, updated_at = excluded.updated_at").bind(walletId, tenantId, learnerId, rewardUnits, now));
      statements.push(transaction({ runtimeId, walletId, type: "LEARNER_REWARD", resourceType: "AIR_CREDIT", amount: rewardUnits, reason: "Room Runtime completion reward", metadata: { learnerId, roomCode: runtime.room_code } }));
    }
    try { await db.batch(statements); }
    catch (error) {
      await db.prepare("UPDATE air_room_runtimes SET status = 'active', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'closing'").bind(now, runtimeId, tenantId).run().catch(() => undefined);
      throw error;
    }
    return { action, runtimeId, status: "closed", report };
  }

  throw new HttpError(400, "Unsupported AIR Connect action");
}

async function initialize(db) {
  if (!db) return;
  if (!databaseInitialization) databaseInitialization = db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS proof_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, learner_id TEXT NOT NULL, mission_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS proof_tenant_idx ON proof_records (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, event_name TEXT NOT NULL, mission_id TEXT, campaign_id TEXT, location_tag TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS analytics_tenant_idx ON analytics_events (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS skill_pods (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS pod_invites (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, owner_token_hash TEXT NOT NULL, tenant_id TEXT NOT NULL, tenant_name TEXT NOT NULL, tenant_color TEXT NOT NULL, pod_id TEXT NOT NULL, room_code TEXT NOT NULL, mission_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, host_name TEXT NOT NULL, guest_role TEXT NOT NULL, max_uses INTEGER NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS pod_invite_zkodes (invite_id TEXT PRIMARY KEY, zkode_hash TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS pod_invites_lookup_idx ON pod_invites (token, status, expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS pod_invites_pod_idx ON pod_invites (tenant_id, pod_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS media_objects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, owner_user_id TEXT, visibility TEXT NOT NULL DEFAULT 'private', purpose TEXT, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS media_tenant_idx ON media_objects (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL, transport TEXT NOT NULL, content_kind TEXT NOT NULL, attachment_count INTEGER NOT NULL, status TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS agent_runs_tenant_idx ON agent_runs (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_issues (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, visibility TEXT NOT NULL, source TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT, member_id TEXT, partner_id TEXT, run_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS board_issues_tenant_idx ON board_issues (tenant_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS board_issues_public_idx ON board_issues (visibility, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sim_live_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, issue_id TEXT, mission_id TEXT, room_code TEXT, mode TEXT NOT NULL, status TEXT NOT NULL, visibility TEXT NOT NULL, member_id TEXT, partner_id TEXT, agent_id TEXT, summary TEXT NOT NULL, payload TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sim_live_runs_tenant_idx ON sim_live_runs (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS geo_anchors (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, room_code TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS geo_anchors_room_idx ON geo_anchors (tenant_id, room_code, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS digital_twin_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, twin_id TEXT NOT NULL, room_code TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS digital_twin_room_idx ON digital_twin_events (tenant_id, room_code, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS data_center_telemetry (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, adapter TEXT NOT NULL, source_system TEXT NOT NULL, observed_at TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS data_center_telemetry_tenant_idx ON data_center_telemetry (tenant_id, observed_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_learning_state (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, learner_id TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS project_learning_lookup_idx ON project_learning_state (tenant_id, project_id, learner_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS stage_workflows (tenant_id TEXT NOT NULL, room_code TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (tenant_id, room_code))"),
    db.prepare("CREATE INDEX IF NOT EXISTS stage_workflows_updated_idx ON stage_workflows (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_orders (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, event_id TEXT, status TEXT NOT NULL, currency TEXT NOT NULL, total_cents INTEGER NOT NULL, checkout_url TEXT, printful_order_id TEXT, tracking_url TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS merch_orders_member_idx ON merch_orders (tenant_id, member_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_revenue_allocations (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, beneficiary_type TEXT NOT NULL, beneficiary_id TEXT NOT NULL, share_basis_points INTEGER NOT NULL, amount_cents INTEGER, status TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS merch_allocations_order_idx ON merch_revenue_allocations (tenant_id, order_id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_webhook_events (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, event_type TEXT NOT NULL, store_id TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS merch_webhook_order_idx ON merch_webhook_events (order_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_payout_profiles (tenant_id TEXT NOT NULL, beneficiary_type TEXT NOT NULL, beneficiary_id TEXT NOT NULL, display_name TEXT NOT NULL, contact_email TEXT, stripe_account_id TEXT NOT NULL UNIQUE, onboarding_status TEXT NOT NULL, details_submitted INTEGER NOT NULL DEFAULT 0, charges_enabled INTEGER NOT NULL DEFAULT 0, payouts_enabled INTEGER NOT NULL DEFAULT 0, requirements_due TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, beneficiary_type, beneficiary_id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS merch_payout_profiles_tenant_idx ON merch_payout_profiles (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_payout_transfers (id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL UNIQUE, order_id TEXT NOT NULL, tenant_id TEXT NOT NULL, beneficiary_type TEXT NOT NULL, beneficiary_id TEXT NOT NULL, stripe_account_id TEXT NOT NULL, stripe_transfer_id TEXT UNIQUE, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, failure_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS merch_payout_transfers_tenant_idx ON merch_payout_transfers (tenant_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS merch_connect_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, stripe_object_id TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS membership_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL, stripe_customer_id TEXT, stripe_subscription_id TEXT UNIQUE, stripe_checkout_session_id TEXT UNIQUE, current_period_end TEXT, cancel_at_period_end INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS membership_subscriptions_member_idx ON membership_subscriptions (tenant_id, member_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS membership_webhook_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, stripe_object_id TEXT, payload TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS air_resource_pools (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, resource_type TEXT NOT NULL, total_units INTEGER NOT NULL, available_units INTEGER NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_resource_pools_tenant_idx ON air_resource_pools (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS air_room_runtimes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, pool_id TEXT NOT NULL, room_code TEXT NOT NULL, name TEXT NOT NULL, allocation_units INTEGER NOT NULL, consumed_units INTEGER NOT NULL DEFAULT 0, learner_count INTEGER NOT NULL, trainer_count INTEGER NOT NULL, agent_count INTEGER NOT NULL DEFAULT 1, learner_ids TEXT NOT NULL DEFAULT '[]', bandwidth_mbps INTEGER NOT NULL, video_profile TEXT NOT NULL, livekit_room TEXT NOT NULL, livekit_dispatch TEXT, status TEXT NOT NULL, report_payload TEXT, started_at TEXT, ended_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_room_runtimes_tenant_idx ON air_room_runtimes (tenant_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_room_runtimes_pool_idx ON air_room_runtimes (pool_id, status)"),
    db.prepare("CREATE TABLE IF NOT EXISTS air_resource_wallets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, owner_type TEXT NOT NULL, owner_id TEXT NOT NULL, resource_type TEXT NOT NULL, available_units INTEGER NOT NULL DEFAULT 0, reserved_units INTEGER NOT NULL DEFAULT 0, consumed_units INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, UNIQUE (tenant_id, owner_type, owner_id, resource_type))"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_resource_wallets_tenant_idx ON air_resource_wallets (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS air_resource_transactions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, pool_id TEXT, runtime_id TEXT, wallet_id TEXT, transaction_type TEXT NOT NULL, resource_type TEXT NOT NULL, amount_units INTEGER NOT NULL, balance_after INTEGER, actor_id TEXT NOT NULL, reason TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_resource_transactions_tenant_idx ON air_resource_transactions (tenant_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS air_resource_transactions_runtime_idx ON air_resource_transactions (runtime_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connectivity_providers (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, provider_type TEXT NOT NULL, account_reference TEXT, service_type TEXT NOT NULL, contract_start TEXT, contract_end TEXT, download_mbps INTEGER NOT NULL, upload_mbps INTEGER NOT NULL, data_cap_mb INTEGER NOT NULL, monthly_cost_cents INTEGER NOT NULL, currency TEXT NOT NULL, multi_user_allowed INTEGER NOT NULL DEFAULT 0, commercial_use_allowed INTEGER NOT NULL DEFAULT 0, resale_allowed INTEGER NOT NULL DEFAULT 0, guest_access_allowed INTEGER NOT NULL DEFAULT 0, public_access_allowed INTEGER NOT NULL DEFAULT 0, multi_tenant_allowed INTEGER NOT NULL DEFAULT 0, data_pooling_allowed INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS connectivity_providers_tenant_idx ON connectivity_providers (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connectivity_pool_profiles (pool_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, provider_id TEXT NOT NULL, location_id TEXT NOT NULL, download_capacity_mbps INTEGER NOT NULL, upload_capacity_mbps INTEGER NOT NULL, billing_period_start TEXT, billing_period_end TEXT, upstream_cost_cents INTEGER NOT NULL, currency TEXT NOT NULL, contract_type TEXT NOT NULL, resale_allowed INTEGER NOT NULL DEFAULT 0, community_access_allowed INTEGER NOT NULL DEFAULT 0, guest_access_allowed INTEGER NOT NULL DEFAULT 0, public_access_allowed INTEGER NOT NULL DEFAULT 0, multi_tenant_allowed INTEGER NOT NULL DEFAULT 0, data_pooling_allowed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_nodes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, location_id TEXT NOT NULL, name TEXT NOT NULL, adapter_type TEXT NOT NULL, status TEXT NOT NULL, last_heartbeat_at TEXT, capabilities TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_nodes_tenant_idx ON network_nodes (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_policies (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, room_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, applied_at TEXT, removed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_policies_runtime_idx ON network_policies (tenant_id, runtime_id, version)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connectivity_container_profiles (runtime_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, room_id TEXT NOT NULL, event_id TEXT, program_id TEXT, reserved_mb INTEGER NOT NULL DEFAULT 0, download_limit_mbps INTEGER NOT NULL, upload_limit_mbps INTEGER NOT NULL, min_guaranteed_mbps INTEGER NOT NULL, burst_limit_mbps INTEGER NOT NULL, max_users INTEGER NOT NULL, max_devices INTEGER NOT NULL, priority_class TEXT NOT NULL, starts_at TEXT, ends_at TEXT, auto_return_unused INTEGER NOT NULL DEFAULT 1, network_policy_id TEXT, edge_node_id TEXT, policy_version INTEGER NOT NULL DEFAULT 0, admissions_open INTEGER NOT NULL DEFAULT 0, cost_payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS connectivity_container_profiles_tenant_idx ON connectivity_container_profiles (tenant_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_edge_commands (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, node_id TEXT NOT NULL, runtime_id TEXT, policy_id TEXT, action TEXT NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, nonce TEXT NOT NULL, payload TEXT NOT NULL, signature TEXT NOT NULL, signature_algorithm TEXT NOT NULL, acknowledged_at TEXT, acknowledgement_payload TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_edge_commands_node_idx ON network_edge_commands (tenant_id, node_id, status, issued_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_usage_samples (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, room_id TEXT NOT NULL, user_id TEXT, device_id TEXT, bytes_down INTEGER NOT NULL, bytes_up INTEGER NOT NULL, download_mbps REAL NOT NULL, upload_mbps REAL NOT NULL, latency_ms REAL NOT NULL, jitter_ms REAL NOT NULL, packet_loss REAL NOT NULL, recorded_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_usage_samples_runtime_idx ON network_usage_samples (tenant_id, runtime_id, recorded_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_sessions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL, user_id TEXT, device_id TEXT NOT NULL, room_id TEXT NOT NULL, connected_at TEXT NOT NULL, disconnected_at TEXT, bytes_down INTEGER NOT NULL DEFAULT 0, bytes_up INTEGER NOT NULL DEFAULT 0, total_mb INTEGER NOT NULL DEFAULT 0, termination_reason TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_sessions_runtime_idx ON network_sessions (tenant_id, runtime_id, connected_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS allocation_rules (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, rule_payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS network_alerts (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT, node_id TEXT, alert_type TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS network_alerts_tenant_idx ON network_alerts (tenant_id, status, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connectivity_reports (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, runtime_id TEXT NOT NULL UNIQUE, event_id TEXT, program_id TEXT, report_type TEXT NOT NULL, payload TEXT NOT NULL, generated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS connectivity_reports_tenant_idx ON connectivity_reports (tenant_id, generated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS api_rate_limits (bucket_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL, expires_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS api_rate_limits_expiry_idx ON api_rate_limits (expires_at)"),
  ]).catch((error) => {
    databaseInitialization = undefined;
    throw error;
  });
  await databaseInitialization;
}

async function handleApi(request, env, url, requestId) {
  const reply = (data, status = 200, headers = {}) => json(data, status, requestId, headers);
  if (!await allowRequest(request, env)) return reply({ error: "Rate limit exceeded", requestId }, 429, { "Retry-After": "60" });
  const member = !publicApiRequest(request, url) ? await verifyMemberRequest(request, env, requiredMemberRoles(url)) : null;
  if (url.pathname.startsWith("/api/board/agent/")) {
    const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!env.AMX_AGENT_CONTROL_TOKEN) return reply({ error: "Agent board control is not configured", requestId }, 503);
    if (!await matchesSecret(token, String(env.AMX_AGENT_CONTROL_TOKEN))) return reply({ error: "Agent board authorization failed", requestId }, 401);
    if (!env.DB) return reply({ error: "Board storage is not configured", requestId }, 503);
    await initialize(env.DB);
    if (request.method === "GET" && url.pathname === "/api/board/agent/feed") {
      const tenantId = safeId(url.searchParams.get("tenantId")).slice(0, 64);
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      const issueRows = await env.DB.prepare("SELECT id, tenant_id, title, description, status, priority, visibility, source, actor_type, member_id, partner_id, run_id, created_at, updated_at FROM board_issues WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100").bind(tenantId).all();
      const runRows = await env.DB.prepare("SELECT id, tenant_id, issue_id, mission_id, room_code, mode, status, visibility, member_id, partner_id, agent_id, summary, started_at, updated_at FROM sim_live_runs WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100").bind(tenantId).all();
      return reply({ issues: issueRows.results || [], runs: runRows.results || [], persisted: true, visibility: "tenant", requestId }, 200, { "Cache-Control": "no-store" });
    }
    if (request.method === "GET" && url.pathname === "/api/board/agent/air-connect/state") {
      const tenantId = safeId(url.searchParams.get("tenantId")).slice(0, 64);
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      return reply({ ...(await airConnectState(env.DB, tenantId)), persisted: true, requestId }, 200, { "Cache-Control": "no-store" });
    }
    const body = await readJson(request, 64 * 1024);
    const tenantId = safeId(body.tenantId).slice(0, 64);
    if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
    if (request.method === "POST" && url.pathname === "/api/board/agent/verify-zkode") {
      const expectedHash = String(env.AMX_AGENT_OPERATOR_ZKODE_HASH || "").trim().toLowerCase();
      if (!expectedHash) return reply({ error: "Operator ZKODE verification is not configured", requestId }, 503);
      const zkode = String(body.zkode || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(zkode)) return reply({ verified: false, error: "ZKODE format is invalid", requestId }, 400);
      const verified = await matchesSecret(await sha256(zkode), expectedHash);
      logEvent(verified ? "info" : "warn", "board.zkode_verification", { requestId, tenantId, verified, source: safeId(body.source, "voice-agent") });
      return reply({ verified, tenantId, requestId }, verified ? 200 : 403, { "Cache-Control": "no-store" });
    }
    if (request.method === "POST" && url.pathname === "/api/board/agent/air-connect/actions") {
      if (body.operatorApproved !== true) return reply({ error: "Explicit operator approval is required for AIR Connect mutations", requestId }, 403);
      const action = safeId(body.action).slice(0, 40);
      const result = await executeAirConnectAction(env, tenantId, action, body, safeId(body.actorId, "zero").slice(0, 96), requestId);
      logEvent("info", "air_connect.agent_action", { requestId, tenantId, action, actorId: safeId(body.actorId, "zero") });
      return reply({ ...result, requestId }, action === "create_pool" || action === "allocate_room" ? 201 : 200, { "Cache-Control": "no-store" });
    }
    const visibility = body.visibility === "public" ? "public" : "private";
    if (visibility === "public" && body.operatorApproved !== true) return reply({ error: "Explicit operator approval is required for public board publishing", requestId }, 403);
    const now = new Date().toISOString();
    if (request.method === "POST" && url.pathname === "/api/board/agent/issues") {
      const id = safeId(body.id, `issue-${crypto.randomUUID()}`).slice(0, 96);
      const title = safeLabel(body.title).slice(0, 180);
      if (!title) return reply({ error: "title is required", requestId }, 400);
      const priority = ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal";
      const status = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"].includes(body.status) ? body.status : "todo";
      await env.DB.prepare("INSERT INTO board_issues (id, tenant_id, title, description, status, priority, visibility, source, actor_type, actor_id, member_id, partner_id, run_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, tenantId, title, safeLabel(body.description).slice(0, 4000), status, priority, visibility, safeId(body.source, "voice-agent").slice(0, 64), safeId(body.actorType, "agent").slice(0, 32), safeId(body.actorId).slice(0, 96) || null, safeId(body.memberId).slice(0, 96) || null, safeId(body.partnerId).slice(0, 96) || null, safeId(body.runId).slice(0, 96) || null, now, now).run();
      return reply({ issue: { id, tenantId, title, status, priority, visibility, updatedAt: now }, requestId }, 201, { "Cache-Control": "no-store" });
    }
    if (request.method === "POST" && url.pathname === "/api/board/agent/runs") {
      const id = safeId(body.id, `run-${crypto.randomUUID()}`).slice(0, 96);
      const mode = body.mode === "live" ? "live" : "simulation";
      const status = ["scheduled", "ready", "running", "blocked", "complete", "cancelled"].includes(body.status) ? body.status : "running";
      const summary = safeLabel(body.summary).slice(0, 1000);
      await env.DB.prepare("INSERT INTO sim_live_runs (id, tenant_id, issue_id, mission_id, room_code, mode, status, visibility, member_id, partner_id, agent_id, summary, payload, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, summary = excluded.summary, payload = excluded.payload, visibility = excluded.visibility, updated_at = excluded.updated_at").bind(id, tenantId, safeId(body.issueId).slice(0, 96) || null, safeId(body.missionId).slice(0, 96) || null, safeId(body.roomCode).slice(0, 96) || null, mode, status, visibility, safeId(body.memberId).slice(0, 96) || null, safeId(body.partnerId).slice(0, 96) || null, safeId(body.agentId, "jaz").slice(0, 96), summary, JSON.stringify(isPlainObject(body.payload) ? body.payload : {}), safeLabel(body.startedAt, now).slice(0, 40), now).run();
      return reply({ run: { id, tenantId, mode, status, visibility, summary, updatedAt: now }, requestId }, 201, { "Cache-Control": "no-store" });
    }
    const issueMatch = url.pathname.match(/^\/api\/board\/agent\/issues\/([^/]+)$/);
    if (request.method === "PATCH" && issueMatch) {
      const id = safeId(decodeURIComponent(issueMatch[1])).slice(0, 96);
      const status = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"].includes(body.status) ? body.status : "";
      if (!id || !status) return reply({ error: "A valid issue id and status are required", requestId }, 400);
      const result = await env.DB.prepare("UPDATE board_issues SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(status, now, id, tenantId).run();
      if (!result.meta?.changes) return reply({ error: "Issue not found", requestId }, 404);
      return reply({ issue: { id, tenantId, status, updatedAt: now }, requestId }, 200, { "Cache-Control": "no-store" });
    }
    return reply({ error: "Not found", requestId }, 404);
  }
  if (url.pathname.startsWith("/api/air-connect")) {
    if (!env.DB) return reply({ error: "AIR Connect storage is not configured", requestId }, 503);
    await initialize(env.DB);
    if (url.pathname.startsWith("/api/air-connect/edge/")) {
      const token = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!env.AIR_EDGE_NODE_TOKEN) return reply({ error: "AIR edge authentication is not configured", requestId }, 503);
      if (!await matchesSecret(token, String(env.AIR_EDGE_NODE_TOKEN))) return reply({ error: "AIR edge authorization failed", requestId }, 401);
      const body = request.method === "POST" ? await readJson(request, 64 * 1024) : {};
      const tenantId = safeId(body.tenantId || url.searchParams.get("tenantId")).slice(0, 64);
      const nodeId = safeId(body.nodeId || url.searchParams.get("nodeId")).slice(0, 96);
      if (!tenantId || !nodeId) return reply({ error: "tenantId and nodeId are required", requestId }, 400);
      const node = await env.DB.prepare("SELECT * FROM network_nodes WHERE id = ? AND tenant_id = ? LIMIT 1").bind(nodeId, tenantId).first();
      if (!node) return reply({ error: "Edge node was not found", requestId }, 404);
      const now = new Date().toISOString();
      if (request.method === "POST" && url.pathname === "/api/air-connect/edge/heartbeat") {
        await env.DB.prepare("UPDATE network_nodes SET status = 'online', last_heartbeat_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?").bind(now, now, nodeId, tenantId).run();
        return reply({ nodeId, status: "online", heartbeatAt: now, requestId }, 200, { "Cache-Control": "no-store" });
      }
      if (request.method === "GET" && url.pathname === "/api/air-connect/edge/commands") {
        const rows = await env.DB.prepare("SELECT * FROM network_edge_commands WHERE tenant_id = ? AND node_id = ? AND status = 'pending' AND expires_at > ? ORDER BY issued_at ASC LIMIT 20").bind(tenantId, nodeId, now).all();
        return reply({ commands: (rows.results || []).map((row) => ({ id: row.id, nodeId: row.node_id, runtimeId: row.runtime_id, policyId: row.policy_id, action: row.action, issuedAt: row.issued_at, expiresAt: row.expires_at, nonce: row.nonce, payload: parseStoredJson(row.payload, {}), signature: row.signature, signatureAlgorithm: row.signature_algorithm })), requestId }, 200, { "Cache-Control": "no-store" });
      }
      const acknowledgement = url.pathname.match(/^\/api\/air-connect\/edge\/commands\/([^/]+)\/ack$/);
      if (request.method === "POST" && acknowledgement) {
        const commandId = safeId(decodeURIComponent(acknowledgement[1])).slice(0, 120);
        const status = body.applied === false ? "failed" : "acknowledged";
        const command = await env.DB.prepare("SELECT * FROM network_edge_commands WHERE id = ? AND tenant_id = ? AND node_id = ? LIMIT 1").bind(commandId, tenantId, nodeId).first();
        if (!command) return reply({ error: "Edge command was not found", requestId }, 404);
        const statements = [env.DB.prepare("UPDATE network_edge_commands SET status = ?, acknowledged_at = ?, acknowledgement_payload = ? WHERE id = ? AND tenant_id = ? AND node_id = ? AND status = 'pending'").bind(status, now, JSON.stringify(isPlainObject(body.acknowledgement) ? body.acknowledgement : {}), commandId, tenantId, nodeId)];
        if (command.policy_id && status === "acknowledged") statements.push(env.DB.prepare(`UPDATE network_policies SET status = ?, ${command.action === "REMOVE_POLICY" ? "removed_at" : "applied_at"} = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`).bind(command.action === "REMOVE_POLICY" ? "removed" : "applied", now, now, command.policy_id, tenantId));
        await env.DB.batch(statements);
        return reply({ commandId, status, acknowledgedAt: now, requestId }, 200, { "Cache-Control": "no-store" });
      }
      if (request.method === "POST" && url.pathname === "/api/air-connect/edge/usage") {
        const result = await executeAirConnectAction(env, tenantId, "record_usage", body, `edge:${nodeId}`, requestId);
        return reply({ ...result, requestId }, 202, { "Cache-Control": "no-store" });
      }
      return reply({ error: "Not found", requestId }, 404);
    }
    if (request.method === "GET" && url.pathname === "/api/air-connect/state") {
      const tenantId = safeId(url.searchParams.get("tenantId")).slice(0, 64);
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      await verifyTenantAccess(member, env, tenantId);
      return reply({ ...(await airConnectState(env.DB, tenantId)), persisted: true, requestId }, 200, { "Cache-Control": "no-store" });
    }
    if (request.method === "POST" && url.pathname === "/api/air-connect/actions") {
      const body = await readJson(request, 64 * 1024);
      const tenantId = safeId(body.tenantId).slice(0, 64);
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      if (body.operatorApproved !== true) return reply({ error: "Explicit operator approval is required for AIR Connect mutations", requestId }, 403);
      await verifyTenantAccess(member, env, tenantId);
      const action = safeId(body.action).slice(0, 40);
      const actorId = safeId(member?.profile?.id || member?.user?.id, "local-operator").slice(0, 96);
      const result = await executeAirConnectAction(env, tenantId, action, body, actorId, requestId);
      logEvent("info", "air_connect.operator_action", { requestId, tenantId, action, actorId });
      return reply({ ...result, requestId }, action === "create_pool" || action === "allocate_room" ? 201 : 200, { "Cache-Control": "no-store" });
    }
    return reply({ error: "Not found", requestId }, 404);
  }
  if (request.method === "GET" && ["/api/board/feed", "/api/board/public/feed"].includes(url.pathname)) {
    if (!env.DB) return reply({ issues: [], runs: [], persisted: false, requestId }, 200, { "Cache-Control": "no-store" });
    const tenantId = safeId(url.searchParams.get("tenantId")).slice(0, 64);
    if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
    const isPublic = url.pathname.includes("/public/");
    if (!isPublic) await verifyTenantAccess(member, env, tenantId);
    await initialize(env.DB);
    const scope = isPublic ? " AND visibility = 'public'" : "";
    const issueRows = await env.DB.prepare(`SELECT id, tenant_id, title, ${isPublic ? "''" : "description"} AS description, status, priority, visibility, source, actor_type, ${isPublic ? "NULL" : "member_id"} AS member_id, ${isPublic ? "NULL" : "partner_id"} AS partner_id, run_id, created_at, updated_at FROM board_issues WHERE tenant_id = ?${scope} ORDER BY updated_at DESC LIMIT 100`).bind(tenantId).all();
    const runRows = await env.DB.prepare(`SELECT id, tenant_id, issue_id, mission_id, room_code, mode, status, visibility, ${isPublic ? "NULL" : "member_id"} AS member_id, ${isPublic ? "NULL" : "partner_id"} AS partner_id, agent_id, summary, started_at, updated_at FROM sim_live_runs WHERE tenant_id = ?${scope} ORDER BY updated_at DESC LIMIT 100`).bind(tenantId).all();
    return reply({ issues: issueRows.results || [], runs: runRows.results || [], persisted: true, visibility: isPublic ? "public" : "tenant", requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "GET" && url.pathname === "/api/h3at/control-plane") {
    const configured = Boolean(String(env["AMX-HUBS-CONNECT"] || env.AMX_HUBS_CONNECT_API_KEY || "").trim());
    return reply({ configured, connected: configured, tenantId: "h3at-solutions", allowedActions: ["page.read", "page.navigate", "content.present", "vision.inspect", "tool.invoke", "proof.write"], lastCommand: null }, configured ? 200 : 503, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/h3at/control-plane/commands") {
    const configured = Boolean(String(env["AMX-HUBS-CONNECT"] || env.AMX_HUBS_CONNECT_API_KEY || "").trim());
    if (!configured) return reply({ error: "AMX Hubs Connect is not configured", requestId }, 503);
    const body = await readJson(request, 16 * 1024);
    const allowed = new Set(["page.read", "page.navigate", "content.present", "vision.inspect", "tool.invoke", "proof.write"]);
    const action = safeLabel(body.action).slice(0, 64);
    const target = safeLabel(body.target).slice(0, 240);
    const value = safeLabel(body.value).slice(0, 500);
    const tenantId = safeId(body.tenantId, "h3at-solutions").slice(0, 64);
    if (!allowed.has(action)) return reply({ error: "Control action is not allowlisted", requestId }, 400);
    if (!target) return reply({ error: "A control target is required", requestId }, 400);
    const command = { action, target, status: "accepted", timestamp: new Date().toISOString() };
    await persistTwinEvent(env, { id: crypto.randomUUID(), tenantId, twinId: "h3at-control-plane", roomCode: target, eventType: action, createdAt: command.timestamp, payload: { ...command, value, approvedBy: member?.profile?.id || "operator", source: "h3at-workspace" } });
    logEvent("info", "h3at.control_command", { requestId, tenantId, action, target });
    return reply({ command, requestId }, 202, { "Cache-Control": "no-store" });
  }
  if (request.method === "GET" && url.pathname === "/api/ready") {
    const readiness = await probeReadiness(env);
    return reply({ ...readiness, service: "amx-air-hubs", version: SERVICE_VERSION, requestId, timestamp: new Date().toISOString() }, readiness.ready ? 200 : 503);
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    const readiness = runtimeReadiness(env);
    return reply({
      supabaseUrl: env.SUPABASE_URL || "",
      supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
      memberAuthRequired: memberAuthRequired(env),
      livekitConfigured: readiness.components.livekit,
      persistenceConfigured: readiness.components.database,
      mediaStorageConfigured: readiness.components.media,
      roomTransport: readiness.roomTransport,
      deploymentMode: readiness.mode,
      deploymentTier: readiness.deploymentTier,
      version: SERVICE_VERSION,
    });
  }
  if (request.method === "GET" && url.pathname === "/api/agents/capabilities") return reply(agentCapabilities(env));
  if (request.method === "GET" && url.pathname === "/api/runway/avatars") {
    const configured = Boolean(String(env.RUNWAYML_API_SECRET || "").trim());
    if (!configured) return reply({ configured: false, presets: RUNWAY_PRESETS, avatars: [] });
    const catalog = await runwayRequest(env, "/v1/avatars?limit=50");
    return reply({ configured: true, presets: RUNWAY_PRESETS, avatars: normalizeRunwayAvatars(catalog) });
  }
  if (request.method === "POST" && url.pathname === "/api/runway/sessions") {
    if (!String(env.RUNWAYML_API_SECRET || "").trim()) return reply({ error: "Runway Characters is not configured on this stage", configured: false, requestId }, 503);
    const session = await createRunwaySession(env, await readJson(request, 32 * 1024));
    logEvent("info", "runway.session_created", { requestId, sessionId: session.sessionId, roomName: session.roomName });
    return reply({ ...session, requestId }, 201);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/runway/sessions/")) {
    const sessionId = safeId(url.pathname.split("/").pop()).slice(0, 96);
    if (!sessionId) return reply({ error: "sessionId is required", requestId }, 400);
    await runwayRequest(env, `/v1/realtime_sessions/${sessionId}`, { method: "DELETE" });
    return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
  }
  if (request.method === "GET" && url.pathname === "/api/maps/config") {
    const apiKey = String(env.GOOGLE_MAPS_BROWSER_KEY || "").trim();
    return reply({ configured: Boolean(apiKey), ...(apiKey ? { apiKey } : {}) });
  }
  if (url.pathname.startsWith("/api/stage/workflows/")) {
    if (!stageOperatorHostAllowed(env, url)) return reply({ error: "Stage workflow records are restricted to the private operator host", requestId }, 403);
    if (!env.DB) return reply({ error: "Durable Stage workflow storage is not configured", requestId }, 503);
    const room = safeId(url.pathname.split("/").pop()).toUpperCase().slice(0, 24);
    if (!room) return reply({ error: "Stage room is required", requestId }, 400);
    await initialize(env.DB);
    if (request.method === "GET") {
      const tenantId = safeId(url.searchParams.get("tenantId")).slice(0, 64);
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      const row = await env.DB.prepare("SELECT revision, payload, updated_at, updated_by FROM stage_workflows WHERE tenant_id = ? AND room_code = ? LIMIT 1").bind(tenantId, room).first();
      if (!row) return reply({ error: "Stage workflow not found", requestId }, 404);
      let workflow;
      try { workflow = JSON.parse(row.payload); }
      catch { return reply({ error: "Stored Stage workflow is invalid", requestId }, 500); }
      return reply({ tenantId, room, revision: Number(row.revision) || 0, workflow, updatedAt: row.updated_at, updatedBy: row.updated_by, persisted: true, requestId });
    }
    if (request.method === "PUT") {
      const body = await readJson(request, 128 * 1024);
      const tenantId = safeId(body.tenantId).slice(0, 64);
      const revision = Math.round(Number(body.revision));
      if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
      if (!Number.isSafeInteger(revision) || revision < 1) return reply({ error: "A positive workflow revision is required", requestId }, 400);
      if (!isPlainObject(body.workflow)) return reply({ error: "workflow must be an object", requestId }, 400);
      const payload = JSON.stringify(body.workflow);
      if (new TextEncoder().encode(payload).byteLength > 120 * 1024) return reply({ error: "Stage workflow exceeds the 120 KB limit", requestId }, 413);
      const updatedAt = new Date().toISOString();
      const updatedBy = safeId(body.updatedBy, "operator").slice(0, 64);
      await env.DB.prepare("INSERT INTO stage_workflows (tenant_id, room_code, revision, payload, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, room_code) DO UPDATE SET revision = excluded.revision, payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by WHERE excluded.revision >= stage_workflows.revision")
        .bind(tenantId, room, revision, payload, updatedAt, updatedBy).run();
      logEvent("info", "stage.workflow_saved", { requestId, tenantId, room, revision, updatedBy });
      return reply({ tenantId, room, revision, workflow: body.workflow, updatedAt, updatedBy, persisted: true, requestId });
    }
    return reply({ error: "Method not allowed", requestId }, 405, { Allow: "GET, PUT" });
  }
  if (request.method === "POST" && url.pathname === "/api/pod-invites") {
    if (!env.DB) return reply({ error: "Durable invite storage is not configured", requestId }, 503);
    const input = validatePodInvite(await readJson(request, 32 * 1024));
    await verifyTenantAccess(member, env, input.tenantId);
    await initialize(env.DB);
    const id = `invite-${crypto.randomUUID()}`;
    const token = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const ownerToken = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
    const ownerTokenHash = await sha256(ownerToken);
    const zkode = generateZkode();
    const zkodeHash = await sha256(zkode);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("INSERT INTO pod_invites (id, token, owner_token_hash, tenant_id, tenant_name, tenant_color, pod_id, room_code, mission_id, title, description, host_name, guest_role, max_uses, use_count, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)")
      .bind(id, token, ownerTokenHash, input.tenantId, input.tenantName, input.tenantColor, input.podId, input.roomCode, input.missionId, input.title, input.description, input.hostName, input.role, input.maxUses, expiresAt, createdAt, createdAt).run();
    await env.DB.prepare("INSERT INTO pod_invite_zkodes (invite_id, zkode_hash, created_at) VALUES (?, ?, ?)").bind(id, zkodeHash, createdAt).run();
    const invite = publicPodInvite({ id, token, tenant_id: input.tenantId, tenant_name: input.tenantName, tenant_color: input.tenantColor, pod_id: input.podId, room_code: input.roomCode, mission_id: input.missionId, title: input.title, description: input.description, host_name: input.hostName, guest_role: input.role, max_uses: input.maxUses, use_count: 0, status: "active", expires_at: expiresAt, created_at: createdAt });
    logEvent("info", "pod_invite.created", { requestId, inviteId: id, tenantId: input.tenantId, podId: input.podId, role: input.role, maxUses: input.maxUses });
    return reply({ invite, ownerToken, zkode, requestId }, 201);
  }
  if (url.pathname.startsWith("/api/pod-invites/")) {
    if (!env.DB) return reply({ error: "Durable invite storage is not configured", requestId }, 503);
    const segments = url.pathname.split("/").filter(Boolean);
    const token = safeId(segments[2]);
    const action = segments[3] || "";
    if (!token) return reply({ error: "Invite token is required", requestId }, 400);
    await initialize(env.DB);
    const row = await env.DB.prepare("SELECT * FROM pod_invites WHERE token = ? LIMIT 1").bind(token).first();
    if (!row) return reply({ error: "Showcase invite not found", requestId }, 404);
    if (request.method === "GET" && !action) return reply({ invite: publicPodInvite(row), requestId });
    if (request.method === "POST" && action === "accept") {
      const status = podInviteStatus(row);
      if (status !== "active") return reply({ error: `Showcase invite is ${status}`, invite: publicPodInvite(row), requestId }, 410);
      const lock = await env.DB.prepare("SELECT zkode_hash FROM pod_invite_zkodes WHERE invite_id = ? LIMIT 1").bind(row.id).first();
      if (!lock?.zkode_hash) return reply({ error: "This legacy pass must be reissued with a ZKODE", requestId }, 409);
      const body = await readJson(request, 4 * 1024);
      const zkode = normalizeZkode(body.zkode);
      if (!zkode || await sha256(zkode) !== lock.zkode_hash) {
        logEvent("warn", "pod_invite.zkode_rejected", { requestId, inviteId: row.id });
        return reply({ error: "ZKODE is incorrect", requestId }, 403);
      }
      const updatedAt = new Date().toISOString();
      const result = await env.DB.prepare("UPDATE pod_invites SET use_count = use_count + 1, updated_at = ? WHERE token = ? AND status = 'active' AND expires_at > ? AND use_count < max_uses")
        .bind(updatedAt, token, updatedAt).run();
      if (result?.meta && Number(result.meta.changes) === 0) return reply({ error: "Showcase invite is no longer available", requestId }, 409);
      const accepted = { ...row, use_count: Number(row.use_count) + 1, updated_at: updatedAt };
      logEvent("info", "pod_invite.accepted", { requestId, inviteId: row.id, podId: row.pod_id, useCount: accepted.use_count });
      return reply({ invite: publicPodInvite(accepted), requestId });
    }
    if (request.method === "DELETE" && !action) {
      const authorization = request.headers.get("Authorization") || "";
      const ownerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      if (!ownerToken || await sha256(ownerToken) !== row.owner_token_hash) return reply({ error: "Invite owner authorization failed", requestId }, 403);
      const updatedAt = new Date().toISOString();
      await env.DB.prepare("UPDATE pod_invites SET status = 'revoked', updated_at = ? WHERE token = ?").bind(updatedAt, token).run();
      logEvent("info", "pod_invite.revoked", { requestId, inviteId: row.id, podId: row.pod_id });
      return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
    }
    return reply({ error: "Not found", requestId }, 404);
  }
  if (request.method === "GET" && url.pathname === "/api/telemetry/data-center") {
    const tenantId = safeId(url.searchParams.get("tenantId"));
    if (!tenantId) return reply({ error: "tenantId is required", requestId }, 400);
    await verifyTenantAccess(member, env, tenantId);
    if (!env.DB) return reply({ item: null, persisted: false, requestId });
    await initialize(env.DB);
    const row = await env.DB.prepare("SELECT payload FROM data_center_telemetry WHERE tenant_id = ? ORDER BY observed_at DESC LIMIT 1").bind(tenantId).first();
    if (!row?.payload) return reply({ item: null, persisted: true, requestId });
    const item = JSON.parse(row.payload);
    item.stale = Date.now() - Date.parse(item.timestamp) > 120_000;
    return reply({ item, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/telemetry/data-center") {
    if (!env.DCIM_INGEST_TOKEN) return reply({ error: "Telemetry ingestion is not configured", requestId }, 503);
    if (!authorizedTelemetryIngest(request, env)) return reply({ error: "Telemetry ingest authorization failed", requestId }, 401);
    const item = validateDataCenterTelemetry(await readJson(request, 256 * 1024));
    await persistDataCenterTelemetry(env, item);
    logEvent("info", "telemetry.ingested", { requestId, tenantId: item.tenantId, adapter: item.adapter, rackCount: item.racks.length });
    return reply({ item: { ...item, stale: false }, persisted: true, requestId }, 201);
  }
  if (request.method === "GET" && url.pathname === "/api/learning/projects/state") {
    const tenantId = safeId(url.searchParams.get("tenantId"));
    const projectId = safeId(url.searchParams.get("projectId"));
    const learnerId = safeId(url.searchParams.get("learnerId"));
    if (!tenantId || !projectId || !learnerId) return reply({ error: "tenantId, projectId, and learnerId are required", requestId }, 400);
    await verifyTenantAccess(member, env, tenantId);
    if (!env.DB) return reply({ item: null, persisted: false, requestId });
    await initialize(env.DB);
    const row = await env.DB.prepare("SELECT payload FROM project_learning_state WHERE tenant_id = ? AND project_id = ? AND learner_id = ? ORDER BY updated_at DESC LIMIT 1")
      .bind(tenantId, projectId, learnerId).first();
    return reply({ item: row?.payload ? JSON.parse(row.payload) : null, persisted: true, requestId });
  }
  if (request.method === "PUT" && url.pathname === "/api/learning/projects/state") {
    const item = validateProjectLearningState(await readJson(request, 256 * 1024));
    await verifyTenantAccess(member, env, item.tenantId);
    await persistProjectLearningState(env, item);
    return reply({ item, persisted: Boolean(env.DB), requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/agents/respond") {
    const payload = sanitizeAgentPayload(await readJson(request, MAX_AGENT_BODY_BYTES));
    await verifyTenantAccess(member, env, payload.tenantId);
    if (!payload.text && !payload.attachments.length) return reply({ error: "Text or an attachment is required", requestId }, 400);
    if (!runtimeReadiness(env).components.agent) {
      const fallback = localAgentResult(payload);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "local", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "complete", requestId });
      return reply({ ...fallback, requestId });
    }
    try {
      const gatewayPayload = await hydrateAttachmentsForGateway(payload, url.origin, env);
      const result = env.AGENT_RUNTIME_URL
        ? await gatewayRequest(env.AGENT_RUNTIME_URL, env.AGENT_RUNTIME_TOKEN, "respond", gatewayPayload, requestId)
        : await openAIResponse(env, gatewayPayload, requestId);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "remote", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "complete", requestId });
      return reply({
        text: String(result.text || result.output || "Remote agent completed the request.").slice(0, 30_000),
        transport: "remote",
        tools: normalizeRemoteTools(result.tools),
        requestId,
      });
    } catch (error) {
      const fallback = localAgentResult(payload);
      await recordAgentRun(env, { tenantId: payload.tenantId, agentId: payload.agentId, transport: "local", contentKind: payload.contentKind, attachmentCount: payload.attachments.length, status: "fallback", requestId });
      return reply({ ...fallback, warning: error instanceof Error ? error.message : "Remote runtime unavailable", requestId });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/agents/tools/invoke") {
    const body = await readJson(request, 256 * 1024);
    const toolName = String(body.toolName || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 160);
    if (!toolName) return reply({ error: "toolName is required", requestId }, 400);
    const source = toolName.startsWith("mcp.") ? "mcp" : toolName.startsWith("plugin.") ? "plugin" : AGENT_TOOLS.find((tool) => tool.name === toolName)?.source || "runtime";
    const timestamp = new Date().toISOString();
    try {
      let output;
      if (source === "mcp") {
        if (!env.MCP_GATEWAY_URL) throw new Error("MCP gateway is not configured");
        output = await gatewayRequest(env.MCP_GATEWAY_URL, env.MCP_GATEWAY_TOKEN, "invoke", { toolName, agentId: safeId(body.agentId, "agent"), context: isPlainObject(body.context) ? body.context : {} }, requestId);
      } else if (toolName.startsWith("plugin.")) {
        if (!env.PLUGIN_GATEWAY_URL) throw new Error("Plugin gateway is not configured");
        output = await gatewayRequest(env.PLUGIN_GATEWAY_URL, env.PLUGIN_GATEWAY_TOKEN, "invoke", { toolName, agentId: safeId(body.agentId, "agent"), context: isPlainObject(body.context) ? body.context : {} }, requestId);
      } else {
        output = await invokeBuiltInTool(toolName, { ...(isPlainObject(body.context) ? body.context : {}), agentId: safeId(body.agentId, "agent") }, env);
      }
      return reply({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "complete", detail: "Tool execution completed.", timestamp },
        output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
        requestId,
      });
    } catch (error) {
      return reply({
        trace: { id: crypto.randomUUID(), name: toolName, source, status: "blocked", detail: error instanceof Error ? error.message : "Tool execution failed", timestamp },
        output: error instanceof Error ? error.message : "Tool execution failed",
        requestId,
      });
  }
  }
  if (request.method === "GET" && url.pathname === "/api/membership/catalog") {
    const plans = await loadMembershipCatalog(env);
    return reply({ brand: "TECH AT NITE", tagline: "Learn. Build. Ambassador. Earn. Lead.", billingConfigured: Boolean(env.STRIPE_SECRET_KEY), plans, requestId }, 200, { "Cache-Control": "public, max-age=120" });
  }
  if (request.method === "GET" && url.pathname === "/api/membership/me") {
    if (!env.DB) return reply({ subscription: publicMembershipSubscription(null), persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const memberId = safeId(member?.user?.id, "local-member");
    const row = await env.DB.prepare("SELECT id, tenant_id, plan_id, status, stripe_subscription_id, current_period_end, cancel_at_period_end FROM membership_subscriptions WHERE tenant_id = ? AND member_id = ? ORDER BY CASE WHEN status IN ('active','trialing','past_due') THEN 0 ELSE 1 END, updated_at DESC LIMIT 1").bind(tenantId, memberId).first();
    return reply({ subscription: publicMembershipSubscription(row), persisted: true, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/membership/checkout") {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe subscriptions and membership persistence must be configured", requestId }, 503);
    const body = await readJson(request, 32 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const memberId = safeId(member?.user?.id, "local-member");
    const plan = membershipPlan(body.planId);
    if (!plan || plan.id === "explorer") return reply({ error: "Choose a paid membership plan", requestId }, 400);
    const priceId = safeId(env[plan.priceEnv]).slice(0, 120);
    if (!priceId) return reply({ error: `${plan.name} membership is not available for checkout yet`, requestId }, 409);
    let publicBase;
    try { publicBase = new URL(String(env.MEMBERSHIP_PUBLIC_BASE_URL || env.MERCH_PUBLIC_BASE_URL)); } catch { return reply({ error: "A valid membership public URL is required", requestId }, 500); }
    if (publicBase.protocol !== "https:") return reply({ error: "Membership checkout requires an HTTPS public URL", requestId }, 500);
    const successUrl = new URL("/membership", publicBase); successUrl.searchParams.set("checkout", "success"); successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    const cancelUrl = new URL("/membership", publicBase); cancelUrl.searchParams.set("checkout", "cancelled");
    const params = new URLSearchParams({ mode: "subscription", success_url: successUrl.toString(), cancel_url: cancelUrl.toString(), client_reference_id: memberId, "line_items[0][price]": priceId, "line_items[0][quantity]": "1", "metadata[amx_membership_plan]": plan.id, "metadata[amx_member_id]": memberId, "metadata[tenant_id]": tenantId, "subscription_data[metadata][amx_membership_plan]": plan.id, "subscription_data[metadata][amx_member_id]": memberId, "subscription_data[metadata][tenant_id]": tenantId, "allow_promotion_codes": "true" });
    if (member?.user?.email) params.set("customer_email", safeLabel(member.user.email).slice(0, 160));
    const session = await stripeRequest(env, "/checkout/sessions", params, `amx-membership-${memberId}-${plan.id}`);
    if (!/^https:\/\/checkout\.stripe\.com\//i.test(String(session?.url || ""))) throw new HttpError(502, "Stripe did not return a secure membership checkout URL");
    logEvent("info", "membership.checkout_created", { requestId, tenantId, memberId, planId: plan.id });
    return reply({ checkoutUrl: session.url, planId: plan.id, requestId }, 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/membership/checkout-reconcile") {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe subscriptions and membership persistence must be configured", requestId }, 503);
    const body = await readJson(request, 16 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const memberId = safeId(member?.user?.id, "local-member");
    const sessionId = safeId(body.sessionId).slice(0, 160);
    if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) return reply({ error: "A valid Stripe Checkout session id is required", requestId }, 400);
    await initialize(env.DB);
    const session = await stripeGet(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    const metadata = isPlainObject(session.metadata) ? session.metadata : {};
    const sessionTenant = safeId(metadata.tenant_id, "tech-at-nite");
    const sessionMember = safeId(metadata.amx_member_id || session.client_reference_id);
    if (sessionTenant !== tenantId || sessionMember !== memberId) return reply({ error: "Checkout session does not belong to this member workspace", requestId }, 403);
    if (session.mode !== "subscription" || session.payment_status !== "paid") return reply({ error: "Checkout has not completed payment yet", requestId }, 409);
    const subscriptionId = safeId(session.subscription).slice(0, 120);
    if (!subscriptionId) return reply({ error: "Checkout completed without a managed subscription", requestId }, 409);
    const subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
    subscription.metadata = { ...(isPlainObject(subscription.metadata) ? subscription.metadata : {}), ...metadata };
    const saved = await persistMembershipSubscription(env, { subscriptionId: subscription.id, checkoutSessionId: sessionId, customerId: subscription.customer || session.customer, memberId, tenantId, planId: subscription.metadata?.amx_membership_plan, status: subscription.status, currentPeriodEnd: subscription.current_period_end, cancelAtPeriodEnd: subscription.cancel_at_period_end });
    const currentPeriodEnd = Number(subscription.current_period_end) > 0 ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
    logEvent("info", "membership.checkout_reconciled", { requestId, tenantId, memberId, planId: saved.planId, status: saved.status });
    return reply({ subscription: publicMembershipSubscription({ id: subscriptionId, tenant_id: tenantId, plan_id: saved.planId, status: saved.status, stripe_subscription_id: subscriptionId, current_period_end: currentPeriodEnd, cancel_at_period_end: subscription.cancel_at_period_end ? 1 : 0 }), planId: saved.planId, status: saved.status, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/membership/portal") {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe membership management is not configured", requestId }, 503);
    const body = await readJson(request, 16 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const memberId = safeId(member?.user?.id, "local-member");
    await initialize(env.DB);
    const row = await env.DB.prepare("SELECT stripe_customer_id FROM membership_subscriptions WHERE tenant_id = ? AND member_id = ? AND stripe_customer_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1").bind(tenantId, memberId).first();
    if (!row?.stripe_customer_id) return reply({ error: "No managed membership subscription was found", requestId }, 404);
    let publicBase;
    try { publicBase = new URL(String(env.MEMBERSHIP_PUBLIC_BASE_URL || env.MERCH_PUBLIC_BASE_URL)); } catch { return reply({ error: "A valid membership public URL is required", requestId }, 500); }
    const portal = await stripeRequest(env, "/billing_portal/sessions", new URLSearchParams({ customer: row.stripe_customer_id, return_url: new URL("/membership", publicBase).toString() }));
    if (!/^https:\/\/billing\.stripe\.com\//i.test(String(portal?.url || ""))) throw new HttpError(502, "Stripe did not return a secure membership portal URL");
    return reply({ portalUrl: portal.url, requestId }, 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/membership/stripe-webhook") {
    const rawBody = await request.text();
    const webhookSecret = env.MEMBERSHIP_STRIPE_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET;
    if (!await verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature") || "", webhookSecret)) return reply({ error: "Membership webhook signature is invalid or expired", requestId }, 403);
    let event; try { event = JSON.parse(rawBody); } catch { return reply({ error: "Membership webhook JSON is invalid", requestId }, 400); }
    const eventType = String(event.type || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
    const supported = new Set(["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);
    if (!supported.has(eventType)) return reply({ accepted: true, ignored: true, eventType, requestId }, 202);
    if (!env.DB) return reply({ error: "Membership persistence is required for subscription updates", requestId }, 503);
    await initialize(env.DB);
    const eventId = safeId(event.id).slice(0, 120);
    if (!eventId) return reply({ error: "Stripe membership event id is required", requestId }, 400);
    const duplicate = await env.DB.prepare("SELECT id FROM membership_webhook_events WHERE id = ? LIMIT 1").bind(eventId).first();
    if (duplicate) return reply({ accepted: true, duplicate: true, eventType, requestId });
    const object = isPlainObject(event?.data?.object) ? event.data.object : {};
    let subscription = object;
    let checkoutSessionId = "";
    if (eventType === "checkout.session.completed") {
      checkoutSessionId = safeId(object.id).slice(0, 120);
      const subscriptionId = safeId(object.subscription).slice(0, 120);
      if (!subscriptionId) return reply({ accepted: true, pending: true, eventType, requestId }, 202);
      subscription = await stripeGet(env, `/subscriptions/${encodeURIComponent(subscriptionId)}`);
      subscription.metadata = { ...(isPlainObject(subscription.metadata) ? subscription.metadata : {}), ...(isPlainObject(object.metadata) ? object.metadata : {}) };
    }
    const metadata = isPlainObject(subscription.metadata) ? subscription.metadata : {};
    const saved = await persistMembershipSubscription(env, { subscriptionId: subscription.id, checkoutSessionId, customerId: subscription.customer || object.customer, memberId: metadata.amx_member_id || object.client_reference_id, tenantId: metadata.tenant_id, planId: metadata.amx_membership_plan, status: eventType === "customer.subscription.deleted" ? "canceled" : subscription.status, currentPeriodEnd: subscription.current_period_end, cancelAtPeriodEnd: subscription.cancel_at_period_end });
    await env.DB.prepare("INSERT INTO membership_webhook_events (id, event_type, stripe_object_id, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(eventId, eventType, safeId(subscription.id).slice(0, 120), JSON.stringify({ memberId: saved.memberId, tenantId: saved.tenantId, planId: saved.planId, status: saved.status }), new Date().toISOString()).run();
    logEvent("info", "membership.subscription_updated", { requestId, eventType, memberId: saved.memberId, tenantId: saved.tenantId, planId: saved.planId, status: saved.status });
    return reply({ accepted: true, eventType, planId: saved.planId, status: saved.status, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "GET" && url.pathname === "/api/merch/catalog") {
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    if (!env.PRINTFUL_API_TOKEN) return reply({ configured: false, checkoutConfigured: false, source: "preview", products: [], message: "Connect PRINTFUL_API_TOKEN to load synchronized products.", requestId });
    const products = await loadPrintfulCatalog(env);
    const stripeCheckout = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.MERCH_PUBLIC_BASE_URL && env.DB);
    return reply({ configured: true, checkoutConfigured: stripeCheckout || Boolean(env.MERCH_CHECKOUT_URL), checkoutProvider: stripeCheckout ? "stripe" : env.MERCH_CHECKOUT_URL ? "hosted" : "none", source: "printful", products, requestId }, 200, { "Cache-Control": "private, max-age=120" });
  }
  if (request.method === "GET" && url.pathname === "/api/merch/orders") {
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    if (!env.DB) return reply({ orders: [], persisted: false, requestId });
    await initialize(env.DB);
    const memberId = safeId(member?.user?.id, "local-member");
    const result = await env.DB.prepare("SELECT id, event_id, status, currency, total_cents, tracking_url, payload, created_at FROM merch_orders WHERE tenant_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId, memberId).all();
    const orders = result.results.map((row) => {
      let payload = {}; try { payload = JSON.parse(row.payload || "{}"); } catch {}
      return { id: row.id, eventId: row.event_id || undefined, status: row.status, currency: row.currency, totalCents: row.total_cents, trackingUrl: row.tracking_url || undefined, items: Array.isArray(payload.items) ? payload.items : [], createdAt: row.created_at };
    });
    return reply({ orders, persisted: true, requestId });
  }
  if (request.method === "GET" && url.pathname === "/api/merch/admin/status") {
    const runtime = {
      tokenConfigured: Boolean(env.PRINTFUL_API_TOKEN),
      storeConfigured: Boolean(env.PRINTFUL_STORE_ID),
      checkoutConfigured: Boolean(env.STRIPE_SECRET_KEY || env.MERCH_CHECKOUT_URL),
      stripeConfigured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
      paymentWebhookConfigured: Boolean(env.MERCH_PAYMENT_WEBHOOK_TOKEN),
      fulfillmentWebhookConfigured: Boolean(env.MERCH_PRINTFUL_WEBHOOK_TOKEN && env.MERCH_PUBLIC_BASE_URL),
      databaseConfigured: Boolean(env.DB),
    };
    if (!env.PRINTFUL_API_TOKEN) return reply({ runtime, printful: { connected: false, webhookConfigured: false, eventTypes: [] }, requestId });
    try {
      const webhook = await printfulRequest(env, "/webhooks");
      let callbackHost = "";
      try { callbackHost = new URL(String(webhook?.url || "")).host; } catch {}
      return reply({ runtime, printful: { connected: true, webhookConfigured: Boolean(webhook?.url), callbackHost, eventTypes: Array.isArray(webhook?.types) ? webhook.types : [] }, requestId });
    } catch (error) {
      return reply({ runtime, printful: { connected: false, webhookConfigured: false, eventTypes: [], error: error instanceof Error ? error.message : "Printful status is unavailable" }, requestId });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/merch/admin/configure-webhook") {
    if (!env.PRINTFUL_API_TOKEN || !env.MERCH_PRINTFUL_WEBHOOK_TOKEN || !env.MERCH_PUBLIC_BASE_URL) return reply({ error: "Printful token, public base URL, and fulfillment webhook token are required", requestId }, 503);
    let callback;
    try {
      callback = new URL("/api/merch/printful-webhook", String(env.MERCH_PUBLIC_BASE_URL));
      if (callback.protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      return reply({ error: "MERCH_PUBLIC_BASE_URL must be a valid HTTPS origin", requestId }, 500);
    }
    callback.searchParams.set("token", String(env.MERCH_PRINTFUL_WEBHOOK_TOKEN));
    const eventTypes = ["package_shipped", "package_returned", "order_failed", "order_canceled", "order_put_hold", "order_put_hold_approval", "order_remove_hold"];
    await printfulRequest(env, "/webhooks", { method: "POST", body: JSON.stringify({ url: callback.toString(), types: eventTypes }) });
    return reply({ configured: true, callbackHost: callback.host, eventTypes, requestId }, 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "GET" && url.pathname === "/api/merch/admin/payouts") {
    if (!env.DB) return reply({ error: "Payout persistence is not configured", requestId }, 503);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    await initialize(env.DB);
    const profilesResult = await env.DB.prepare("SELECT tenant_id, beneficiary_type, beneficiary_id, display_name, contact_email, stripe_account_id, onboarding_status, details_submitted, charges_enabled, payouts_enabled, requirements_due, updated_at FROM merch_payout_profiles WHERE tenant_id = ? ORDER BY display_name ASC LIMIT 100").bind(tenantId).all();
    const allocationsResult = await env.DB.prepare("SELECT allocation.id, allocation.order_id, allocation.beneficiary_type, allocation.beneficiary_id, allocation.amount_cents, allocation.status, merch_order.currency, merch_order.event_id, merch_order.created_at, profile.display_name, profile.onboarding_status, profile.payouts_enabled, payout.stripe_transfer_id, payout.status AS transfer_status FROM merch_revenue_allocations allocation JOIN merch_orders merch_order ON merch_order.id = allocation.order_id LEFT JOIN merch_payout_profiles profile ON profile.tenant_id = allocation.tenant_id AND profile.beneficiary_type = allocation.beneficiary_type AND profile.beneficiary_id = allocation.beneficiary_id LEFT JOIN merch_payout_transfers payout ON payout.allocation_id = allocation.id WHERE allocation.tenant_id = ? AND allocation.status IN ('payable','paid') ORDER BY merch_order.created_at DESC LIMIT 200").bind(tenantId).all();
    const profiles = profilesResult.results.map((row) => {
      let requirementsDue = []; try { requirementsDue = JSON.parse(row.requirements_due || "[]"); } catch {}
      return { tenantId: row.tenant_id, beneficiaryType: row.beneficiary_type, beneficiaryId: row.beneficiary_id, displayName: row.display_name, contactEmail: row.contact_email || "", stripeAccountId: row.stripe_account_id, onboardingStatus: row.onboarding_status, detailsSubmitted: Boolean(row.details_submitted), chargesEnabled: Boolean(row.charges_enabled), payoutsEnabled: Boolean(row.payouts_enabled), requirementsDue: Array.isArray(requirementsDue) ? requirementsDue : [], updatedAt: row.updated_at };
    });
    const allocations = allocationsResult.results.map((row) => ({ id: row.id, orderId: row.order_id, beneficiaryType: row.beneficiary_type, beneficiaryId: row.beneficiary_id, displayName: row.display_name || row.beneficiary_id, amountCents: Number(row.amount_cents || 0), currency: row.currency, allocationStatus: row.status, onboardingStatus: row.onboarding_status || "not_started", payoutsEnabled: Boolean(row.payouts_enabled), stripeTransferId: row.stripe_transfer_id || undefined, transferStatus: row.transfer_status || undefined, eventId: row.event_id || undefined, createdAt: row.created_at }));
    return reply({ tenantId, connectConfigured: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET), profiles, allocations, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/admin/connect/onboard") {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.DB) return reply({ error: "Stripe Connect and payout persistence must be configured", requestId }, 503);
    const body = await readJson(request, 32 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const beneficiaryTypes = new Set(["creator", "partner", "organization", "community_fund"]);
    const beneficiaryType = safeId(body.beneficiaryType, "partner");
    const beneficiaryId = safeId(body.beneficiaryId).slice(0, 100);
    const displayName = safeLabel(body.displayName).slice(0, 120);
    const contactEmail = safeLabel(body.contactEmail).toLowerCase().slice(0, 160);
    if (!beneficiaryTypes.has(beneficiaryType) || !beneficiaryId || !displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new HttpError(400, "A valid beneficiary type, id, name, and email are required");
    await initialize(env.DB);
    const existing = await env.DB.prepare("SELECT stripe_account_id FROM merch_payout_profiles WHERE tenant_id = ? AND beneficiary_type = ? AND beneficiary_id = ? LIMIT 1").bind(tenantId, beneficiaryType, beneficiaryId).first();
    let account;
    if (existing?.stripe_account_id) account = await stripeGet(env, `/accounts/${encodeURIComponent(existing.stripe_account_id)}`);
    else {
      const params = new URLSearchParams({ type: "express", email: contactEmail, "metadata[amx_tenant_id]": tenantId, "metadata[amx_beneficiary_type]": beneficiaryType, "metadata[amx_beneficiary_id]": beneficiaryId, "business_profile[product_description]": "AMX AIR Hubs creator, event, and community merchandise revenue share" });
      account = await stripeRequest(env, "/accounts", params, `amx-connect-${tenantId}-${beneficiaryType}-${beneficiaryId}`.slice(0, 240));
    }
    const stripeAccountId = safeLabel(account?.id).slice(0, 120);
    if (!/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)) throw new HttpError(502, "Stripe did not return a connected account");
    const state = stripeAccountState(account);
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO merch_payout_profiles (tenant_id, beneficiary_type, beneficiary_id, display_name, contact_email, stripe_account_id, onboarding_status, details_submitted, charges_enabled, payouts_enabled, requirements_due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id, beneficiary_type, beneficiary_id) DO UPDATE SET display_name = excluded.display_name, contact_email = excluded.contact_email, stripe_account_id = excluded.stripe_account_id, onboarding_status = excluded.onboarding_status, details_submitted = excluded.details_submitted, charges_enabled = excluded.charges_enabled, payouts_enabled = excluded.payouts_enabled, requirements_due = excluded.requirements_due, updated_at = excluded.updated_at")
      .bind(tenantId, beneficiaryType, beneficiaryId, displayName, contactEmail, stripeAccountId, state.onboardingStatus, Number(state.detailsSubmitted), Number(state.chargesEnabled), Number(state.payoutsEnabled), JSON.stringify(state.requirementsDue), now, now).run();
    let publicBase;
    try { publicBase = new URL(String(env.MERCH_PUBLIC_BASE_URL)); } catch { throw new HttpError(500, "MERCH_PUBLIC_BASE_URL must be a valid HTTPS origin"); }
    if (publicBase.protocol !== "https:") throw new HttpError(500, "MERCH_PUBLIC_BASE_URL must use HTTPS");
    const refreshUrl = new URL("/connections", publicBase); refreshUrl.searchParams.set("connect", "stripe"); refreshUrl.searchParams.set("state", "refresh"); refreshUrl.searchParams.set("beneficiary", beneficiaryId);
    const returnUrl = new URL("/connections", publicBase); returnUrl.searchParams.set("connect", "stripe"); returnUrl.searchParams.set("state", "complete");
    const link = await stripeRequest(env, "/account_links", new URLSearchParams({ account: stripeAccountId, refresh_url: refreshUrl.toString(), return_url: returnUrl.toString(), type: "account_onboarding" }), `amx-connect-link-${crypto.randomUUID()}`);
    if (!/^https:\/\/connect\.stripe\.com\//i.test(String(link?.url || ""))) throw new HttpError(502, "Stripe did not return a secure onboarding URL");
    logEvent("info", "merch.connect_onboarding_created", { requestId, tenantId, beneficiaryType, beneficiaryId, stripeAccountId });
    return reply({ beneficiaryId, stripeAccountId, onboardingStatus: state.onboardingStatus, onboardingUrl: String(link.url), requestId }, existing ? 200 : 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/admin/connect/dashboard") {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe Connect is not configured", requestId }, 503);
    const body = await readJson(request, 16 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    const beneficiaryType = safeId(body.beneficiaryType, "partner");
    const beneficiaryId = safeId(body.beneficiaryId).slice(0, 100);
    await verifyTenantAccess(member, env, tenantId);
    await initialize(env.DB);
    const profile = await env.DB.prepare("SELECT stripe_account_id FROM merch_payout_profiles WHERE tenant_id = ? AND beneficiary_type = ? AND beneficiary_id = ? LIMIT 1").bind(tenantId, beneficiaryType, beneficiaryId).first();
    if (!profile?.stripe_account_id) throw new HttpError(404, "The payout profile has not started Stripe onboarding");
    const link = await stripeRequest(env, `/accounts/${encodeURIComponent(profile.stripe_account_id)}/login_links`, new URLSearchParams(), `amx-connect-login-${crypto.randomUUID()}`);
    if (!/^https:\/\/connect\.stripe\.com\//i.test(String(link?.url || ""))) throw new HttpError(502, "Stripe did not return a secure dashboard URL");
    return reply({ dashboardUrl: String(link.url), requestId }, 200, { "Cache-Control": "no-store" });
  }
  const payoutReleaseMatch = url.pathname.match(/^\/api\/merch\/admin\/payouts\/([A-Za-z0-9_-]{1,100})\/release$/);
  if (request.method === "POST" && payoutReleaseMatch) {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe Connect and payout persistence must be configured", requestId }, 503);
    const allocationId = safeId(payoutReleaseMatch[1]).slice(0, 100);
    const body = await readJson(request, 16 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    await initialize(env.DB);
    const allocation = await env.DB.prepare("SELECT allocation.id, allocation.order_id, allocation.tenant_id, allocation.beneficiary_type, allocation.beneficiary_id, allocation.amount_cents, allocation.status, merch_order.currency, merch_order.total_cents, merch_order.payload AS order_payload, profile.stripe_account_id, profile.onboarding_status, profile.details_submitted, profile.payouts_enabled FROM merch_revenue_allocations allocation JOIN merch_orders merch_order ON merch_order.id = allocation.order_id LEFT JOIN merch_payout_profiles profile ON profile.tenant_id = allocation.tenant_id AND profile.beneficiary_type = allocation.beneficiary_type AND profile.beneficiary_id = allocation.beneficiary_id WHERE allocation.id = ? AND allocation.tenant_id = ? LIMIT 1").bind(allocationId, tenantId).first();
    if (!allocation) throw new HttpError(404, "The revenue allocation was not found");
    const previous = await env.DB.prepare("SELECT id, stripe_transfer_id, status FROM merch_payout_transfers WHERE allocation_id = ? LIMIT 1").bind(allocationId).first();
    if (previous?.stripe_transfer_id) return reply({ allocationId, transferId: previous.stripe_transfer_id, status: previous.status, idempotent: true, requestId }, 200, { "Cache-Control": "no-store" });
    if (allocation.status !== "payable") throw new HttpError(409, "Only shipped-order allocations can be released");
    if (!allocation.stripe_account_id || allocation.onboarding_status !== "active" || !Boolean(allocation.details_submitted) || !Boolean(allocation.payouts_enabled)) throw new HttpError(409, "The beneficiary must complete Stripe payout onboarding before release");
    const amountCents = Math.round(Number(allocation.amount_cents));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > Number(allocation.total_cents)) throw new HttpError(409, "The payout allocation amount is invalid");
    let orderPayload = {}; try { orderPayload = JSON.parse(allocation.order_payload || "{}"); } catch {}
    const paymentReference = safeLabel(orderPayload.paymentReference).slice(0, 160);
    let sourceTransaction = "";
    if (/^pi_[A-Za-z0-9]+$/.test(paymentReference)) {
      const paymentIntent = await stripeGet(env, `/payment_intents/${encodeURIComponent(paymentReference)}`);
      sourceTransaction = safeLabel(typeof paymentIntent?.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id).slice(0, 120);
    }
    const now = new Date().toISOString();
    const transferRecordId = previous?.id || crypto.randomUUID();
    const approvedBy = safeId(member?.user?.id, "local-operator");
    if (!previous) await env.DB.prepare("INSERT INTO merch_payout_transfers (id, allocation_id, order_id, tenant_id, beneficiary_type, beneficiary_id, stripe_account_id, stripe_transfer_id, amount_cents, currency, status, approved_by, failure_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(transferRecordId, allocationId, allocation.order_id, tenantId, allocation.beneficiary_type, allocation.beneficiary_id, allocation.stripe_account_id, null, amountCents, allocation.currency, "pending", approvedBy, null, now, now).run();
    const params = new URLSearchParams({ amount: String(amountCents), currency: safeId(allocation.currency, "USD").toLowerCase(), destination: allocation.stripe_account_id, transfer_group: `AMX_${allocation.order_id}`, "metadata[amx_order_id]": allocation.order_id, "metadata[amx_allocation_id]": allocationId, "metadata[amx_tenant_id]": tenantId });
    if (/^ch_[A-Za-z0-9]+$/.test(sourceTransaction)) params.set("source_transaction", sourceTransaction);
    try {
      const transfer = await stripeRequest(env, "/transfers", params, `amx-allocation-${allocationId}`);
      const stripeTransferId = safeLabel(transfer?.id).slice(0, 120);
      if (!/^tr_[A-Za-z0-9]+$/.test(stripeTransferId)) throw new HttpError(502, "Stripe did not return a transfer id");
      await env.DB.prepare("UPDATE merch_payout_transfers SET stripe_transfer_id = ?, status = 'submitted', failure_reason = NULL, updated_at = ? WHERE allocation_id = ?").bind(stripeTransferId, now, allocationId).run();
      await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'paid' WHERE id = ? AND tenant_id = ? AND status = 'payable'").bind(allocationId, tenantId).run();
      logEvent("info", "merch.payout_released", { requestId, tenantId, allocationId, orderId: allocation.order_id, stripeTransferId, approvedBy, amountCents });
      return reply({ allocationId, transferId: stripeTransferId, status: "submitted", idempotent: false, requestId }, 201, { "Cache-Control": "no-store" });
    } catch (error) {
      await env.DB.prepare("UPDATE merch_payout_transfers SET status = 'failed', failure_reason = ?, updated_at = ? WHERE allocation_id = ?").bind(error instanceof Error ? error.message.slice(0, 240) : "Stripe transfer failed", now, allocationId).run();
      throw error;
    }
  }
  const payoutReverseMatch = url.pathname.match(/^\/api\/merch\/admin\/payouts\/([A-Za-z0-9_-]{1,100})\/reverse$/);
  if (request.method === "POST" && payoutReverseMatch) {
    if (!env.STRIPE_SECRET_KEY || !env.DB) return reply({ error: "Stripe Connect and payout persistence must be configured", requestId }, 503);
    const allocationId = safeId(payoutReverseMatch[1]).slice(0, 100);
    const body = await readJson(request, 16 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    const reason = safeLabel(body.reason).slice(0, 240);
    if (reason.length < 8) throw new HttpError(400, "A reversal reason is required for the payout audit");
    await verifyTenantAccess(member, env, tenantId);
    await initialize(env.DB);
    const transfer = await env.DB.prepare("SELECT id, allocation_id, order_id, stripe_transfer_id, amount_cents, status FROM merch_payout_transfers WHERE allocation_id = ? AND tenant_id = ? LIMIT 1").bind(allocationId, tenantId).first();
    if (!transfer?.stripe_transfer_id) throw new HttpError(404, "A submitted Stripe transfer was not found for this allocation");
    if (transfer.status === "reversed") return reply({ allocationId, transferId: transfer.stripe_transfer_id, status: "reversed", idempotent: true, requestId }, 200, { "Cache-Control": "no-store" });
    if (transfer.status !== "submitted") throw new HttpError(409, "Only submitted transfers can be reversed");
    const reversal = await stripeRequest(env, `/transfers/${encodeURIComponent(transfer.stripe_transfer_id)}/reversals`, new URLSearchParams({ amount: String(transfer.amount_cents), "metadata[amx_allocation_id]": allocationId, "metadata[amx_reversal_reason]": reason }), `amx-reversal-${allocationId}`);
    const reversalId = safeLabel(reversal?.id).slice(0, 120);
    if (!/^trr_[A-Za-z0-9]+$/.test(reversalId)) throw new HttpError(502, "Stripe did not return a transfer reversal id");
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE merch_payout_transfers SET status = 'reversed', failure_reason = NULL, updated_at = ? WHERE allocation_id = ? AND tenant_id = ?").bind(now, allocationId, tenantId).run();
    await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'reversed' WHERE id = ? AND tenant_id = ? AND status = 'paid'").bind(allocationId, tenantId).run();
    await env.DB.prepare("INSERT INTO merch_connect_events (id, event_type, stripe_object_id, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(`manual-reversal-${reversalId}`, "transfer.reversed", transfer.stripe_transfer_id, JSON.stringify({ allocationId, orderId: transfer.order_id, reversalId, reason, approvedBy: safeId(member?.user?.id, "local-operator") }), now).run();
    logEvent("warn", "merch.payout_reversed", { requestId, tenantId, allocationId, orderId: transfer.order_id, stripeTransferId: transfer.stripe_transfer_id, reversalId });
    return reply({ allocationId, transferId: transfer.stripe_transfer_id, reversalId, status: "reversed", idempotent: false, requestId }, 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/checkout") {
    if (!env.PRINTFUL_API_TOKEN) return reply({ error: "Printful fulfillment is not configured", requestId }, 503);
    if (!env.STRIPE_SECRET_KEY && !env.MERCH_CHECKOUT_URL) return reply({ error: "Secure merchandise checkout is not connected yet", requestId }, 503);
    if (!env.DB) return reply({ error: "Order persistence is required before checkout", requestId }, 503);
    const body = await readJson(request, 64 * 1024);
    const tenantId = safeId(body.tenantId, "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const items = normalizeMerchItems(body.items);
    const catalog = await loadPrintfulCatalog(env);
    let totalCents = 0;
    const normalizedItems = items.map((item) => {
      const product = catalog.find((entry) => entry.id === item.productId);
      const variant = product?.variants.find((entry) => entry.id === item.variantId);
      if (!product || !variant?.available) throw new HttpError(409, "A selected merchandise variant is unavailable");
      totalCents += variant.priceCents * item.quantity;
      return { productId: product.id, variantId: variant.id, name: product.name, variantName: variant.name, quantity: item.quantity, unitPriceCents: variant.priceCents, partnerName: product.partnerName, collectiveSharePercent: product.collectiveSharePercent };
    });
    const orderId = crypto.randomUUID();
    const eventId = safeId(body.eventId).slice(0, 80) || null;
    const memberId = safeId(member?.user?.id, "local-member");
    const now = new Date().toISOString();
    let checkoutUrl;
    let checkoutProvider = "hosted";
    if (env.STRIPE_SECRET_KEY) {
      if (!env.STRIPE_WEBHOOK_SECRET || !env.MERCH_PUBLIC_BASE_URL) return reply({ error: "Stripe webhook and public AMX URL are required before checkout", requestId }, 503);
      let publicBase;
      try { publicBase = new URL(String(env.MERCH_PUBLIC_BASE_URL)); } catch { return reply({ error: "MERCH_PUBLIC_BASE_URL must be valid", requestId }, 500); }
      if (publicBase.protocol !== "https:") return reply({ error: "MERCH_PUBLIC_BASE_URL must use HTTPS", requestId }, 500);
      const successUrl = new URL("/account/orders", publicBase);
      successUrl.searchParams.set("checkout", "success");
      successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
      const cancelUrl = new URL(eventId ? `/events/${encodeURIComponent(eventId)}/merch` : "/marketplace/merch", publicBase);
      cancelUrl.searchParams.set("checkout", "cancelled");
      const params = new URLSearchParams({ mode: "payment", success_url: successUrl.toString(), cancel_url: cancelUrl.toString(), client_reference_id: orderId, "metadata[amx_order_id]": orderId, "metadata[tenant_id]": tenantId, "payment_intent_data[metadata][amx_order_id]": orderId, "payment_intent_data[metadata][tenant_id]": tenantId, "payment_intent_data[transfer_group]": `AMX_${orderId}`, "phone_number_collection[enabled]": "true" });
      const allowedCountries = String(env.MERCH_ALLOWED_COUNTRIES || "US,CA").split(",").map((value) => safeId(value).toUpperCase()).filter((value) => /^[A-Z]{2}$/.test(value)).slice(0, 20);
      (allowedCountries.length ? allowedCountries : ["US"]).forEach((country, index) => params.set(`shipping_address_collection[allowed_countries][${index}]`, country));
      normalizedItems.forEach((item, index) => {
        params.set(`line_items[${index}][quantity]`, String(item.quantity));
        params.set(`line_items[${index}][price_data][currency]`, "usd");
        params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
        params.set(`line_items[${index}][price_data][product_data][name]`, `${item.name} / ${item.variantName}`.slice(0, 160));
      });
      if (member?.user?.email) params.set("customer_email", safeLabel(member.user.email).slice(0, 160));
      const session = await stripeRequest(env, "/checkout/sessions", params, `amx-merch-${orderId}`);
      if (!/^https:\/\/checkout\.stripe\.com\//i.test(String(session?.url || ""))) throw new HttpError(502, "Stripe did not return a secure Checkout URL");
      checkoutUrl = String(session.url);
      checkoutProvider = "stripe";
    } else {
      const checkout = new URL(String(env.MERCH_CHECKOUT_URL));
      if (checkout.protocol !== "https:") return reply({ error: "Merchandise checkout URL must use HTTPS", requestId }, 500);
      checkout.searchParams.set("order", orderId);
      checkout.searchParams.set("tenant", tenantId);
      checkoutUrl = checkout.toString();
    }
    await initialize(env.DB);
    await env.DB.prepare("INSERT INTO merch_orders (id, tenant_id, member_id, event_id, status, currency, total_cents, checkout_url, printful_order_id, tracking_url, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(orderId, tenantId, memberId, eventId, "pending_payment", "USD", totalCents, checkoutUrl, null, null, JSON.stringify({ items: normalizedItems, checkoutProvider }), now, now).run();
    for (const item of normalizedItems) await env.DB.prepare("INSERT INTO merch_revenue_allocations (id, order_id, tenant_id, beneficiary_type, beneficiary_id, share_basis_points, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), orderId, tenantId, "partner", safeId(item.partnerName, "community-runway"), item.collectiveSharePercent * 100, Math.round(item.unitPriceCents * item.quantity * item.collectiveSharePercent / 100), "pending_payment", now).run();
    return reply({ orderId, checkoutUrl, checkoutProvider, status: "pending_payment", requestId }, 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/payment-confirmed") {
    const authorization = request.headers.get("Authorization") || "";
    const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!await matchesSecret(provided, env.MERCH_PAYMENT_WEBHOOK_TOKEN)) return reply({ error: "Merchandise payment webhook token is invalid", requestId }, 403);
    const body = await readJson(request, 48 * 1024);
    const result = await fulfillPaidMerchOrder(env, { ...body, requestId });
    return reply({ ...result, requestId }, result.idempotent ? 200 : 201, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/stripe-webhook") {
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > 96 * 1024) return reply({ error: "Stripe webhook exceeds the size limit", requestId }, 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 96 * 1024) return reply({ error: "Stripe webhook exceeds the size limit", requestId }, 413);
    if (!await verifyStripeSignature(rawBody, request.headers.get("Stripe-Signature") || "", env.STRIPE_WEBHOOK_SECRET)) return reply({ error: "Stripe webhook signature is invalid or expired", requestId }, 403);
    let event; try { event = JSON.parse(rawBody); } catch { return reply({ error: "Stripe webhook JSON is invalid", requestId }, 400); }
    const eventType = safeLabel(event?.type).slice(0, 80);
    const connectEvents = new Set(["account.updated", "transfer.created", "transfer.updated", "transfer.reversed"]);
    if (connectEvents.has(eventType)) {
      if (!env.DB) return reply({ error: "Payout persistence is required for Stripe Connect updates", requestId }, 503);
      const eventId = safeId(event?.id).slice(0, 120);
      if (!eventId) return reply({ error: "Stripe Connect event id is required", requestId }, 400);
      await initialize(env.DB);
      const duplicate = await env.DB.prepare("SELECT id FROM merch_connect_events WHERE id = ? LIMIT 1").bind(eventId).first();
      if (duplicate) return reply({ accepted: true, duplicate: true, eventType, requestId });
      const stripeObject = isPlainObject(event?.data?.object) ? event.data.object : {};
      const stripeObjectId = safeLabel(stripeObject.id).slice(0, 120);
      const now = new Date().toISOString();
      if (eventType === "account.updated") {
        if (!/^acct_[A-Za-z0-9]+$/.test(stripeObjectId)) return reply({ error: "Stripe account update is missing its account id", requestId }, 400);
        const state = stripeAccountState(stripeObject);
        await env.DB.prepare("UPDATE merch_payout_profiles SET onboarding_status = ?, details_submitted = ?, charges_enabled = ?, payouts_enabled = ?, requirements_due = ?, updated_at = ? WHERE stripe_account_id = ?")
          .bind(state.onboardingStatus, Number(state.detailsSubmitted), Number(state.chargesEnabled), Number(state.payoutsEnabled), JSON.stringify(state.requirementsDue), now, stripeObjectId).run();
        await env.DB.prepare("INSERT INTO merch_connect_events (id, event_type, stripe_object_id, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(eventId, eventType, stripeObjectId, JSON.stringify({ onboardingStatus: state.onboardingStatus, requirementsDue: state.requirementsDue }), now).run();
        return reply({ accepted: true, eventType, onboardingStatus: state.onboardingStatus, requestId }, 200, { "Cache-Control": "no-store" });
      }
      if (!/^tr_[A-Za-z0-9]+$/.test(stripeObjectId)) return reply({ error: "Stripe transfer update is missing its transfer id", requestId }, 400);
      const allocationId = safeId(stripeObject?.metadata?.amx_allocation_id).slice(0, 100);
      if (eventType === "transfer.reversed") {
        await env.DB.prepare("UPDATE merch_payout_transfers SET status = 'reversed', updated_at = ? WHERE stripe_transfer_id = ?").bind(now, stripeObjectId).run();
        await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'reversed' WHERE id = COALESCE(NULLIF(?, ''), (SELECT allocation_id FROM merch_payout_transfers WHERE stripe_transfer_id = ? LIMIT 1)) AND status = 'paid'").bind(allocationId, stripeObjectId).run();
      } else await env.DB.prepare("UPDATE merch_payout_transfers SET status = 'submitted', updated_at = ? WHERE stripe_transfer_id = ?").bind(now, stripeObjectId).run();
      await env.DB.prepare("INSERT INTO merch_connect_events (id, event_type, stripe_object_id, payload, created_at) VALUES (?, ?, ?, ?, ?)").bind(eventId, eventType, stripeObjectId, JSON.stringify({ allocationId, amountReversed: Number(stripeObject.amount_reversed || 0) }), now).run();
      return reply({ accepted: true, eventType, allocationId: allocationId || undefined, requestId }, 200, { "Cache-Control": "no-store" });
    }
    const supportedEvents = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"]);
    if (!supportedEvents.has(eventType)) return reply({ accepted: true, ignored: true, eventType, requestId }, 202);
    if (!env.DB) return reply({ error: "Order persistence is required for payment updates", requestId }, 503);
    const session = isPlainObject(event?.data?.object) ? event.data.object : {};
    const orderId = safeId(session?.metadata?.amx_order_id || session.client_reference_id).slice(0, 80);
    if (!orderId) return reply({ error: "Stripe Checkout Session is missing its AMX order reference", requestId }, 400);
    await initialize(env.DB);
    const eventId = safeId(event.id).slice(0, 120);
    if (!eventId) return reply({ error: "Stripe webhook event id is required", requestId }, 400);
    const duplicate = await env.DB.prepare("SELECT id FROM merch_webhook_events WHERE id = ? LIMIT 1").bind(eventId).first();
    if (duplicate) return reply({ accepted: true, duplicate: true, orderId, requestId });
    if (["checkout.session.async_payment_failed", "checkout.session.expired"].includes(eventType)) {
      const now = new Date().toISOString();
      await env.DB.prepare("UPDATE merch_orders SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending_payment'").bind(now, orderId).run();
      await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'reversed' WHERE order_id = ? AND status = 'pending_payment'").bind(orderId).run();
      await env.DB.prepare("INSERT INTO merch_webhook_events (id, order_id, event_type, store_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(eventId, orderId, eventType, "stripe", JSON.stringify({ sessionId: safeId(session.id).slice(0, 120) }), now).run();
      return reply({ accepted: true, orderId, status: "failed", requestId }, 200, { "Cache-Control": "no-store" });
    }
    if (session.payment_status !== "paid") return reply({ accepted: true, pending: true, orderId, requestId }, 202);
    const shipping = isPlainObject(session?.collected_information?.shipping_details) ? session.collected_information.shipping_details : isPlainObject(session.shipping_details) ? session.shipping_details : {};
    const customer = isPlainObject(session.customer_details) ? session.customer_details : {};
    const address = isPlainObject(shipping.address) ? shipping.address : isPlainObject(customer.address) ? customer.address : {};
    const result = await fulfillPaidMerchOrder(env, {
      orderId,
      paymentReference: safeLabel(session.payment_intent || session.id).slice(0, 160),
      amountCents: session.amount_total,
      currency: safeId(session.currency, "usd").toUpperCase(),
      recipient: { name: shipping.name || customer.name, address1: address.line1, address2: address.line2, city: address.city, stateCode: address.state, countryCode: address.country, zip: address.postal_code, phone: customer.phone, email: customer.email },
      requestId,
    });
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO merch_webhook_events (id, order_id, event_type, store_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(eventId, orderId, eventType, "stripe", JSON.stringify({ sessionId: safeId(session.id).slice(0, 120), paymentReference: safeLabel(session.payment_intent).slice(0, 160) }), now).run();
    return reply({ accepted: true, ...result, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/merch/printful-webhook") {
    if (!await matchesSecret(url.searchParams.get("token") || "", env.MERCH_PRINTFUL_WEBHOOK_TOKEN)) return reply({ error: "Printful fulfillment webhook token is invalid", requestId }, 403);
    if (!env.DB) return reply({ error: "Order persistence is required for fulfillment updates", requestId }, 503);
    const body = await readJson(request, 96 * 1024);
    const eventType = safeId(body.type).slice(0, 64);
    const allowedEvents = new Set(["package_shipped", "package_returned", "order_failed", "order_canceled", "order_put_hold", "order_put_hold_approval", "order_remove_hold"]);
    if (!allowedEvents.has(eventType)) return reply({ accepted: true, ignored: true, eventType, requestId }, 202);
    const storeId = String(body.store || "").slice(0, 80);
    if (env.PRINTFUL_STORE_ID && storeId !== String(env.PRINTFUL_STORE_ID)) return reply({ error: "Printful webhook store does not match this tenant runtime", requestId }, 403);
    const data = isPlainObject(body.data) ? body.data : {};
    const order = isPlainObject(data.order) ? data.order : isPlainObject(data.shipment?.order) ? data.shipment.order : {};
    const shipment = isPlainObject(data.shipment) ? data.shipment : {};
    const externalId = safeId(order.external_id || data.external_id).slice(0, 80);
    const printfulOrderId = String(order.id || data.order_id || shipment.order_id || "").slice(0, 80);
    if (!externalId && !printfulOrderId) return reply({ error: "Printful webhook did not identify an order", requestId }, 400);
    await initialize(env.DB);
    const row = externalId
      ? await env.DB.prepare("SELECT id, status, payload FROM merch_orders WHERE id = ? LIMIT 1").bind(externalId).first()
      : await env.DB.prepare("SELECT id, status, payload FROM merch_orders WHERE printful_order_id = ? LIMIT 1").bind(printfulOrderId).first();
    if (!row) return reply({ error: "Matching merchandise order is not available yet", requestId }, 409);
    const eventId = [eventType, storeId, String(body.created || ""), String(shipment.id || order.id || row.id)].map((value) => safeLabel(value).slice(0, 80)).join(":");
    const duplicate = await env.DB.prepare("SELECT id FROM merch_webhook_events WHERE id = ? LIMIT 1").bind(eventId).first();
    if (duplicate) return reply({ accepted: true, duplicate: true, orderId: row.id, status: row.status, requestId });
    const statusByEvent = {
      package_shipped: "shipped",
      package_returned: "returned",
      order_failed: "failed",
      order_canceled: "cancelled",
      order_put_hold: "on_hold",
      order_put_hold_approval: "on_hold",
      order_remove_hold: "submitted",
    };
    const nextStatus = statusByEvent[eventType] || row.status;
    const rawTrackingUrl = safeLabel(shipment.tracking_url).slice(0, 500);
    const trackingUrl = /^https:\/\//i.test(rawTrackingUrl) ? rawTrackingUrl : "";
    const fulfillment = {
      eventType,
      carrier: safeLabel(shipment.carrier).slice(0, 80),
      service: safeLabel(shipment.service).slice(0, 120),
      trackingNumber: safeLabel(shipment.tracking_number).slice(0, 120),
      trackingUrl,
      updatedAt: new Date().toISOString(),
    };
    let payload = {}; try { payload = JSON.parse(row.payload || "{}"); } catch {}
    const shipments = Array.isArray(payload.shipments) ? payload.shipments.filter((item) => item?.trackingUrl !== trackingUrl || !trackingUrl) : [];
    if (eventType === "package_shipped") shipments.push(fulfillment);
    const updatedPayload = { ...payload, fulfillment, shipments: shipments.slice(-10) };
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO merch_webhook_events (id, order_id, event_type, store_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(eventId, row.id, eventType, storeId || null, JSON.stringify(fulfillment), now).run();
    await env.DB.prepare("UPDATE merch_orders SET status = ?, tracking_url = COALESCE(NULLIF(?, ''), tracking_url), payload = ?, updated_at = ? WHERE id = ?")
      .bind(nextStatus, trackingUrl, JSON.stringify(updatedPayload), now, row.id).run();
    if (eventType === "package_shipped") await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'payable' WHERE order_id = ? AND status = 'accrued'").bind(row.id).run();
    if (["order_failed", "order_canceled", "package_returned"].includes(eventType)) await env.DB.prepare("UPDATE merch_revenue_allocations SET status = 'reversed' WHERE order_id = ? AND status IN ('accrued', 'payable')").bind(row.id).run();
    logEvent("info", "merch.fulfillment_updated", { requestId, orderId: row.id, eventType, status: nextStatus });
    return reply({ accepted: true, orderId: row.id, status: nextStatus, trackingAvailable: Boolean(trackingUrl), requestId }, 200, { "Cache-Control": "no-store" });
  }

  if (request.method === "POST" && url.pathname === "/api/media") {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > MAX_MEDIA_BYTES) return reply({ error: "Media exceeds the 25 MB limit", requestId }, 413);
    const contentType = allowedMediaType(request.headers.get("Content-Type"));
    const body = await request.arrayBuffer();
    if (!body.byteLength) return reply({ error: "Media body is required", requestId }, 400);
    if (body.byteLength > MAX_MEDIA_BYTES) return reply({ error: "Media exceeds the 25 MB limit", requestId }, 413);
    const id = crypto.randomUUID();
    const fileName = safeLabel(request.headers.get("X-AMX-Filename"), `attachment-${id}`);
    const tenantId = safeId(request.headers.get("X-AMX-Tenant"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const ownerUserId = safeId(member?.user?.id);
    const requestedPurpose = safeId(request.headers.get("X-AMX-Media-Purpose"));
    const mediaPurpose = ["profile-avatar", "partner-logo", "stage-video"].includes(requestedPurpose) ? requestedPurpose : "";
    const publicImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const visibility = request.headers.get("X-AMX-Visibility") === "public" && ["profile-avatar", "partner-logo"].includes(mediaPurpose) && publicImageTypes.has(contentType) ? "public"
      : request.headers.get("X-AMX-Visibility") === "members" && mediaPurpose === "stage-video" && contentType.startsWith("video/") ? "members" : "private";
    const createdAt = new Date().toISOString();
    await env.MEDIA.put(id, body, { httpMetadata: { contentType }, customMetadata: { fileName, tenantId, ownerUserId, createdAt, visibility, purpose: mediaPurpose } });
    let metadataPersisted = false;
    if (env.DB) {
      try {
        await initialize(env.DB);
        await env.DB.prepare("INSERT INTO media_objects (id, tenant_id, owner_user_id, visibility, purpose, file_name, content_type, size_bytes, object_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, tenantId, ownerUserId || null, visibility, mediaPurpose || null, fileName, contentType, body.byteLength, id, createdAt).run();
        metadataPersisted = true;
      } catch (error) {
        logEvent("warn", "media.metadata_failed", { requestId, id, error: error instanceof Error ? error.message : "Media metadata persistence failed" });
      }
    }
    logEvent("info", "media.stored", { requestId, id, tenantId, contentType, sizeBytes: body.byteLength });
    return reply({ id, url: `/api/media/${id}`, fileName, contentType, size: body.byteLength, visibility, metadataPersisted, requestId }, 201);
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/media/")) {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Media id is required", requestId }, 400);
    const object = await env.MEDIA.get(id);
    if (!object) return reply({ error: "Media not found", requestId }, 404);
    const isPublicIdentityImage = object.customMetadata?.visibility === "public" && ["profile-avatar", "partner-logo"].includes(object.customMetadata?.purpose);
    const isSharedStageVideo = object.customMetadata?.visibility === "members" && object.customMetadata?.purpose === "stage-video";
    if (!isPublicIdentityImage && !isSharedStageVideo) {
      const viewer = await verifyMemberRequest(request, env, requiredMemberRoles(url));
      const ownerUserId = safeId(object.customMetadata?.ownerUserId);
      if (ownerUserId && viewer?.user?.id !== ownerUserId && viewer?.profile?.membership_role !== "operator") throw new HttpError(403, "This private media belongs to another member");
    }
    const headers = new Headers(capabilityHeaders({ "Cache-Control": isPublicIdentityImage ? "public, max-age=3600, stale-while-revalidate=86400" : "private, no-store", "X-Request-ID": requestId }));
    object.writeHttpMetadata?.(headers);
    headers.set("Content-Type", headers.get("Content-Type") || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${safeLabel(object.customMetadata?.fileName, id).replace(/"/g, "")}"`);
    if (object.httpEtag) headers.set("ETag", object.httpEtag);
    return new Response(object.body, { headers });
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/media/")) {
    if (!env.MEDIA) return reply({ error: "Media storage is not configured", requestId }, 503);
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Media id is required", requestId }, 400);
    const object = await env.MEDIA.get(id);
    if (!object) return reply({ error: "Media not found", requestId }, 404);
    const ownerUserId = safeId(object.customMetadata?.ownerUserId);
    if (ownerUserId && member?.user?.id !== ownerUserId && member?.profile?.membership_role !== "operator") throw new HttpError(403, "This media belongs to another member");
    await env.MEDIA.delete(id);
    if (env.DB) {
      try {
        await initialize(env.DB);
        await env.DB.prepare("DELETE FROM media_objects WHERE id = ?").bind(id).run();
      } catch (error) {
        logEvent("warn", "media.metadata_delete_failed", { requestId, id, error: error instanceof Error ? error.message : "Media metadata deletion failed" });
      }
    }
    return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
  }
  if (request.method === "POST" && url.pathname === "/api/decart/client-token") {
    if (!env.DECART_API_KEY) return reply({ error: "Decart realtime video is not configured", configured: false, requestId }, 503);
    if (!await allowRequest(request, env, 12, "decart-token")) return reply({ error: "AI camera session limit reached. Try again in one minute.", requestId }, 429, { "Retry-After": "60" });
    const body = await readJson(request, 8 * 1024);
    const approvedModels = ["lucy-latest", "lucy-2.5", "lucy-restyle-latest", "lucy-restyle-2", "lucy-vton-latest", "lucy-vton-3", "lucy-2.1"];
    const model = safeLabel(body.model, "lucy-latest").toLowerCase();
    if (!approvedModels.includes(model)) return reply({ error: "This AI camera model is not approved", requestId }, 400);
    const origin = new URL(request.url).origin;
    const response = await fetch("https://api.decart.ai/v1/client/tokens", {
      method: "POST",
      headers: { "x-api-key": String(env.DECART_API_KEY), "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ expiresIn: 300, allowedModels: [model], allowedOrigins: [origin], constraints: { realtime: { maxSessionDuration: 1800 } }, metadata: { product: "amx-air-hubs", room: safeId(body.room || "AMXSTAGE").slice(0, 64) } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.apiKey) {
      logEvent("error", "decart.token_failed", { requestId, status: response.status, detail: safeLabel(result?.detail || result?.message || "Token service unavailable", "Token service unavailable").slice(0, 160) });
      return reply({ error: response.status === 401 || response.status === 403 ? "Decart credentials were rejected" : "Decart realtime token could not be created", requestId }, response.status === 429 ? 429 : 502);
    }
    return reply({ apiKey: result.apiKey, expiresAt: result.expiresAt, model, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/decart/render") {
    if (!env.DECART_API_KEY) return reply({ error: "Decart rendering is not configured", configured: false, requestId }, 503);
    if (!await allowRequest(request, env, 6, "decart-render")) return reply({ error: "Render submission limit reached. Try again shortly.", requestId }, 429, { "Retry-After": "60" });
    const form = await request.formData();
    const source = form.get("data");
    const prompt = safeLabel(form.get("prompt"), "").slice(0, 1000);
    const model = safeLabel(form.get("model"), "lucy-latest").toLowerCase();
    const approvedModels = ["lucy-latest", "lucy-2.5", "lucy-restyle-latest", "lucy-restyle-2", "lucy-vton-latest", "lucy-vton-3", "lucy-2.1", "lucy-clip-latest"];
    if (!approvedModels.includes(model)) return reply({ error: "This render model is not approved", requestId }, 400);
    if (!(source instanceof File) || !["video/mp4", "video/webm"].includes(source.type)) return reply({ error: "An MP4 or WebM source video is required", requestId }, 400);
    if (source.size > 200 * 1024 * 1024) return reply({ error: "Source video exceeds the 200 MB Decart limit", requestId }, 413);
    if (!prompt) return reply({ error: "A render prompt is required", requestId }, 400);
    const upstreamForm = new FormData();
    upstreamForm.set("data", source, source.name);
    upstreamForm.set("prompt", prompt);
    const reference = form.get("reference_image");
    if (reference instanceof File && reference.size) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(reference.type) || reference.size > 10 * 1024 * 1024) return reply({ error: "Reference image must be JPG, PNG, or WebP under 10 MB", requestId }, 400);
      upstreamForm.set("reference_image", reference, reference.name);
    }
    const response = await fetch(`https://api.decart.ai/v1/jobs/${encodeURIComponent(model)}`, { method: "POST", headers: { "x-api-key": String(env.DECART_API_KEY), "Accept": "application/json" }, body: upstreamForm });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return reply({ error: "Decart render submission failed", detail: safeLabel(result?.detail || result?.message, "Upstream request failed").slice(0, 180), requestId }, response.status === 429 ? 429 : 502);
    return reply({ jobId: safeId(result.job_id), status: result.status || "pending", model, requestId }, 202, { "Cache-Control": "no-store" });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/decart/render/")) {
    if (!env.DECART_API_KEY) return reply({ error: "Decart rendering is not configured", requestId }, 503);
    const parts = url.pathname.split("/").filter(Boolean);
    const jobId = safeId(parts[3]);
    if (!jobId) return reply({ error: "Render job id is required", requestId }, 400);
    const content = parts[4] === "content";
    const response = await fetch(`https://api.decart.ai/v1/jobs/${encodeURIComponent(jobId)}${content ? "/content" : ""}`, { headers: { "x-api-key": String(env.DECART_API_KEY), "Accept": content ? "video/mp4" : "application/json" } });
    if (!response.ok) return reply({ error: content ? "Rendered video is unavailable" : "Render status is unavailable", requestId }, response.status === 404 ? 404 : 502);
    if (content) return new Response(response.body, { status: 200, headers: capabilityHeaders({ "Content-Type": response.headers.get("Content-Type") || "video/mp4", "Cache-Control": "private, no-store", "X-Request-ID": requestId }) });
    const result = await response.json();
    return reply({ jobId, status: result.status, error: result.error || null, requestId }, 200, { "Cache-Control": "no-store" });
  }
  if (request.method === "POST" && url.pathname === "/api/livekit/viewer-token") {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply({ error: "LiveKit is not configured on this stage", configured: false, requestId }, 503);
    }
    if (!await allowRequest(request, env, 30, "livekit-viewer")) return reply({ error: "Viewer token rate limit exceeded", requestId }, 429, { "Retry-After": "60" });
    let serverUrl;
    try {
      const parsed = new URL(env.LIVEKIT_URL);
      if (!["wss:", "ws:"].includes(parsed.protocol)) throw new Error("LiveKit URL must use WebSocket transport");
      serverUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Invalid LiveKit URL", requestId }, 500);
    }
    const body = await readJson(request, 16 * 1024);
    const room = safeId(body.room).toUpperCase().slice(0, 64);
    if (!room) return reply({ error: "Room is required", requestId }, 400);
    if (!publicLiveKitRoomAllowed(env, room)) return reply({ error: "This room is not available on the public viewer", requestId }, 403);
    const clientType = body.clientType === "stage-monitor" && liveKitOperatorHostAllowed(env, url) ? "stage-monitor" : "audience";
    const identity = `${clientType === "stage-monitor" ? "stage-monitor" : "viewer"}-${crypto.randomUUID().slice(0, 18)}`;
    const name = safeLabel(body.name, clientType === "stage-monitor" ? "AMX Stage Router" : "AMX Stage Viewer").slice(0, 80);
    const participantToken = await createLiveKitToken(env, room, identity, name, "viewer", clientType);
    return reply({ serverUrl, participantToken, identity, room, role: "viewer", clientType, expiresIn: 900, agentDispatch: { configured: false, dispatched: false }, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/livekit/monitor-token") {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return reply({ error: "LiveKit is not configured on this stage", configured: false, requestId }, 503);
    if (!liveKitOperatorHostAllowed(env, url)) return reply({ error: "Stage monitor tokens are restricted to the private operator host", requestId }, 403);
    let serverUrl;
    try {
      const parsed = new URL(env.LIVEKIT_URL);
      if (!["wss:", "ws:"].includes(parsed.protocol)) throw new Error("LiveKit URL must use WebSocket transport");
      serverUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Invalid LiveKit URL", requestId }, 500);
    }
    const body = await readJson(request, 16 * 1024);
    const room = safeId(body.room).toUpperCase().slice(0, 64);
    if (!room) return reply({ error: "Room is required", requestId }, 400);
    const identity = `stage-monitor-${crypto.randomUUID().slice(0, 18)}`;
    const name = safeLabel(body.name, "AMX Stage Router").slice(0, 80);
    const participantToken = await createLiveKitToken(env, room, identity, name, "viewer", "stage-monitor");
    return reply({ serverUrl, participantToken, identity, room, role: "viewer", clientType: "stage-monitor", expiresIn: 900, agentDispatch: { configured: false, dispatched: false }, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/livekit/token") {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      return reply({ error: "LiveKit is not configured on this stage", configured: false, requestId }, 503);
    }
    const body = await readJson(request, 16 * 1024);
    const venueMember = body.clientType === "venue-member";
    if (!liveKitOperatorHostAllowed(env, url) && !venueMember) return reply({ error: "LiveKit participant tokens are restricted to the private operator host", requestId }, 403);
    let serverUrl;
    try {
      const parsed = new URL(env.LIVEKIT_URL);
      if (!["wss:", "ws:"].includes(parsed.protocol)) throw new Error("LiveKit URL must use WebSocket transport");
      serverUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      return reply({ error: error instanceof Error ? error.message : "Invalid LiveKit URL", requestId }, 500);
    }
    const room = safeId(body.room).toUpperCase().slice(0, 64);
    let identity = safeId(body.identity).slice(0, 64);
    let name = safeLabel(body.name, identity || "AMX Explorer").slice(0, 80);
    let clientType = "operator";
    if (venueMember) {
      const verified = await verifyMemberRequest(request, env, ["member", "trainer", "operator"]);
      if (!publicLiveKitRoomAllowed(env, room)) return reply({ error: "This room is not available to venue members", requestId }, 403);
      identity = `member-${safeId(verified?.profile?.id || verified?.profile?.member_code || crypto.randomUUID()).slice(0, 52)}`;
      name = safeLabel(body.name, verified?.profile?.member_code || "AMX Member").slice(0, 80);
      clientType = "venue-member";
    } else await verifyMemberRequest(request, env, ["operator"]);
    if (!room || !identity) return reply({ error: "Room and identity are required", requestId }, 400);
    const participantToken = await createLiveKitToken(env, room, identity, name, "participant", clientType);
    const agentDispatch = venueMember ? { configured: false, dispatched: false } : await ensureLiveKitAgentDispatch(env, room, requestId);
    return reply({ serverUrl, participantToken, identity, room, role: "participant", clientType, expiresIn: 900, agentDispatch, requestId });
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/livekit/egress/dj/")) {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return reply({ error: "LiveKit is not configured on this stage", configured: false, requestId }, 503);
    let destinations;
    try { destinations = liveKitEgressDestinations(env); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : "Invalid DJ stream destination", configured: false, requestId }, 503); }
    if (!destinations.length) return reply({ error: "DJ stream destinations are not configured", configured: false, requestId }, 503);
    if (!env.DJ_STREAM_CONTROL_TOKEN) return reply({ error: "DJ broadcast control is not configured", configured: false, requestId }, 503);
    await authorizeDjBroadcast(request, env);
    const body = await readJson(request, 16 * 1024);
    const room = safeId(body.room).toUpperCase().slice(0, 64);
    const videoProfile = liveKitEgressProfile(body.videoProfile);
    const profileResponse = { videoProfile: videoProfile.id, width: videoProfile.width, height: videoProfile.height, frameRate: videoProfile.frameRate };
    if (!room) return reply({ error: "Room is required", requestId }, 400);
    if (url.pathname === "/api/livekit/egress/dj/status") {
      const result = await callLiveKitEgress(env, "ListEgress", { room_name: room, active: true });
      const items = (Array.isArray(result.items) ? result.items : []).map(sanitizeEgress).filter((item) => item.id && item.room === room);
      return reply({ configured: true, destinationCount: destinations.length, active: items[0] || null, ...profileResponse, requestId });
    }
    if (url.pathname === "/api/livekit/egress/dj/start") {
      const listed = await callLiveKitEgress(env, "ListEgress", { room_name: room, active: true });
      const existing = (Array.isArray(listed.items) ? listed.items : []).map(sanitizeEgress).find((item) => item.id && item.room === room);
      if (existing) return reply({ configured: true, destinationCount: destinations.length, active: existing, alreadyActive: true, ...profileResponse, requestId });
      const result = await callLiveKitEgress(env, "StartRoomCompositeEgress", {
        room_name: room,
        layout: "speaker",
        stream_outputs: [{ protocol: 1, urls: destinations }],
        preset: videoProfile.preset,
      });
      const active = sanitizeEgress(result);
      logEvent("info", "livekit.dj_egress_started", { requestId, room, egressId: active.id, destinationCount: destinations.length });
      return reply({ configured: true, destinationCount: destinations.length, active, ...profileResponse, requestId }, 201);
    }
    if (url.pathname === "/api/livekit/egress/dj/stop") {
      const egressId = safeId(body.egressId).slice(0, 80);
      if (!egressId) return reply({ error: "Egress id is required", requestId }, 400);
      const listed = await callLiveKitEgress(env, "ListEgress", { room_name: room, active: true });
      const active = (Array.isArray(listed.items) ? listed.items : []).map(sanitizeEgress).find((item) => item.id === egressId && item.room === room);
      if (!active) return reply({ error: "Active DJ stream was not found in this room", requestId }, 404);
      const result = await callLiveKitEgress(env, "StopEgress", { egress_id: egressId });
      const stopped = sanitizeEgress(result);
      logEvent("info", "livekit.dj_egress_stopped", { requestId, room, egressId: stopped.id || egressId });
      return reply({ configured: true, destinationCount: destinations.length, active: null, stopped: { ...stopped, id: stopped.id || egressId }, ...profileResponse, requestId });
    }
    return reply({ error: "DJ broadcast action not found", requestId }, 404);
  }
  if (url.pathname.startsWith("/api/rooms/")) {
    if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return reply({ error: "WebSocket upgrade required", requestId }, 426);
    const roomCode = safeId(url.pathname.split("/").pop()).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    if (!env.ROOMS) {
      try { return openEphemeralRoom(request, roomCode); }
      catch (error) { return reply({ error: error?.message || "WebSocket runtime error", runtime: typeof WebSocketPair, requestId }, 500); }
    }
    const room = env.ROOMS.get(env.ROOMS.idFromName(roomCode));
    return room.fetch(request);
  }
  if (request.method === "GET" && url.pathname === "/api/anchors") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const roomCode = safeId(url.searchParams.get("room")).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    const result = await env.DB.prepare("SELECT payload FROM geo_anchors WHERE tenant_id = ? AND room_code = ? ORDER BY updated_at ASC LIMIT 100").bind(tenantId, roomCode).all();
    const items = result.results.flatMap((row) => { try { return [JSON.parse(row.payload)]; } catch { return []; } });
    return reply({ items, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/anchors") {
    const anchor = validateAnchorPayload(await readJson(request, 96 * 1024));
    await verifyTenantAccess(member, env, anchor.tenantId);
    await persistAnchor(env, anchor);
    return reply({ item: anchor, persisted: Boolean(env.DB), requestId }, 201);
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/anchors/")) {
    const id = safeId(url.pathname.split("/").pop());
    if (!id) return reply({ error: "Anchor id is required", requestId }, 400);
    if (env.DB) {
      await initialize(env.DB);
      const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
      await verifyTenantAccess(member, env, tenantId);
      await env.DB.prepare("DELETE FROM geo_anchors WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
    }
    return new Response(null, { status: 204, headers: capabilityHeaders({ "Cache-Control": "no-store", "X-Request-ID": requestId }) });
  }
  if (request.method === "GET" && url.pathname === "/api/twins/events") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const roomCode = safeId(url.searchParams.get("room")).toUpperCase().slice(0, 64);
    if (!roomCode) return reply({ error: "Room code is required", requestId }, 400);
    const result = await env.DB.prepare("SELECT id, twin_id, room_code, event_type, payload, created_at FROM digital_twin_events WHERE tenant_id = ? AND room_code = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId, roomCode).all();
    const items = result.results.map((row) => ({ id: row.id, twinId: row.twin_id, roomCode: row.room_code, eventType: row.event_type, payload: JSON.parse(row.payload || "{}"), createdAt: row.created_at }));
    return reply({ items, persisted: true, requestId });
  }
  if (request.method === "POST" && url.pathname === "/api/twins/events") {
    const event = validateTwinEvent(await readJson(request, 128 * 1024));
    await verifyTenantAccess(member, env, event.tenantId);
    await persistTwinEvent(env, event);
    return reply({ item: event, persisted: Boolean(env.DB), requestId }, 201);
  }
  if (request.method === "POST" && url.pathname === "/api/analytics/events") {
    const event = validateAnalyticsEvent(await readJson(request, 64 * 1024));
    await persistAnalytics(env, event);
    return reply({ accepted: true, persisted: Boolean(env.DB), id: event.id, requestId }, 202);
  }
  if (request.method === "POST" && url.pathname === "/api/sync") {
    const item = await readJson(request, MAX_JSON_BODY_BYTES);
    const id = safeId(item.id);
    const type = String(item.type || "").slice(0, 64);
    if (!id || !["proof:create", "proof:update", "proof:complete", "analytics:event"].includes(type)) return reply({ error: "Unsupported sync item", requestId }, 400);
    if (type.startsWith("proof:")) {
      const proof = await attestProof(validateProofPayload(item.payload), env);
      await verifyTenantAccess(member, env, proof.tenantId);
      await persistProof(env, proof);
    } else {
      await persistAnalytics(env, validateAnalyticsEvent(item.payload));
    }
    return reply({ synced: true, persisted: Boolean(env.DB), id, requestId }, 202);
  }
  if (request.method === "GET" && url.pathname === "/api/proofs") {
    if (!env.DB) return reply({ items: [], persisted: false, requestId });
    await initialize(env.DB);
    const tenantId = safeId(url.searchParams.get("tenantId"), "tech-at-nite");
    await verifyTenantAccess(member, env, tenantId);
    const result = await env.DB.prepare("SELECT payload FROM proof_records WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(tenantId).all();
    const items = result.results.flatMap((row) => {
      try { return [JSON.parse(row.payload)]; } catch { return []; }
    });
    return reply({ items, persisted: true, requestId });
  }
  return reply({ error: "Not found", requestId }, 404);
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const incomingRequestId = request.headers.get("X-Request-ID");
    const requestId = incomingRequestId && /^[a-zA-Z0-9_-]{8,120}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/health") {
      const deploymentRevision = safeLabel(env.DEPLOYMENT_REVISION || DEFAULT_DEPLOYMENT_REVISION).slice(0, 80);
      const response = json({ ok: true, service: "amx-air-hubs", version: SERVICE_VERSION, deploymentRevision, requestId, timestamp: new Date().toISOString() }, 200, requestId);
      return request.method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
    }
    if (url.pathname.startsWith("/api/")) {
      const startedAt = Date.now();
      try {
        const response = await handleApi(request, env, url, requestId);
        logEvent("info", "api.request", { requestId, method: request.method, path: url.pathname, status: response.status, durationMs: Date.now() - startedAt });
        return response;
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        logEvent(status >= 500 ? "error" : "warn", "api.error", { requestId, method: request.method, path: url.pathname, status, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown API error" });
        if (status >= 500) context?.waitUntil?.(notifyOps(env, "api.error", { requestId, method: request.method, path: url.pathname, status }));
        return json({ error: status >= 500 ? "Internal service error" : error.message, requestId }, status, requestId);
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || url.pathname.includes(".")) {
      const headers = new Headers(response.headers);
      Object.entries(capabilityHeaders()).forEach(([key, value]) => headers.set(key, value));
      const cacheControl = request.method === "GET" ? assetCacheControl(url.pathname) : null;
      if (cacheControl && response.ok) headers.set("Cache-Control", cacheControl);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    const readiness = runtimeReadiness(env);
    const runtimeConfig = JSON.stringify({
      supabaseUrl: env.SUPABASE_URL || "",
      supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY || "",
      livekitConfigured: readiness.components.livekit,
      persistenceConfigured: readiness.components.database,
      mediaStorageConfigured: readiness.components.media,
      roomTransport: readiness.roomTransport,
      deploymentMode: readiness.mode,
      deploymentTier: readiness.deploymentTier,
      version: SERVICE_VERSION,
    }).replace(/</g, "\\u003c");
    const nonce = base64Url(crypto.getRandomValues(new Uint8Array(18)));
    const html = APP_HTML.replace("</head>", `<script nonce="${nonce}">window.__AMX_CONFIG__=${runtimeConfig}</script></head>`);
    return new Response(html, { headers: htmlHeaders(nonce) });
  },
};

export class RoomHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const participant = safeId(new URL(request.url).searchParams.get("participant"), crypto.randomUUID().slice(0, 8));
    server.serializeAttachment({ participant });
    this.state.acceptWebSocket(server);
    this.broadcast({ id: crypto.randomUUID(), sender: participant, text: "joined the room", timestamp: new Date().toISOString(), kind: "presence" }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, payload) {
    const participant = socket.deserializeAttachment()?.participant || "participant";
    try { this.broadcast(sanitizeRoomMessage(payload, participant), socket); }
    catch { socket.send(JSON.stringify({ error: "Invalid room message" })); }
  }

  webSocketClose(socket) {
    const participant = socket.deserializeAttachment()?.participant || "participant";
    this.broadcast({ id: crypto.randomUUID(), sender: participant, text: "left the room", timestamp: new Date().toISOString(), kind: "presence" }, socket);
  }

  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket !== except) socket.send(payload);
    }
  }
}
