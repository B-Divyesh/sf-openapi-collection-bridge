# Convert API collections — independent verification 3

**Verdict: FAIL**

- **Finding count:** 1
- **Untested public claim count:** 0
- **Implementation reviewed:** `16baf1454eebfb1672af41dfaded0fbc58385e63`
- **Documentation head:** `5b5e8a535a6f0a7e5e825dd3e7461683fcd2a913`
- **Live URL:** <https://openapi-collection-bridge.sociobot.in/>
- **Review date:** 2026-09-06

The free CLI, packaged artifact, sample sandbox, and static site passed the checks below. The product cannot receive a PASS while its public Pro purchase link returns HTTP 404.

## First screen

Fresh desktop (1440×900) and phone (390×844) sessions showed this before scrolling:

- Job: **Convert API collections without silent loss**.
- Audience: API teams moving between local clients.
- First action: **Try it with sample data**. It says it loads three parcel requests and a populated report.
- Facts: local use without an account, credential values stripped by default, and free core with Pro at $29 once.

There was no horizontal overflow or browser console/page error in either session.

## Finding

### F1 — High — Pro checkout is unavailable

The live buy link correctly points at the production Sociobot endpoint:

`https://api.sociobot.in/api/v1/products/openapi-collection-bridge/checkout`

On 2026-09-06, a safe unauthenticated request to that exact public checkout URL returned **HTTP 404**. The expected $29 production offer has not been registered, so a visitor cannot buy Pro or obtain a usable license for the advertised migration planner and GitHub Actions policy. This makes the public statement that “Pro costs $29 once” incomplete in live production.

This is the stated external billing dependency. It is not a code repair request. The production billing operator must register the prepared offer, then this checkout route must be retested before a PASS can be issued.

## Clean checkout checks

I cloned the repository into a new temporary directory, checked out implementation `16baf1454eebfb1672af41dfaded0fbc58385e63`, installed documented prerequisites with `npm ci`, and ran:

