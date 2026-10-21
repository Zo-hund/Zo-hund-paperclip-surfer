// Exercises real npm cache dependencies with loopback-only fixtures.
// This is compatibility/regression coverage, not a tenant isolation certification.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const http = require('node:http');
const req = createRequire(path.resolve(process.argv[2] || '/usr/local/lib/node_modules/npm/package.json'));
const CachePolicy = req('http-cache-semantics');
assert.equal(req('http-cache-semantics/package.json').version, '4.3.0');
assert.ok(req('semver').satisfies('4.3.0', req('make-fetch-happen/package.json').dependencies['http-cache-semantics']));
let cases = 0;
for (const vary of [' * ', 'weather, *']) {
  const request = { url: 'http://cache-test.invalid/', headers: { weather: 'ok' } };
  const response = { headers: { 'cache-control': 'max-age=600', vary } };
  assert.equal(new CachePolicy(request, response).satisfiesWithoutRevalidation(request), false);
  cases++;
}
for (const vary of ['constructor', '__proto__']) {
  const original = { headers: { [vary]: 'fixture-only' } };
  const inherited = { headers: Object.create({ [vary]: 'fixture-only' }) };
  const policy = new CachePolicy(original, { headers: { 'cache-control': 'max-age=600', vary } });
  assert.equal(policy.satisfiesWithoutRevalidation(inherited), false);
  cases++;
}
for (const control of ['private, max-age=600', 'no-store, max-age=600']) {
  const request = { headers: { authorization: 'Bearer fixture-only' } };
  const policy = new CachePolicy(request, { headers: { 'cache-control': control, 'set-cookie': 'fixture-only=1' } });
  assert.equal(policy.storable(), false);
  cases++;
}
(async () => {
  let hits = { public: 0, private: 0 };
  const server = http.createServer((request, response) => {
    const key = request.url === '/public' ? 'public' : 'private';
    hits[key]++;
    response.setHeader('Cache-Control', request.url === '/no-store' ? 'no-store' : `${key}, max-age=600`);
    if (request.url === '/private') response.setHeader('Vary', 'Authorization');
    response.end(`${key}-${hits[key]}`);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = `http://127.0.0.1:${server.address().port}`;
    const cachePath = await fs.mkdtemp(path.join(os.tmpdir(), 'amx-runtime-cache-fixture-'));
    const fetch = req('make-fetch-happen').defaults({ cachePath, retry: 0 });
    const public1 = await (await fetch(`${address}/public`)).text();
    const public2 = await (await fetch(`${address}/public`)).text();
    assert.equal(public1, public2);
    assert.equal(hits.public, 1);
    const private1 = await (await fetch(`${address}/private`, { headers: { authorization: 'Bearer fixture-A' } })).text();
    const private2 = await (await fetch(`${address}/private`, { headers: { authorization: 'Bearer fixture-B' } })).text();
    assert.notEqual(private1, private2);
    assert.equal(hits.private, 2);
    const noStore1 = await (await fetch(`${address}/no-store`)).text();
    const noStore2 = await (await fetch(`${address}/no-store`)).text();
    assert.notEqual(noStore1, noStore2);
    assert.equal(hits.private, 4);
    cases += 3;
    console.log(JSON.stringify({ passed: true, actualVersion: req('http-cache-semantics/package.json').version, npm: req('./package.json').version, cases, consumer: 'actual make-fetch-happen', externalNetworkCalls: 0, providerCalls: 0 }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
