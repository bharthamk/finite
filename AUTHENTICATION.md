# Finite identity boundary

Finite is not an identity provider. It never accepts a password, stores a password hash, verifies an email address, runs account recovery, or owns a social-login client for somebody else's deployment.

## Product contract

Authentication answers **who is at the hatch**. Finite authorization maps that verified identity to exactly one private kitchen.

- A verified provider subject is the tenant key. Email and display name are presentation only.
- First use provisions the tenant namespace automatically. There is no Finite registration form.
- The raw provider subject is never stored. D1 stores only a SHA-256-derived identity key and opaque scope id.
- Every accepted plan, revision, receipt, evidence record, operator packet, and authority challenge remains scoped by that server-derived tenant id.
- Browser input and user-controlled headers never select a tenant.

## Supported deployment shapes

### ChatGPT Sites

Sites owns the complete Sign in with ChatGPT flow at `/signin-with-chatgpt` and `/signout-with-chatgpt`. The Worker consumes the stable Site-scoped `oai-authenticated-user-id` header. Optional email and decoded name are used only for display.

Finite owns no OAuth client, secret, callback, token refresh, password, or recovery flow in this mode.

### Isolated demo

A signed-out visitor may explicitly create a 24-hour demo session. The server generates an unguessable opaque bearer token, sends it only in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie, hashes it before storage, and creates a fresh `demo_…` tenant.

Demo tenants never adopt or copy an authenticated user's lineage. Ending the demo or encountering it after expiry purges its complete tenant namespace. No demo authority is transferable to a signed-in account.

### Portable self-hosting

The repository will expose the same internal principal shape to deployment adapters:

```text
issuer + stable provider subject -> verified principal -> hashed Finite tenant scope
```

The deployer owns its provider and infrastructure. A Google deployment therefore creates its own Google Cloud OAuth client, redirect URI, consent screen, secret, and hosting environment. Finite's installer can configure and verify those values, but the Finite project does not receive or operate them.

The portable adapter must validate OpenID Connect on the server and use the provider's immutable `sub` claim. It must not key a kitchen by email and must not trust identity headers arriving directly from the public internet. A reverse proxy may supply identity only when the deployment guarantees that it strips public copies and authenticates the upstream assertion.

## What “no accounts operated by Finite” means

Finite still keeps one minimal tenant row because authorization and data isolation require it. That row is not a login account: it contains no password, token, provider credential, mutable profile, billing identity, or recovery channel. Removing the deployment removes the operator, database, and all of its users; there is no central Finite service left behind.

## Next portable slice

Add a standard OIDC adapter and installer recipe after the hosted ChatGPT/demo journey is accepted. The installer should ask the deployer which identity route they want, write only local configuration templates, verify callback/origin settings, run migrations, and leave every credential in the deployer's own secret store.
