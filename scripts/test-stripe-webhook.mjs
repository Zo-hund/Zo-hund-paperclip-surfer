/**
 * Test script: fires a signed checkout.session.completed webhook at the local server.
 * Usage: node scripts/test-stripe-webhook.mjs
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

// Load env from ~/.paperclip/instances/default/.env
const envPath = join(os.homedir(), ".paperclip", "instances", "default", ".env");
const envVars = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const STRIPE_SECRET_KEY = envVars.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = envVars.STRIPE_WEBHOOK_SECRET;
const SERVER = "http://127.0.0.1:3101";
const COMPANY_ID = "2fc41a2f-a739-4dc8-a15d-d01c8833d92d";
const TEST_USER_ID = "stripe-test-user-001";
const TIER = "builder"; // grants ["builder","learner"]

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
  console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET in env");
  process.exit(1);
}

// Use customer.subscription.updated — full subscription object embedded, no extra Stripe API call needed
const now = Math.floor(Date.now() / 1000);
const payload = JSON.stringify({
  id: `evt_test_${now}`,
  object: "event",
  api_version: "2026-05-27.dahlia",
  created: now,
  type: "customer.subscription.updated",
  data: {
    object: {
      id: `sub_test_${now}`,
      object: "subscription",
      customer: `cus_test_${now}`,
      status: "active",
      current_period_end: now + 30 * 24 * 3600,
      metadata: {
        companyId: COMPANY_ID,
        userId: TEST_USER_ID,
        tierName: TIER,
      },
      items: {
        object: "list",
        data: [
          {
            id: `si_test_${now}`,
            price: { id: `price_test_${now}`, object: "price" },
          },
        ],
      },
    },
  },
});

// Stripe signature format: t=TIMESTAMP,v1=HMAC-SHA256(secret, "TIMESTAMP.PAYLOAD")
const hmac = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
  .update(`${now}.${payload}`)
  .digest("hex");
const sig = `t=${now},v1=${hmac}`;

console.log(`\nPOST ${SERVER}/stripe/webhook`);
console.log(`Event: customer.subscription.updated`);
console.log(`Tier: ${TIER} → memberTypes: [builder, learner]`);
console.log(`UserId: ${TEST_USER_ID}\n`);

const res = await fetch(`${SERVER}/stripe/webhook`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": sig,
  },
  body: payload,
});

const body = await res.text();
console.log(`Response: ${res.status} ${body}`);

if (res.ok) {
  // Verify the DB row was created
  console.log("\nVerifying stripe_subscriptions row...");
  const dash = await fetch(
    `${SERVER}/api/companies/${COMPANY_ID}/lms/members?memberType=builder`,
    { headers: { "Content-Type": "application/json" } },
  );
  if (dash.ok) {
    const data = await dash.json();
    console.log("Member roster response:", JSON.stringify(data, null, 2).slice(0, 500));
  }
}
