#!/usr/bin/env node

const apiToken = requiredEnv("CLOUDFLARE_API_TOKEN");
const zoneId = requiredEnv("CLOUDFLARE_ZONE_ID");
const name = requiredEnv("DNS_RECORD_NAME");
const content = requiredEnv("DNS_RECORD_CONTENT");
const explicitType = process.env.DNS_RECORD_TYPE?.trim().toUpperCase();
const type = explicitType || inferRecordType(content);
const proxied = parseBoolean(process.env.DNS_RECORD_PROXIED ?? "true");
const ttl = Number.parseInt(process.env.DNS_RECORD_TTL ?? "1", 10);

const baseUrl = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is required.`);
    process.exit(1);
  }
  return value;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function inferRecordType(value) {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return "A";
  if (/^[0-9a-f:]+$/i.test(value) && value.includes(":")) return "AAAA";
  return "CNAME";
}

async function cloudflare(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success === false) {
    const errors = body?.errors?.map((error) => error.message).join("; ") || response.statusText;
    throw new Error(`Cloudflare API request failed: ${errors}`);
  }

  return body;
}

const list = await cloudflare(`?name=${encodeURIComponent(name)}&per_page=100`);
const records = list.result ?? [];
const matching = records.find((record) => record.type === type);
const conflicting = records.filter((record) => record.type !== type);

if (conflicting.length > 0) {
  const summary = conflicting.map((record) => `${record.type} ${record.name}`).join(", ");
  throw new Error(`Refusing to modify ${name}; conflicting Cloudflare DNS record(s) exist: ${summary}`);
}

const payload = {
  type,
  name,
  content,
  ttl,
  proxied,
  comment: "Managed by Deploy AMX Cluster workflow",
};

if (matching) {
  await cloudflare(`/${matching.id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  console.log(`Updated Cloudflare DNS record ${type} ${name}.`);
} else {
  await cloudflare("", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(`Created Cloudflare DNS record ${type} ${name}.`);
}
