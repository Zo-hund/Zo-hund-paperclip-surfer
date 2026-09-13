# AMX auxiliary source preservation

The upstream migration retains 591 baseline-tracked files from
`daaae8eb4a885b80e3ac0dcaf611b3ed09361d9d` in these areas:

- `amx-air-hubs`: the separate Cloudflare Worker application and its contracts.
- `amx-xr-pathfinder-unity`: XR source, scenes and assets.
- `runpod-worker` and `voice-agent`: auxiliary runtime source.
- `deploy/release`: governed release and runtime verification helpers.

All 591 staged Git blob identities match the baseline exactly in the preservation
commit. Test caches are excluded. PDF attributes prevent line-ending conversion
from damaging byte offsets on Windows. Existing whitespace in generated Unity
assets and imported documentation is retained as part of source preservation.

The Worker contract suite passes 250 tests. The release helper rejection suite
passes nine tests. These results do not establish a Worker build, a running XR
environment, provider integration, or deployment readiness.

The restored Worker example configuration contains both AMX-HUBS and AMX-AIR-HUBS
references. They have not been substituted. Review peer links, callback origins,
Cloudflare bindings and the Hostinger board API separately before any deployment.
AMX-HUBS.cc remains a different project; this migration does not repoint it.

These sources are preserved for integration and review. Root application routing,
package membership, image contents and release entrypoints still require explicit
validation. No nested workflow or restored helper is authority to deploy.
