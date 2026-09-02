# Cross-Surface Construction Acceptance — 2026-08-27

## Outcome

The exact compiled kitchen now follows the authenticated consumer between
Codex's inline browser and the normal Site. Construction remains non-authoritative:
the draft can cross surfaces, but a human confirmation cannot.

This closes a live product failure. Codex compiled an arrival-bound v27 travel
draft in its inline browser, where the exact review controls appeared. The same
signed-in Site in Chrome still showed only the reviewed arrival because the
construction packet was browser-local. Sites version 41 moved that packet to an
authenticated D1 repository and retained local storage only as a cache and
one-time migration source.

Accepted plan truth remained `plan_travel_europe` revision 3 throughout.

## Persistence and authority law

One current construction row exists per authenticated tenant. A save is accepted
only when the server verifies:

- packet checksum, identifier, seven-day lifetime, and bounded payload;
- current accepted plan id, profile hash, and revision;
- exact current arrival order id, version, checksum, and reviewed status when an
  arrival order governs construction; and
- absence of confirmation, approval, authority, or challenge identifiers anywhere
  in the payload.

Startup reads the server packet first. A valid pre-version-41 local packet may be
adopted once when the server has no packet. The authenticated copy is then the
source of truth for every surface. Restoration recreates the same draft hashes
but always sets human authority to absent.

Discard writes a server tombstone rather than creating an ambiguous empty state.
The same packet, or an older surface packet created before the tombstone, cannot
be uploaded again. This prevents a delayed browser from resurrecting a kitchen
the human returned on another surface.

## Live journey

1. Arrival `arrival_3b9dfea46b2b3025` v27 was already human-reviewed, checksum
   `303dbc8f01c341c5555b04526de04914fd566c0b28726517ce5c14cab6ce7155`.
2. Codex assessed and compiled an adaptive travel shell in the inline browser.
3. The resulting packet was `construction_aea68b33a4493416`, checksum
   `aea68b33a449341669626b63a9a8b366b5a15dd639663f14eab7bd52631f0e32`.
4. The exact inert draft was `plan_draft_9d8b23c84a38d655`, content hash
   `9d8b23c84a38d655e6268918c8589afa90d04f160f961054a8a7f78e85ac4081`,
   profile hash
   `460b5f9632b5d32cc11e6f1860136799d95d0b10e7d42e405c4ebec43f7f9da0`.
5. After version 41 deployed, the inline browser adopted that exact local packet
   into authenticated D1.
6. Chrome reloaded independently and rendered the same title, profile proof,
   draft proof, six dependencies, six working assumptions, and both human review
   controls.
7. Fresh WebMCP entry returned `awaiting_human`, the same packet and draft ids,
   `humanAuthorityPersisted:false`, `acceptedStateChanged:false`, and accepted
   source revision 3.

No confirmation or activation was performed during this acceptance.

## Proof

- Source commit: `b18c58d19de8c5e11cc4cc2426bdc07823e24908`.
- Automated suite: 91/91 pass.
- TypeScript typecheck: pass.
- Vite production build: pass.
- Drizzle migration check: pass.
- Private Sites version: 41.
- Deployment: `appgdep_6a8f362f9d148191b4b5560180ad58a9`.
- Archive hash: `sha256:7397ed1eade3790abd602526b3afb991ed266461bc7ddf440858e67cbf7c4927`.
- Live Site: <https://finite-plan-kitchen.bharthamk.chatgpt.site/>.

## Product consequence

The surface boundary is now honest. Codex may prepare the kitchen wherever it is
operating, and the human may consume and judge that exact work wherever the Site
is open. The system synchronizes useful preparation and explicit rejection; it
does not synchronize or manufacture human authority.
