# Review 1 — FAIL

**Verdict: FAIL**

- **Finding count:** 10
- **Untested public claim count:** 28
- **Implementation reviewed:** `407be451a3d25774bb1285f3ab55907905de27bb`
- **Documentation head:** `48d944d1287bc51176ba367540298f25b0f3bff1`
- **Live URL:** `https://openapi-collection-bridge.sociobot.in/`
**Review date:** 2026-09-05

The product does not pass this strict review. The installed CLI and the live browser specimen both have paths that silently misrepresent migration semantics. The required one-click CLI demo and claim registry are absent. The production buy link also targets the forbidden pilot/staging billing host.

## Product understood before scrolling

- Job shown: convert API requests among OpenAPI, Postman, Insomnia, Bruno, and cURL while reporting semantic loss.
- Intended audience from the brief: API teams moving collections between local API clients.
- First visible action: **Install the CLI**. A secondary **Try a file locally** link scrolls to the browser specimen.

The job is understandable from the headline and supporting sentence. The audience is not named on the first screen, and the required **Try it with sample data** action is absent. Fresh 1440×900 and 390×844 screenshots are in `/work/.evidence/openapi-collection-bridge-review-1/`.

## Findings

### F1 — High — Postman base URL variables produce broken OpenAPI paths without a loss finding

A clean installed package converted a realistic Postman collection whose request URL was `{{base_url}}/account` and whose collection variable supplied `https://api.example.test`.

The generated OpenAPI used:

```json
"servers": [{ "url": "https://api.example.test" }],
"paths": { "/{{base_url}}/account": { ... } }
```

Inspecting or converting that output back produced `https://api.example.test/{{base_url}}/account`. The evidence report nevertheless says request paths were represented and environments became server entries. It lists no variable/path loss. This violates the central promise not to silently lose or corrupt variables.

Reproduction with the installed artifact:

```sh
ocb convert pilot.postman_collection.json --to openapi \
  --output pilot.openapi.json \
  --environment development.postman_environment.json --json
ocb inspect pilot.openapi.json --json
ocb convert pilot.openapi.json --to postman \
  --output roundtrip.postman.json --json
```

### F2 — High — The live browser specimen silently drops auth, headers, and examples

I entered valid OpenAPI 3.1 containing an API-key security scheme, operation security requirement, required `X-Trace` header, and response example, then converted to Bruno.

The live result contained `auth: none`, no `X-Trace` header, and no response example. Its evidence summary said:

```text
1 request
✓ 1 preserved
↻ 0 transformed
× 0 unsupported
```

The single row claimed methods, URLs, headers, and bodies were inventoried. This is false evidence on the product’s trust-reporting path. Reproduction output is in `live-semantic-audit.json` under the evidence directory.

### F3 — High — The required CLI demo sandbox does not exist

There is no `ocb --demo` or `ocb demo`; `ocb --demo` exits 2. The package contains no `examples/` sample. The landing page has no recording of the real binary, no **Try it with sample data** action, no persistent **Demo — sample data, nothing is saved** label, no **Reset demo**, and no **Start for real**. `.factory/demo.md` is missing.

`/demo` returns the ordinary home page. The prefilled two-request browser specimen can be converted, but it is a separate simplified TypeScript converter and does not satisfy the CLI demo contract or prove the installed artifact.

### F4 — High — The live $29 checkout points to the pilot/staging billing host

The production page renders:

```text
https://pilot-api.sociobot.in/api/v1/products/openapi-collection-bridge/checkout
```

The required production host is `https://api.sociobot.in/...`. I did not follow or connect to the pilot/staging URL, in accordance with the work-order boundary. A visitor cannot be sent through the authorised production purchase path from this page.

### F5 — Medium — A paid feature is promised but not delivered

The page and Terms say Pro includes “reusable CI policy templates.” With license verification safely intercepted to return a valid fixture, the unlocked UI provided only a six-line migration checklist. It offered no CI template, download, editable template, or reusable policy artifact. This is an incomplete paid claim.

### F6 — High — The claim registry and all claim-tagged tests are missing

