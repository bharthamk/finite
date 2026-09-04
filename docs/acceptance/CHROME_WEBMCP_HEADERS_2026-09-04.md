# Chrome WebMCP static delivery repair

## Observed failure

The user reports that the WebMCP flag is enabled, but a native Chrome console
call rejects with `SecurityError: document.modelContext cannot be used when
document.domain is enabled.` Installed Chrome version is 152.0.7977.76.

Before repair, public GET responses for `/` and
`/?start=demo-active&tour=complete` omit Origin-Agent-Cluster,
Cross-Origin-Opener-Policy and Permissions-Policy. `/api/auth/session` has all
three from the existing Worker. Vite dev/preview also sets isolation headers.
Thus Worker-only unit tests and local browser checks missed the static delivery
path. This does not establish that the browser flag was reset or that an
extension changed document.domain.

## Bounded repair

`public/_headers` applies the existing Worker origin-keying, opener isolation and
same-origin tools policy to static assets, including the HTML document. Vite
copies it unchanged to `dist/client/_headers`; packaging must retain that file.
No planning logic, authentication, database, dependency or GitHub changes.

The regression test compares these static policies with the Worker policies.
`npm run check:hosted:webmcp` is an explicit read-only public delivery check of
home, guided demo and independent demo HTML. It failed before publication with
`/: missing WebMCP origin isolation`. A successful deployment must pass it.

## Evidence and limits

- Full test suite after delivery correction: 381 passing tests; production build and chunk budget pass.
- Static header file must match the built and packaged file byte for byte.
- Live delivery is not proved until the hosted check passes after deployment.
- Native Chrome tool discovery and then a real operator call remain the final
  end-to-end acceptance gates. Do not claim the walkthrough is complete.
- Existing browsing contexts can retain origin-keying decisions: if a reload
  still reports the same error after headers are confirmed, close Finite tabs
  and reopen the same tour. Do not disable browser security.

Sources: Chrome's ModelContext `IsModelContextAllowed` implementation
(https://chromium.googlesource.com/experimental/chromium/src/+/e5861528c1070eab8e706d7a7c1b42dac502f6a1/third_party/blink/renderer/core/script_tools/model_context.cc),
Cloudflare static response headers
(https://developers.cloudflare.com/workers/static-assets/headers/).

## Hosted correction after first attempt

Sites version 249 deployed successfully but still omitted the headers, even on
a cache-busted GET. This managed static-delivery path does not honor `_headers`.
An unmatched route reached the Worker and returned its expected isolation
headers with a 404, establishing a usable server path.

The build now moves compiled `dist/client/index.html` to `finite-shell.html`.
Without a static index at the root, document requests reach the existing Worker,
which fetches that shell and applies its existing security headers. Development
retains the usual Vite index fallback. URLs and all compiled client assets are
unchanged. `_headers` remains defense in depth on hosting that honors it.

The build fails unless the static root index is absent and the actual built
Worker serves header-bearing HTML for root, index, complete demo, share and
collaboration routes. Hosted HTTP checks must still pass after publication;
successful unit tests alone do not establish this fix in production.

Version 250 exposed the static host's canonical-HTML redirect: fetching the
`.html` asset returned 307 to `/finite-shell`, which must never be forwarded to
the visitor because it would lose the demo query. The Worker now fetches the
canonical `/finite-shell` asset internally. Build mocks reproduce the redirect,
and the hosted check forbids redirects rather than silently following them.