| Command | Result |
| --- | --- |
| `npm ci` | PASS — 59 packages, 0 audit vulnerabilities. |
| `npm run typecheck` | PASS. |
| `npm test` | PASS — 5 Rust unit tests, 12 Rust end-to-end tests, 4 browser converter tests, 33 claim tests, and both policy checks. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings` | PASS. |
| `npm run build` | PASS — `target/release/ocb` and `dist/site/` produced. Initial JS gzip: 7.72 KB; CSS gzip: 3.74 KB. |
| `cargo package --manifest-path cli/Cargo.toml --allow-dirty` | PASS — package verification build passed; 29.9 KB compressed. |

The only difference between the implementation and documentation commits is `.factory/handoff.md`; the live root, demo, privacy, terms, 404, and service-worker bytes match the production build from the implementation commit. The live main asset is `main-FYUVt9Ut.js`, matching that build.

## Claim checks

Every command declared in `.factory/claims.json` ran individually from the clean checkout in the form `npm run test:claim -- --testNamePattern @claim:<id>`. All 33 passed.

| Claim ID | Result | Claim ID | Result |
| --- | --- | --- | --- |
| five-format-conversion | PASS | semantic-report | PASS |
| credential-redaction | PASS | deterministic-output | PASS |
| source-control-output | PASS | no-telemetry | PASS |
| local-conversion-network | PASS | markdown-report | PASS |
| format-detection | PASS | json-streams | PASS |
| exit-codes | PASS | openapi-semantics | PASS |
| postman-semantics | PASS | insomnia-semantics | PASS |
| bruno-semantics | PASS | curl-semantics | PASS |
| browser-download | PASS | offline-demo | PASS |
| single-binary | PASS | no-account | PASS |
| free-core | PASS | pro-price | PASS |
| pro-planner | PASS | pro-ci-policy | PASS |
| license-return | PASS | license-daily-cache | PASS |
| restore-license | PASS | revoked-license | PASS |
| no-tracking | PASS | memory-only-demo | PASS |
| demo-sandbox | PASS | variable-url-roundtrip | PASS |
| designed-404 | PASS |  |  |

The `pro-price` sandbox correctly verifies the page copy and production checkout destination, but cannot establish that the external production offer exists. The live 404 above is therefore a finding, not an untested claim.

## CLI and sample checks

I unpacked the generated crate into a new temporary consumer directory, installed it into a separate temporary `cargo` root, and ran the installed binary only:

```sh
ocb --version
ocb formats --json
ocb demo
```

It reported `ocb 0.1.1`, listed OpenAPI, Postman, Insomnia, Bruno, and cURL, and ran the three-request bundled sample. It printed temporary OpenAPI output and Markdown evidence-report paths. The normal, invalid, boundary, and recovery CLI paths are also covered by the individually run claim tests, including documented exit codes 0, 2, 3, and 4.

## Browser, accessibility, privacy, and routes

- `/opt/fleet/lib/verify-url.sh` passed on `/` and `/demo/`: each has the expected title, `lang="en"`, exactly one `h1`, `main`, image alt text, and no unlabeled buttons or console errors.
- `AUDIT_URL=https://openapi-collection-bridge.sociobot.in npm run test:a11y` passed with zero serious or critical axe findings and zero console/page errors on `/`, `/demo/`, `/privacy/`, `/terms/`, and `/404.html`.
- The fresh one-click sample produced 3 requests, 3 preserved results, 1 transformed result, and 1 unsupported result. The populated Bruno preview retained API-key authentication and `X-Trace`; it explicitly lists the response example as unsupported for Bruno.
- The persistent label remained **Demo — sample data, nothing is saved**. Reset restored the original source after an edit. A real-storage marker remained unchanged, and no `demo:` storage keys appeared. Invalid JSON produced the clear JSON/YAML guidance, then reset recovered the sample.
- Keyboard skip navigation focused `main`. Focus, phone layout, and reduced-motion behaviour are covered by the live audit and claim suite. Offline reload and conversion passed in the dedicated fresh-context claim.
- The page has no third-party conversion, tracking, analytics, font, or advertising requests in the claim suite. The static product has no backend tenant, restart, health, or 429 path; those checks do not apply.
- `/privacy/`, `/terms/`, and the repository source link returned 200. `/missing-verify-3` deliberately returned HTTP 404 with title **Page not found — OpenAPI Collection Bridge**, heading **This page was not found**, and a home link.
- Live security headers include CSP, HSTS, `X-Content-Type-Options`, Referrer Policy, and Permissions Policy. HTML uses revalidation caching.

## Earlier findings

| Earlier finding | Current disposition |
| --- | --- |
| F1: Postman base-URL variables corrupted paths | Fixed. `@claim:variable-url-roundtrip` passed. |
| F2: Browser demo silently dropped auth, headers, and examples | Fixed. Fresh live output included API-key auth and `X-Trace`, and named the unsupported response example. |
| F3: No real CLI/browser demo sandbox | Fixed. Installed `ocb demo`, one-click `/demo/`, persistent label, reset, and Start for real all worked. |
| F4: Checkout used the pilot host | Fixed in code: the public link now uses the production host. The new live-offer finding above remains open. |
| F5: Paid CI policy was absent | Fixed in the valid-license claim sandbox. It downloads reusable YAML. |
| F6: Claims registry was absent | Fixed. 33 declarations mapped to 33 individually passing tagged tests. |
| F7: Unknown URL returned the home page | Fixed. Live unknown URL returned the designed HTTP 404. |
| F8: First-screen copy and required sections were incomplete | Fixed. The first-screen check, copy audit, How it works, and privacy/limits section passed review. |
| F9: Metadata and shared site structure were incomplete | Fixed. Route titles, metadata, legal routes, consistent footer, and assets are present. |
| F10: Skip link did not move focus | Fixed. Enter moved active focus to `main`. |
| Earlier auth, exit-code, mobile target, CSP/cache, and Lighthouse-connection observations | Auth and exit paths pass claims; no mobile overflow or console errors were reproduced; required live headers are present. The previous Lighthouse result is documented, while this verification independently ran the project’s live axe and URL audits. |

## Evidence

- `/work/.evidence/openapi-collection-bridge-verify-3/desktop-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-verify-3/phone-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-verify-3/verify.json`

## Next step

Register the prepared $29 production offer with the Sociobot billing operator. Retest the exact checkout URL and a returned-license flow. No product-code change is required for this finding.