`.factory/claims.json` does not exist and `rg '@claim:' .` finds no tagged test. Therefore there are no declared claim commands to run, and 28 distinct public outcomes have no required one-to-one sandbox test. Existing unit, integration, audit, and release-policy tests do not satisfy the attached claim contract because none is registered or tagged.

The untested claim inventory is below. F1, F2, and F5 also show that some of these claims are false or incomplete, not merely unregistered.

### F7 — Medium — Unknown URLs do not produce a designed 404

`/review-missing-page` returned HTTP 200, the home title, the home canonical, and the full landing page. No `404.html` or 404 response override exists. This is not a deliberate HTTP 404; it is an incorrect success response and missing required route.

### F8 — Medium — Required plain-word and landing structure is incomplete

The first screen does not name API teams or another audience. It uses notebook/bridge copy such as “Field note,” “Five dialects in,” and “support the bridge,” and the footer says “want receipts.” These are metaphor or brand-lore labels rather than section names. The page also lacks the required three-step **How it works** section and a dedicated “what it does not do / privacy” section. `.factory/copy-audit.md` is missing.

### F9 — Low — Metadata and shared site structure are incomplete

The root has no Open Graph metadata, Twitter card, or Apple touch icon. Privacy and Terms have no canonical. The sitemap omits `/demo`. Headers and footers are not consistent across routes, and no footer contains “Built by Param Factory” or a version/build ID. Root title, description, favicon, `lang`, one `h1`, and `main` are present.

### F10 — Low — Activating the skip link does not move keyboard focus to main

The first Tab correctly focuses **Skip to main content** with a 3px teal outline. Pressing Enter changes the hash to `#main` and scrolls, but `document.activeElement` becomes `BODY`, not the main landmark or its heading. Subsequent Tab starts at **Install the CLI**, so keyboard and screen-reader users do not receive a reliable main-content focus target.

## Untested public claims

All entries below lack a `.factory/claims.json` record and exactly one `@claim:<id>` test.

| # | Public outcome |
| ---: | --- |
| 1 | Converts among OpenAPI, Postman, Insomnia, Bruno, and cURL. |
| 2 | Reports exactly what was preserved, transformed, or unsupported; no silent blanks. |
| 3 | Strips credentials by default. |
| 4 | Produces deterministic output for identical input and version. |
| 5 | Produces source-control-friendly output without timestamps or machine paths. |
| 6 | Uses zero telemetry. |
| 7 | Makes no conversion network requests and sends no input off the device. |
| 8 | Writes a Markdown report beside every successful export. |
| 9 | Detects supported file and directory source formats when `--from` is omitted. |
| 10 | Sends `--json` results to stdout and diagnostics to stderr. |
| 11 | Implements exit codes 0, 2, 3, and 4 as documented. |
| 12 | Preserves the documented OpenAPI operations, parameters, examples, servers, auth, and variables. |
| 13 | Preserves the documented Postman requests, folders, auth, examples, variables, scripts, and tests. |
| 14 | Preserves the documented Insomnia resources, environments, bodies, auth, parameters, and scripts. |
| 15 | Preserves the documented Bruno layout, ordering, environments, auth, bodies, variables, and scripts/tests. |
| 16 | Parses the documented cURL methods, URLs, headers, auth, forms, and bodies without executing shell code. |
| 17 | The browser specimen converts locally and downloads output. |
| 18 | Local conversion continues offline after the first visit. |
| 19 | The CLI is one binary. |
| 20 | No account is required. |
| 21 | Core conversion, reports, redaction, and exports remain free. |
| 22 | Pro is a one-time $29 purchase with no subscription. |
| 23 | Pro supplies the team migration planner. |
| 24 | Pro supplies reusable CI policy templates. |
| 25 | A returned license is stored and removed from the address bar. |
| 26 | License validity is checked at most daily and cached for offline first paint. |
| 27 | The site has no advertising, analytics, fingerprinting, third-party fonts, or tracking scripts. |
| 28 | Browser inputs remain in memory, are not retained or logged, and clear on reload. |

