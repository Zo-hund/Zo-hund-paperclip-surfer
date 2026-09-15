type ApiOptions = { baseUrl: string; token: string; runId: string; signal?: AbortSignal };
type ApiRequest = { method: string; path: string; body?: unknown };
const MAX_BYTES = 262_144;

export function platformUrl(baseUrl: string, requestPath: string): URL {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid configured Paperclip API origin.');
  }
  if (!/^\/api\/[A-Za-z0-9_\-/]+(?:\?[^#\\]*)?$/.test(requestPath) || requestPath.includes('..')) {
    throw new Error('Paperclip API paths must be absolute /api/ paths on the configured platform.');
  }
  const url = new URL(requestPath, base);
  if (url.origin !== base.origin) throw new Error('External Paperclip API target rejected.');
  return url;
}

/** Credentials and routing come from the runtime, never from model arguments. */
export function createPaperclipApi(options: ApiOptions) {
  return async (request: ApiRequest): Promise<unknown> => {
    const url = platformUrl(options.baseUrl, request.path);
    if (!options.token || !options.runId) throw new Error('Paperclip runtime authentication is unavailable.');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) throw new Error('Invalid Paperclip API method.');
    if (request.body !== undefined && (request.method === 'GET' || request.body === null || typeof request.body !== 'object' || Array.isArray(request.body))) {
      throw new Error('Paperclip API body must be a JSON object for a mutation.');
    }
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    if (body && Buffer.byteLength(body) > MAX_BYTES) throw new Error('Paperclip API request is too large.');
    let response: Response;
    try {
      response = await fetch(url, {
        method: request.method, body, signal: options.signal, redirect: 'error',
        headers: { Authorization: `Bearer ${options.token}`, 'X-Paperclip-Run-Id': options.runId, 'Content-Type': 'application/json' },
      });
    } catch { throw new Error('Paperclip API request failed or timed out; no credentials were disclosed.'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Paperclip API returned HTTP ${response.status}; operation not completed.`);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error('response limit'); }
        chunks.push(value);
      }
    } catch { throw new Error('Paperclip API response was interrupted or exceeded the size limit.'); }
    const text = Buffer.concat(chunks).toString('utf8');
    if (response.status === 204) return null;
    try {
      // Avoid reflecting a credential if a server response happens to echo it.
      return JSON.parse(text.replaceAll(options.token, '[REDACTED]'));
    } catch { throw new Error('Paperclip API returned invalid JSON.'); }
  };
}

type Api = ReturnType<typeof createPaperclipApi>;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Read persisted state; model prose and generic process exit are not delivery evidence. */
export async function verifyAssignedDelivery(api: Api, input: { taskId: string; companyId: string; agentId: string; baseUrl: string }) {
  const root = `/api/issues/${encodeURIComponent(input.taskId)}`;
  const identity = record(await api({ method: 'GET', path: '/api/agents/me' }));
  if (identity.id !== input.agentId || identity.companyId !== input.companyId) throw new Error('Delivery verification failed: runtime identity mismatch.');
  const issue = record(await api({ method: 'GET', path: root }));
  if (issue.id !== input.taskId || issue.companyId !== input.companyId || issue.assigneeAgentId !== input.agentId) throw new Error('Delivery verification failed: task ownership mismatch.');
  if (!['in_review', 'done'].includes(String(issue.status))) throw new Error('Delivery verification failed: assigned issue is not in review or done.');
  const products = await api({ method: 'GET', path: `${root}/work-products` });
  if (!Array.isArray(products)) throw new Error('Delivery verification failed: invalid work-product response.');
  for (const entry of products) {
    const product = record(entry);
    if (product.companyId !== input.companyId || product.issueId !== input.taskId || product.status !== 'active' || product.isPrimary !== true || product.provider === 'system') continue;
    if (typeof product.url !== 'string') continue;
    let url: URL;
    try { url = new URL(product.url, input.baseUrl); } catch { continue; }
    // External previews/PRs need connector-specific verification. Never send runtime credentials to them.
    if (url.origin !== new URL(input.baseUrl).origin || url.search || url.hash) continue;
    const prefix = `${root}/documents/`;
    if (!url.pathname.startsWith(prefix) || !url.pathname.endsWith('/export')) continue;
    const key = url.pathname.slice(prefix.length, -'/export'.length);
    if (!/^[a-z0-9_-]+$/.test(key)) continue;
    const doc = record(await api({ method: 'GET', path: `${prefix}${key}` }));
    if (typeof doc.body === 'string' && doc.body.trim()) return;
  }
  throw new Error('Delivery verification failed: no registered readable primary document. External or non-document outputs require a verified platform document containing their evidence; their URLs are not fetched automatically.');
}
