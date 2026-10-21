# Dependency security patch refresh - 2026-10-21

The existing frozen dependency graph reports fourteen HIGH and one CRITICAL finding. This patch updates only scoped root overrides and the generated pnpm9.15.4 lockfile; it keeps reviewed backports, lifecycle restrictions, workflow gates and Vite major lines intact.

## Versions

| Package | Previous resolved version | Patched version |
|---|---|---|
| proxy-addr |2.0.7|2.0.8|
| fast-uri |3.1.6|3.1.7|
| undici |7.29.0|7.29.1|
| source-map-js |1.2.1|1.2.2|
| sharp |0.35.4|0.35.5|
| @modelcontextprotocol/sdk |1.29.0|1.32.0|
| vite6 |6.4.3|6.4.4|
| vite7 |7.3.6|7.3.7|

Patched ranges were verified against the official GitHub advisory records below; exact published versions, integrity metadata and Node engine requirements were checked in the npm registry. The existing Undici7 and Vite6/7 paths are preserved. No production dependency is removed or advisory suppressed.

## Official advisories

- [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw): MCP TypeScript SDK: Experimental tasks were not tied to the session that created them
- [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453): MCP TypeScript SDK: One HTTP request within the default size limit could exhaust server memory during validation
- [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm): launch-editor: `fs.existsSync()` existence check can be bypassed on Windows
- [GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g): fast-uri vulnerable to host confusion via an unclosed bracket in the URI authority
- [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): source-map-js allows event-loop denial of service through indexed source-map section offsets
- [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h): MCP TypeScript SDK: OAuth client could send credentials to an authorization server chosen by the MCP server
- [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet
- [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3): fast-uri vulnerable to authority injection via an unvalidated port in serialize
- [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5): undici vulnerable to Denial of Service via unrequested WebSocket subprotocol
- [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3): undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool
- [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): sharp : Vulnerability in librsvg dependency CVE-2026-96889

## Validation and limits

Frozen installation uses pinned pnpm9.15.4 with lifecycle scripts disabled. Fresh audit has zero HIGH/CRITICAL findings;54 moderate and12low remain and are not suppressed. The scoped patch does not claim all vulnerabilities are resolved. Native sharp0.35.5 loads and encodes/decodes PNG; its loaded librsvg version is2.63.2. Non-network proxy trust, URI parsing, source-map round-trip, Undici exports and MCP server module-load smoke checks pass. Full repository typecheck, test and build results are recorded in the review receipt/PR, separately from calendar compatibility.

This is not a container/OS scan, live authentication test, deployment approval or renewal of dated first-party backport reviews. The existing reviewed-backport document states expiry2026-10-15; retain that gate and re-evaluate through the governed image-specific process rather than changing or bypassing it. No production services, credentials, permissions or workflows are changed.

## Local verification receipt

Dependency-only recursive typecheck and full workspace build pass. The exact full test command remained at its banner for about five minutes; a bounded threaded diagnostic passed eight adapter tests then stopped advancing. Neither is a full-suite pass. Only those local test processes were stopped. No test or workflow was skipped/changed to manufacture a passing gate.

A separate combined checkout applies this dependency patch plus the four calendar PR files. Combined recursive typecheck and full workspace build pass, all eight permanent calendar UI tests pass, and fifteen existing server calendar and native org-chart tests pass. Its whole-workspace threaded test attempt also stalled without a summary. Linux CI and the governed container/image checks remain required. Earlier current-base full-suite success predates these dependency changes and is not substituted for their incomplete full-suite results.

The non-JSON `pnpm audit --audit-level=high` gate exits zero. pnpm9 JSON audit exits one whenever any severity remains, so its exit one and full66-finding report are retained; no finding is filtered from the JSON evidence.
