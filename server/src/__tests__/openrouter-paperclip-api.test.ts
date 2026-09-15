import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPaperclipApi, verifyAssignedDelivery } from '../../../packages/adapters/openrouter/src/server/paperclip-api.js';

const options = { baseUrl: 'http://platform:3100', token: 'runtime-secret', runId: 'run' };
const json = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => vi.unstubAllGlobals());

describe('native Paperclip API', () => {
  it('serializes JSON and supplies runtime-only authentication and run headers', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true })); vi.stubGlobal('fetch', fetch);
    await createPaperclipApi(options)({ method: 'POST', path: '/api/issues/task/checkout', body: { agentId: 'agent' } });
    expect(String(fetch.mock.calls[0][0])).toBe('http://platform:3100/api/issues/task/checkout');
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', body: '{"agentId":"agent"}', headers: {
      Authorization: 'Bearer runtime-secret', 'X-Paperclip-Run-Id': 'run', 'Content-Type': 'application/json',
    } });
  });
  it.each(['https://outside/api/x', '//outside/api/x', '/api/../x', '/api/%2e%2e/x', '/api/x\\y', '/not-api/x'])('rejects target %s before fetch', async (path) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(createPaperclipApi(options)({ method: 'GET', path })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 302, 500])('rejects HTTP %s without exposing response secrets', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('runtime-secret', { status })));
    await expect(createPaperclipApi(options)({ method: 'GET', path: '/api/agents/me' })).rejects.toThrow(`HTTP ${status}`);
  });
  it('redacts a reflected key and rejects malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ value: 'runtime-secret' })).mockResolvedValueOnce(new Response('invalid')));
    const api = createPaperclipApi(options);
    expect(await api({ method: 'GET', path: '/api/agents/me' })).toEqual({ value: '[REDACTED]' });
    await expect(api({ method: 'GET', path: '/api/agents/me' })).rejects.toThrow('invalid JSON');
  });
  it('rejects oversized response and malformed mutation body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(262145))));
    const api = createPaperclipApi(options);
    await expect(api({ method: 'GET', path: '/api/agents/me' })).rejects.toThrow('size limit');
    await expect(api({ method: 'POST', path: '/api/agents/me', body: 'bad' })).rejects.toThrow('JSON object');
  });
  it('passes the deadline signal and reports aborted requests safely', async () => {
    const controller = new AbortController(); controller.abort();
    const fetch = vi.fn().mockRejectedValue(new Error('runtime-secret')); vi.stubGlobal('fetch', fetch);
    await expect(createPaperclipApi({ ...options, signal: controller.signal })({ method: 'GET', path: '/api/agents/me' })).rejects.toThrow('timed out');
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('assigned delivery readback', () => {
  const input = { taskId: 'task', companyId: 'company', agentId: 'agent', baseUrl: options.baseUrl };
  const identity = { id: 'agent', companyId: 'company' };
  const issue = { id: 'task', companyId: 'company', assigneeAgentId: 'agent', status: 'in_review' };
  const product = { companyId: 'company', issueId: 'task', status: 'active', isPrimary: true, provider: 'agent-sync', url: '/api/issues/task/documents/deliverable/export' };
  it('requires readable persisted content after matching ownership and status', async () => {
    const api = vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce(issue).mockResolvedValueOnce([product]).mockResolvedValueOnce({ body: '# Verified artifact' });
    await expect(verifyAssignedDelivery(api, input)).resolves.toBeUndefined();
    expect(api).toHaveBeenLastCalledWith({ method: 'GET', path: '/api/issues/task/documents/deliverable' });
  });
  it.each([{ ...identity, companyId: 'other' }, { ...identity, id: 'other' }])('rejects runtime scope mismatch', async me => {
    await expect(verifyAssignedDelivery(vi.fn().mockResolvedValue(me), input)).rejects.toThrow('identity mismatch');
  });
  it.each([{ ...issue, companyId: 'other' }, { ...issue, assigneeAgentId: 'other' }])('rejects task scope mismatch', async task => {
    await expect(verifyAssignedDelivery(vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce(task), input)).rejects.toThrow('ownership mismatch');
  });
  it('rejects incomplete status', async () => {
    await expect(verifyAssignedDelivery(vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce({ ...issue, status: 'backlog' }), input)).rejects.toThrow('not in review');
  });
  it.each([[], [{ ...product, provider: 'system' }], [{ ...product, companyId: 'other' }], [{ ...product, url: 'https://outside/preview' }]].map(products => ({ products })))('rejects missing or unverifiable products without external fetching', async ({ products }) => {
    const api = vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce(issue).mockResolvedValueOnce(products);
    await expect(verifyAssignedDelivery(api, input)).rejects.toThrow('no registered readable');
    expect(api).toHaveBeenCalledTimes(3);
  });
  it('rejects an empty document', async () => {
    const api = vi.fn().mockResolvedValueOnce(identity).mockResolvedValueOnce(issue).mockResolvedValueOnce([product]).mockResolvedValueOnce({ body: ' ' });
    await expect(verifyAssignedDelivery(api, input)).rejects.toThrow('no registered readable');
  });
});
