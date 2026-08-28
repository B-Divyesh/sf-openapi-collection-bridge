# OpenAPI Collection Bridge v0.1.0 repair handoff

## Repair status

The release-blocking findings recorded in the independent verification report for candidate `f76e47c50add66431e1a589e2d2aa925de8082d3` are repaired in this revision.

- **P1 authentication corruption:** Postman Basic, bearer, API-key, and OAuth 2.0 auth now map to native OpenAPI security schemes instead of one fabricated bearer `bridgeAuth` scheme. API-key `name` and `in` location are preserved. Request-specific credentials, which OpenAPI security schemes deliberately cannot contain, are retained in `x-bridge-auth-fields` so a Bridge round trip is lossless. Unknown auth types are explicitly reported as unsupported for native OpenAPI rather than silently represented as bearer auth.
- **P1 reverse mapping:** OpenAPI HTTP Basic, bearer, API-key header/query location, and OAuth flow metadata now export to their corresponding Postman auth arrays without collapsing to a token placeholder.
- **Evidence integrity:** Every migrated auth item has a request-specific report row. Native mappings are marked transformed with a description of the native scheme and extension; unrecognised formats are marked unsupported and make `--fail-on-loss` exit 4.
- **P2 exit contract:** parse/detection/inventory errors exit 2; write/export errors exit 3; loss-policy errors exit 4, matching the README.
- **P2 mobile targets:** footer links are at least 44 × 44 CSS pixels at 390px (including short “Home” links on legal pages).
- **P2 response policy:** `site/public/staticwebapp.config.json` configures Azure Static Web Apps with a self-only CSP, restrictive Permissions Policy, nosniff/referrer protections, immutable caching for `/assets/*` and image assets, and revalidation for HTML and the service worker. `site/public/_headers` supplies the same policy for compatible non-Azure static hosts. Both are copied into `dist/site/` by the production build.

## Regression coverage

`cli/tests/end_to_end.rs` adds executable fixtures for:

- Postman → OpenAPI Basic, API-key in header/query, and OAuth 2.0 flow export, including the exact `securitySchemes`, `x-bridge-auth-fields`, and evidence-report text.
- OpenAPI → Postman Basic, bearer, API-key header/query, and OAuth mappings.
- CLI exits 2, 3, and 4.

`site/audit.mjs` now fails the browser suite if a footer link is smaller than 44 × 44 at 390px, and verifies a warmed service worker controls a reload before an offline reload. `site/release-policy.mjs` checks the static response/caching policy and touch-target declaration during `npm test`.

## Exact verification evidence

Run from a clean install:

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

All passed on 2026-08-28. The suite contains 4 Rust unit tests, 7 Rust end-to-end tests, and 3 Vitest browser-converter tests. `cargo package` passed its verification build and produced a 115.0 KiB unpacked / 26.5 KiB compressed crate. A fresh consumer install from `target/package/openapi-collection-bridge-0.1.0` ran `ocb --help`, `formats --json`, and a cURL-to-Postman conversion; it confirmed credential redaction in the installed binary.

The built preview was checked with:

```sh
/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173/ .factory/evidence/repair
AUDIT_URL=http://127.0.0.1:4173 npm run test:a11y
```

`verify-url.sh` reported HTTP 200 in 571 ms, no browser errors, one title/lang/h1/main, image alt coverage, and labeled buttons. The Axe/Playwright audit reported zero serious/critical violations and zero console/page errors on `/`, `/privacy/`, and `/terms/`; it also passed local conversion, license return handling, 390×844 no-overflow, 44px footer targets, keyboard skip-link first focus, service-worker warm reload, and offline shell reload. A separate 1440×960 Chromium smoke test found one h1, a main landmark, the expected title/lang, skip link as first focus, and no console errors.

The committed repair was deployed to `https://openapi-collection-bridge.sociobot.in/` with the factory static deployment utility on 2026-08-28. The live index SHA-256 is `2440b58693b84bf2a39f65cc071bb44fc37fdc714a1922fd3df7c1d823e9955f`, matching `dist/site/index.html`. Live response checks confirmed the CSP, Permissions Policy, `Cache-Control: public, max-age=31536000, immutable` for `/assets/main-DUFgKX9I.js`, and `Cache-Control: public, max-age=0, must-revalidate` for `/sw.js`. Live `verify-url.sh` passed in 827 ms with no browser errors; the live Axe/Playwright audit also passed with zero serious/critical violations or console/page errors.

Production assets are 10,777 B JavaScript, 10,483 B CSS, and 23,186 B responsive hero image (all uncompressed), within the 200/50/300 KB budgets. `npm audit` after `npm ci` found zero vulnerabilities.

## Product and release notes

- The CLI remains local-only, deterministic, credential-redacting by default, and has no telemetry. The browser specimen remains local-only; billing is the only optional external connection and is permitted by CSP.
- The notebook visual system, original image provenance, static artifact class, and factory deployment class are unchanged.
- Build output is `dist/site/`; deploy that directory as the static site. `staticwebapp.config.json` is part of that output and must be honored by Azure Static Web Apps; `_headers` is included for compatible static hosts.
- Build production billing with `VITE_BILLING_BASE_URL=https://api.sociobot.in/api/v1` after the factory has registered the live product. The source defaults to the pilot endpoint for staging.
- Do not publish from this checkout. The factory can publish with `cargo package --manifest-path cli/Cargo.toml --allow-dirty` and attach `target/release/ocb` to the release.
