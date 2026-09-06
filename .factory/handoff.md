# OpenAPI Collection Bridge repair 2 handoff

## Result

Repair 2 resolves all ten strict-review findings and adds outcome tests for all 28 previously untested claims plus five repair-specific outcomes. The free CLI, bundled demo, browser sample, legal routes, and paid deliverables are implemented and deployed.

- Product: `https://openapi-collection-bridge.sociobot.in/`
- Implementation deployed: `16baf1454eebfb1672af41dfaded0fbc58385e63`
- Version: `0.1.1`
- Deployment ID: `dbd61e62-8f56-4fc1-a262-461c92b4b8db`
- Deployed at: 2026-09-06 UTC
- Final documentation head: the report-only commit containing this handoff; its exact SHA is recorded in the operator response because a commit cannot contain its own SHA.

The deployed HTML hashes match `dist/site` from the implementation commit. The later handoff commit does not change the deployed product.

## What changed

### CLI and conversion fidelity

- Postman `{{base_url}}` prefixes now become OpenAPI server entries rather than corrupt path segments. A missing variable value is reported as unsupported instead of silently guessed.
- OpenAPI round trips restore usable full request URLs. Path variables remain `{name}` variables.
- Postman collection authentication and structured URL objects are read correctly.
- cURL input stops at unquoted shell separators and never executes shell commands.
- Bruno request order follows `meta seq`, not filename order.
- Duplicate OpenAPI method/path operations produce an unsupported finding instead of overwriting an earlier operation.
- `ocb demo` copies a bundled three-request parcel collection into a temporary directory, runs the real converter, and prints the output and evidence paths.
- The package includes its sample files and builds as a single `ocb` binary.

### Browser demo and site

- `/demo/` opens directly with three converted parcel requests and visible migration evidence.
- The browser converter preserves API-key authentication and the required `X-Trace` header. It explicitly reports the response example that Bruno cannot represent.
- Demo mode is persistently labeled, resets to the bundled sample, uses no browser storage, and has a Start for real action.
- The first screen now states the conversion job, API-team audience, sample action, and three concrete facts before scrolling on phone and desktop.
- Added the real CLI terminal recording, three-step usage section, limits/privacy section, consistent headers and footers, route-specific metadata, social image, Apple icon, sitemap entry, and a designed HTTP 404.
- The skip link moves focus to `main`; controls meet the 44px target; reduced motion removes meaningful movement.
- Production billing URLs use `https://api.sociobot.in`. A valid-license flow supplies both paid deliverables: the team migration planner and a downloadable reusable GitHub Actions policy.

### Tests, claims, and documentation

- `.factory/claims.json` declares 33 unique public outcomes and 33 unique commands.
- Each command runs exactly one matching `@claim:<id>` test against a temporary CLI workspace or fresh browser context.
- Added `.factory/demo.md`, `.factory/copy-audit.md`, the updated design provenance, README clean-setup instructions, and the 0.1.1 changelog.
- The verb-first 94-byte catalog description is in `.factory/catalog-description.txt` and `/work/.evidence/catalog-description.txt`.
- The preserved $29 one-time offer is recorded in `/work/.evidence/billing-offer.json` with its production return URL and license verification path.

## Strict-review disposition

| Finding | Disposition and proof |
| --- | --- |
| F1 Postman base URL corruption | Fixed at import/export boundaries. Unit, end-to-end, and `@claim:variable-url-roundtrip` tests assert a usable full URL after Postman → OpenAPI → Postman. |
| F2 browser semantic loss | Fixed. The populated sample output contains `auth: apikey` and `X-Trace`; its unsupported response example is named in the evidence list. Verified cold on phone and desktop. |
| F3 missing demo contract | Fixed with `ocb demo`, packaged samples, real terminal recording, `/demo/`, persistent label, reset, Start for real, and `.factory/demo.md`. |
| F4 pilot checkout | Fixed. Code, CSP, and public link use only the production Sociobot billing host. No pilot host remains. |
| F5 missing paid deliverable | Fixed. Valid-license tests generate a collection-specific plan and download reusable GitHub Actions YAML. |
| F6 missing claims | Fixed. All 33 declarations map one-to-one to tagged outcome tests; all 33 commands passed individually from the clean checkout. |
| F7 missing real 404 | Fixed. An unknown live URL returns HTTP 404 with its own title, heading, style, and home link. |
| F8 copy and structure | Fixed. Audience, action, facts, How it works, and limits/privacy sections use plain terms; the complete word-count audit has no flagged line. |
| F9 metadata and shared structure | Fixed across home, demo, privacy, terms, and 404. Social metadata, canonical URLs, app icons, sitemap, factory credit, and version are present. |
| F10 skip focus | Fixed and browser-tested. Enter on the first keyboard target focuses `main`. |

