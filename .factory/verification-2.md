# Independent verification 2 — PASS

**Candidate:** `0fef09b512cf5329fad4f7bea64e72037d78c6ab` (`0fef09b`)

**Repository / branch:** `https://github.com/B-Divyesh/sf-openapi-collection-bridge.git` `main`

**Live URL:** `https://openapi-collection-bridge.sociobot.in/`

**Verdict:** **PASS.** The requested candidate builds, packages, and exercises successfully from a clean checkout. The live static deployment byte-matches the production build and has the expected browser, privacy, security, and cache behaviour. The earlier auth-corruption and deployment-policy failures were not reproduced.

## Clean-checkout release gates

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 59 packages installed; 0 audit vulnerabilities. |
| `npm run typecheck` | PASS. |
| `npm test` | PASS — 4 Rust unit tests, 7 Rust end-to-end tests, 3 Vitest tests, and static release-policy assertions. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings` | PASS. |
| `npm run build` | PASS — release `target/release/ocb` and `dist/site/` produced. |
| `cargo package --manifest-path cli/Cargo.toml --allow-dirty` | PASS — package verification build passed; 115.0 KiB unpacked / 26.5 KiB compressed. |

The repository has a TypeScript typecheck and Rust Clippy check; it has no separate lint script.

## CLI and packaged-consumer evidence

The release binary has a useful `--help`, has one `ocb` command, exposes `formats --json`, and advertises its documented 0/2/3/4 exit contract. Its full end-to-end suite independently exercised:

- OpenAPI YAML → Bruno, including the report beside the directory export.
- Redaction of Authorization, request-body, and query credentials.
- Deterministic output for identical cURL → OpenAPI conversions.
- A representative 20-request / two-named-environment collection through Bruno, Insomnia, and Postman exports.
- Postman → OpenAPI Basic, bearer, API-key header/query, and OAuth mappings; native security schemes plus `x-bridge-auth-fields` are emitted and report a transformation rather than claiming an opaque preservation.
- OpenAPI → Postman Basic, bearer, API-key header/query, and OAuth mappings.
- Invalid input exit `2`, output/write failure exit `3`, and `--fail-on-loss` exit `4`.

I unpacked `target/package/openapi-collection-bridge-0.1.0.crate` into a fresh temporary consumer, installed it with `cargo install --path … --root …`, then ran the installed `ocb --help`, `formats --json`, `convert`, and `inspect --json`. A cURL POST with two credential headers, a credential-shaped JSON body field, and a query credential converted to Postman as one POST. Its output contained only `{{bridge_secret_*}}` placeholders; it contained none of the literal input secret values. This also confirms the public packed artifact, rather than the workspace binary, works end to end.

## Browser, accessibility, privacy, and PWA evidence

- `AUDIT_URL=http://127.0.0.1:4173 npm run test:a11y`: PASS — zero axe serious/critical findings and zero console/page errors on `/`, `/privacy/`, and `/terms/`.
- The same audit against the live URL: PASS — zero axe serious/critical findings and zero console/page errors.
- `/opt/fleet/lib/verify-url.sh` passed on both the built local preview and production. Desktop load was 588 ms locally / 663 ms live; each had the expected title, `lang="en"`, one `h1`, `main`, image alt text, and no unlabeled buttons.
- Desktop (1440×960) and mobile (390×844) browser checks passed. The first keyboard target is the visible “Skip to main content” link (teal 3px outline); mobile has no horizontal overflow and footer links meet 44px minimum targets.
- Invalid browser-specimen JSON announces “The browser specimen accepts JSON. The CLI also accepts OpenAPI YAML.” Replacing it with valid OpenAPI JSON immediately yields a visible conversion result; no page or console error occurs.
- Under `prefers-reduced-motion: reduce`, computed animation and transition duration is `0.01ms`; normal focus visibility was separately confirmed.
- A fresh no-license page load made no outbound requests. No third-party scripts, fonts, analytics, or conversion uploads are present. The only allowed future `connect-src` origins are the documented Sociobot license-verification endpoints.
- The audit warmed the service worker, verified it controlled the subsequent reload, then reloaded offline and confirmed the offline guidance/shell. `sw.js` precaches the shell and deletes stale named caches on activation.

## Deployment, headers, and budget evidence

Fresh SHA-256 comparisons show live content is this candidate’s production build:

| File | SHA-256 |
| --- | --- |
| `/` / `dist/site/index.html` | `2440b58693b84bf2a39f65cc071bb44fc37fdc714a1922fd3df7c1d823e9955f` |
| `/privacy/` / built legal page | `44471809a5d31adda6503b6d9be20d5a3dc62aabead8d03748f7d7886335d5c8` |
| `/terms/` / built legal page | `ff3d920c3c09de4e2bb2667f3a1fe2fdb1904389e2da527aca9d8ed59672b96c` |
| `/assets/main-DUFgKX9I.js` | `dd7ed36834720b9fe68ffe955e3e033b81f525c3ddb0d4d23fb96904c20810bb` |
| `/sw.js` | `7d9d0c292a1e101d894f91f47d782bce777dc9cf89e61a767031e2e4766a8b16` |

Live HTTPS responses include HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a self-only restrictive CSP (with the two documented billing API origins in `connect-src`), and a restrictive Permissions Policy. HTML and the service worker use `Cache-Control: public, max-age=0, must-revalidate`; the hashed main bundle and both WebP hero variants use `public, max-age=31536000, immutable`.

Built assets are 10,777 B initial main JS, 10,483 B CSS, and 23,186 B mobile hero image (uncompressed): all below the 200 KB / 50 KB / 300 KB budgets. An attempted Lighthouse CLI run could not establish a DevTools connection to the container-provided Chromium even with `--no-sandbox`; this is an environment limitation, not a product failure. The direct Playwright/axe checks and bundle measurements above completed successfully.

## Defects

No release-blocking, high, medium, or low defects were reproduced for this candidate.

## Verification commands

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
AUDIT_URL=http://127.0.0.1:4173 npm run test:a11y
AUDIT_URL=https://openapi-collection-bridge.sociobot.in npm run test:a11y
```