**Untested claim count: 28.** Incidental coverage in untagged tests does not change this contract result.

## Prior finding disposition

| Earlier finding | Current disposition |
| --- | --- |
| Non-bearer auth collapsed to bearer | Fixed for the earlier Basic, bearer, API-key, and OAuth fixtures. Clean tests and installed-artifact checks passed. F1 identifies a separate variable/path corruption. |
| Invalid input returned the wrong exit code | Fixed. Independent runs returned 2 for invalid input, 3 for write/conversion failure, and 4 for `--fail-on-loss`. |
| Mobile footer targets below 44px | Fixed. The current audit found no visible undersized actionable target; the hidden file input has a 44px associated label. |
| Missing CSP, Permissions Policy, and immutable caching | Fixed live. Required headers are present; HTML/service worker revalidate and hashed assets/WebP use long-lived immutable caching. |
| Lighthouse could not connect in the earlier verification container | Resolved for this review by setting the preinstalled Chromium path. Mobile scores were 100 performance, 100 accessibility, 100 best practices, and 100 SEO; LCP 1.234s, CLS 0, TBT 0ms. |

## Checks that passed

- Fresh remote clone at documentation SHA `48d944d`; the last non-report implementation commit is `407be45`.
- `npm ci`, `npm run typecheck`, `npm test`, `cargo fmt --check`, strict Clippy, `npm run build`, and `cargo package --allow-dirty` passed.
- The packaged crate installed in a clean consumer. `ocb --help`, `formats --json`, normal conversion, inspection, redaction, JSON output, and exit 2/3/4 recovery paths worked.
- Existing tests passed: 4 Rust unit, 7 Rust end-to-end, 3 Vitest, and static release-policy assertions.
- Live and clean-build hashes matched for root, Privacy, Terms, main JS, and service worker.
- Desktop and phone loads had no console/page errors. Axe found no violations. There was no horizontal overflow at 390px, focus rings were visible, reduced motion removed meaningful transitions, and visible controls met touch sizing.
- The default browser specimen produced two Bruno requests. Empty input, malformed JSON, and recovery to a valid one-request result behaved clearly.
- A warmed service worker controlled reload; offline reload and offline conversion worked.
- During ordinary load and conversion, requests were same-origin only and local storage remained empty. No real data was used or changed.
- Privacy and Terms load with distinct titles. Internal landing fragments resolve. The repository Source link was usable through the clean clone.
- The product is static, so backend tenant isolation, restart persistence, health, and 429/`Retry-After` checks are not applicable.

## Commands run

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
AUDIT_URL=https://openapi-collection-bridge.sociobot.in npm run test:a11y
cargo install --path target/package/openapi-collection-bridge-0.1.0 --root <clean-root> --locked
cargo install --git https://github.com/B-Divyesh/sf-openapi-collection-bridge --root <clean-root>
```

No claim commands could be run because the required claim registry is missing.

## Evidence

- `/work/.evidence/openapi-collection-bridge-review-1/live-audit.json`
- `/work/.evidence/openapi-collection-bridge-review-1/live-semantic-audit.json`
- `/work/.evidence/openapi-collection-bridge-review-1/desktop-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-review-1/desktop-sample-output.png`
- `/work/.evidence/openapi-collection-bridge-review-1/phone-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-review-1/phone-sample-output.png`
- `/work/.evidence/openapi-collection-bridge-review-1/lighthouse-mobile.json`

## Required next work

1. Correct Postman variable URLs when exporting OpenAPI and add round-trip tests that assert usable request URLs plus honest evidence.
2. Make the browser preview preserve or explicitly report every dropped semantic.
3. Ship the real CLI demo contract: bundled sample, `ocb demo`/`--demo`, recording, `/demo`, persistent label, reset, start-real action, and `.factory/demo.md`.
4. Point production billing only to `api.sociobot.in` and deliver or remove the CI-template promise.
5. Add the complete claim registry and one observable sandbox test per claim.
6. Add the real 404, required metadata/shared structure, plain-word copy audit, and working skip-link focus transfer.