Earlier findings also remain fixed: non-bearer authentication coverage, exit codes 0/2/3/4, mobile footer target sizes, CSP and Permissions Policy headers, immutable asset caching, and runnable Lighthouse checks.

## Verification

From a clean checkout of implementation `16baf1454eebfb1672af41dfaded0fbc58385e63`, these passed:

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

`npm test` passed 5 Rust unit tests, 12 Rust end-to-end tests, 4 browser converter tests, all 33 claim tests, and both policy checks. The crate package was about 30 KB compressed and included the demo samples.

Every `test` command in `.factory/claims.json` was then run separately from that clean checkout: 33 declared, 33 passed. Results are in `/work/.evidence/openapi-collection-bridge-repair-2/claim-commands.json`.

A clean consumer installed the pushed repository directly:

```sh
cargo install --git https://github.com/B-Divyesh/sf-openapi-collection-bridge --root <temporary-root> --locked
<temporary-root>/bin/ocb --version
<temporary-root>/bin/ocb formats --json
<temporary-root>/bin/ocb demo
```

It installed `ocb 0.1.1`, listed all five formats, and converted three sample requests into a temporary OpenAPI file and Markdown report.

Production checks passed:

```sh
AUDIT_URL=https://openapi-collection-bridge.sociobot.in npm run test:a11y
/opt/fleet/lib/verify-url.sh https://openapi-collection-bridge.sociobot.in <evidence-dir>
/opt/fleet/lib/verify-url.sh https://openapi-collection-bridge.sociobot.in/demo/ <evidence-dir>
```

- Axe: zero serious or critical issues on home, demo, Privacy, Terms, and 404.
- Browser console/page errors: zero.
- Fresh 1440×900 and 390×844 contexts: no overflow; job, audience, and sample action visible before scrolling.
- Demo: 3 requests, 3 preserved rows, 1 transformed row, 1 unsupported row; reset restored the sample and storage remained empty.
- Offline: warmed demo reload and conversion passed in its own browser context.
- Reduced motion: animation and transition durations became 0.01 ms.
- Lighthouse mobile live: performance 100, accessibility 100, best practices 100, SEO 100; LCP 1.3 s, CLS 0, TBT 0 ms, transfer 94 KiB.
- Initial application JavaScript: 21,193 bytes raw; CSS: 13,083 bytes raw; mobile hero image: 23,186 bytes.
- Root, demo, Privacy, Terms, and 404 production response hashes match the deployed build. Hashed JS/CSS and image assets return immutable one-year cache headers.
- Internal routes, sitemap, robots file, social image, source repository, and issue tracker return 200. An unknown URL returns the intended 404.
- The product is static. Backend tenant isolation, database persistence, health, and 429/Retry-After checks do not apply.

## Evidence

- `/work/.evidence/openapi-collection-bridge-repair-2/claim-commands.json`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-browser.json`
- `/work/.evidence/openapi-collection-bridge-repair-2/lighthouse-live.json`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-desktop-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-desktop-demo.png`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-phone-first-screen.png`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-phone-demo.png`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-root/`
- `/work/.evidence/openapi-collection-bridge-repair-2/live-demo/`

## Remaining external dependency

The product is not yet registered in the production billing service. The correct production checkout endpoint currently returns HTTP 404 with `enabled factory product`. The separate billing-registration operator must register the offer from `/work/.evidence/billing-offer.json`. No provider credential was invented or embedded, and the free converter remains fully usable. After registration, verify checkout, payment return, and a real issued license; fixture-backed entitlement, restore, cache, revocation, planner, and policy-download paths already pass.
