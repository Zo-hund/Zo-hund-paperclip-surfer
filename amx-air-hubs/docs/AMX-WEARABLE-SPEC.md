# AMX Wearable Specification

## Identifier

Canonical form: `AMX-W-000000127`. The ID is unique, immutable, non-secret, and independent of Printful, NFC, QR, blockchain, member, and order identifiers.

## Resolver

Canonical path: `/api/v1/scan/:wearableId`. A future vanity host may resolve `https://scan.amxlabs.com/w/:wearableId` to this API.

The resolver evaluates wearable state, tag state, public visibility, authenticated actor, ownership, tenant, access assets, and experience policy. It never trusts the scan itself as proof of ownership.

## Lifecycle

```text
DESIGN -> PRODUCT -> MANUFACTURED -> NFC_PROGRAMMED -> QC -> INVENTORY
-> ORDERED -> SHIPPED -> ACTIVATED -> OWNED
-> TRANSFERRED | REVOKED | RETIRED
```

Transitions are server-controlled, policy-checked, and append an immutable wearable event. Invalid backward transitions are rejected. Replacement links the new ID to the retired/revoked ID without reactivating the old tag.

## Tag payload

Gen-01 NFC and QR encode only an HTTPS resolver URL containing the wearable ID and, when used, a rotatable non-owner proof. No name, email, member ID, card data, wallet key, role, or long-lived authorization token is encoded.

## Visibility profiles

- **Public:** product name, collection, public status, public experience, and owner-approved public profile reference.
- **Authenticated member:** public fields plus member-relevant access.
- **Verified owner:** private twin, activation, transfer, loss, and replacement controls.
- **Authorized partner:** explicitly granted product, event, service, or support fields.
- **Operator:** tenant-scoped administration with audit.

## Digital twin

The twin references wearable, collection, generation, edition, product, owner relationship, credentials, projects, events, AIR-HUB, assets, status, and provenance. Optional blockchain records are representations of the AMX registry state.

## Lost wearable flow

Verify owner, mark lost, revoke active tag, preserve identity and twin, issue replacement, transfer eligible assets under policy, and append audit events. The former wearable resolves to a safe revoked response.

## Gen-01 acceptance tests

- Unique serialization and duplicate rejection.
- Valid lifecycle transitions and audit events.
- Public privacy and owner authorization matrix.
- Lost/revoked tag denial.
- QR/NFC resolver parity.
- Mobile HTTPS WebAR launch with a non-AR fallback.

