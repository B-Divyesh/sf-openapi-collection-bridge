# OpenAPI Collection Bridge v0.1.0 verification handoff — PASS

**Candidate:** `0fef09b512cf5329fad4f7bea64e72037d78c6ab`

**Live URL:** `https://openapi-collection-bridge.sociobot.in/`

## Result

**PASS.** Independent QA from a clean candidate checkout found no release-blocking, high, medium, or low defects. The complete evidence and exact SHA-256 comparisons are in `.factory/verification-2.md`.

## What was verified

- `npm ci`, `npm run typecheck`, `npm test`, `cargo fmt --check`, strict Rust Clippy, exact `npm run build`, and `cargo package --manifest-path cli/Cargo.toml --allow-dirty` all passed.
- A fresh unpacked crate was installed into a clean consumer with `cargo install --path … --root …`. Installed `ocb --help`, `formats --json`, `convert`, and `inspect --json` worked. A cURL POST retained its request semantics while replacing Authorization, header, body, and query credentials with placeholders.
- End-to-end tests cover representative 20-request/two-environment migrations, OpenAPI/Postman native Basic/bearer/API-key/OAuth mappings, output determinism, and the documented 2/3/4 recovery exit codes.
- Local and live Playwright/axe audits reported zero serious/critical violations and zero console/page errors across `/`, `/privacy/`, and `/terms/`. Desktop and 390px mobile keyboard, focus, invalid-input recovery, reduced motion, 44px footer targets, no overflow, service-worker warm reload, and offline reload passed.
- Fresh no-license page loads made no outbound calls; no third-party fonts, scripts, analytics, or input upload were observed. The only allowed future external connection is the documented Sociobot license endpoint.
- Production HTML, legal pages, main JS, and service worker byte-match `dist/site/`. Live CSP, Permissions Policy, HSTS/referrer/nosniff headers, HTML/service-worker revalidation, and immutable hashed-asset/image caching are present. Main JS 10,777 B, CSS 10,483 B, and mobile hero 23,186 B meet budgets.

## Run / publish

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

The factory owns publishing credentials; do not publish from this checkout. The ready-to-publish crate is validated by the `cargo package` command above and the static deployable output is `dist/site/`.

## Known gaps

None affecting acceptance. Lighthouse CLI was attempted but could not establish a DevTools connection to the container Chromium; direct Playwright/axe audits, live response checks, and bundle measurements completed successfully.
