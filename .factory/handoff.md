# OpenAPI Collection Bridge v0.1.0 handoff

## Delivered

- A publishable Rust `ocb` binary with `convert`, `inspect`, and `formats` commands; helpful `--help`; JSON automation output; deterministic exports; and documented exit codes (`0`, `2`, `3`, `4`).
- Import and export paths for OpenAPI 3.0/3.1 JSON/YAML, Postman 2.1 plus named environment files, Insomnia v4 resources, Bruno folder collections, and cURL command text.
- A shared typed intermediate model covering folders, requests, query values, headers, bodies, auth, response examples, scripts/tests, and named environments.
- A Markdown evidence report beside every conversion, grouped into preserved, transformed, and unsupported semantics. `--fail-on-loss` exits 4 after still writing the output/report.
- Default credential replacement across headers, query values, URL query strings, auth fields, environments, JSON request bodies, and JSON examples. `--include-secrets` is explicit opt-in.
- A Vite landing/docs site with an actual in-browser local conversion specimen, downloads, input/error/empty/offline states, keyboard and 390px layouts, install and coverage docs, and `/privacy/` and `/terms/` static pages.
- One-time $29 Pro unlock through the Sociobot contract: hosted checkout link, return-token capture, `sb_license:openapi-collection-bridge` local storage, URL cleanup, daily verification cache, optimistic cached unlock, offline reconciliation, invalid-license notice, and paste-to-restore. Pro adds the team migration/CI planning kit; core conversion and safety remain free.
- An original notebook evidence illustration generated for this product plus 1280px (77 KB) and responsive 640px (23 KB) WebP files. The exact prompt, deployment, and license provenance are in `site/public/bridge-notebook.provenance.json`; the 2.3 MB working PNG was removed after conversion.
- A versioned offline shell service worker, responsive image selection, local/system fonts only, no analytics, and no third-party runtime scripts.

## Run and verify

```sh
npm ci
npm test
npm run build
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
cargo package --manifest-path cli/Cargo.toml
```

`npm run build` creates the release binary at `target/release/ocb` and the deployable site at `dist/site/`; `dist/site/index.html` is present. The crate package validated at `target/package/openapi-collection-bridge-0.1.0.crate` (98.3 KiB, 23.2 KiB compressed).

Browser verification was run against a production preview with:

```sh
/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173/ .factory/evidence/production
AUDIT_URL=http://127.0.0.1:4173 npm run test:a11y
```

- Tests: 8 Rust tests (4 unit, 4 end-to-end) and 3 browser converter tests passed.
- Pilot fixture: 20/20 requests and 2/2 named environments exported to Bruno and Insomnia; Postman received 20/20 requests and both separate environment files.
- Axe/Playwright: zero serious or critical findings on `/`, `/privacy/`, and `/terms/`; no console/page errors; first Tab target is the skip link; mobile has no horizontal overflow; local conversion, offline notice, and license-return behavior passed.
- Lighthouse mobile production run: Performance 100, Accessibility 100, Best Practices 100, SEO 100. FCP 0.9 s, LCP 1.5 s, CLS 0, TBT 0 ms. INP has no lab value because Lighthouse performs no sustained interaction; local conversion completes synchronously in the browser audit.
- Initial payload: 10.78 KB JavaScript and 10.37 KB CSS uncompressed; 23 KB responsive mobile hero; all well below the 200/50/300 KB budgets.
- `npm audit --audit-level=moderate`: zero vulnerabilities.
- `cargo fmt --check`, Clippy with warnings denied, `cargo package`, `npm test`, and `npm run build`: pass.

## Release notes / known gaps

- The staging default is `https://pilot-api.sociobot.in/api/v1`. At release, register the paid product and build with `VITE_BILLING_BASE_URL=https://api.sociobot.in/api/v1`; no opaque product ID is hardcoded.
- The browser specimen intentionally accepts OpenAPI JSON rather than YAML and offers a representative subset. The Rust CLI is the product and handles YAML plus the complete documented inventory.
- Destination limitations are intentionally visible: OpenAPI and cURL cannot carry executable client tests; cURL has no named environment container; Insomnia v4 has no neutral request-attached response-example representation. Reports enumerate these rather than claiming preservation.
- cURL is parsed as data and never executed. Common method, header, auth, cookie, body, form, URL, user-agent, and referer options are translated. Transport/output/proxy flags are listed as unsupported when present; arbitrary shell pipelines are out of scope.
- Conversion structures were round-tripped in automated tests. Final behavioral validation inside every supported third-party desktop client remains a release QA task because those clients are not installed in the worker image.

## Next factory steps

1. Register the test/live Sociobot product and set the production billing base during the release build.
2. Attach `target/release/ocb` binaries for supported platforms to a GitHub Release; registry credentials and publishing remain factory-owned.
3. Deploy exactly `dist/site/` to `openapi-collection-bridge.sociobot.in` and smoke-test the live checkout return URL.
