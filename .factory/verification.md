# Independent verification — FAIL

**Candidate:** `f76e47c50add66431e1a589e2d2aa925de8082d3` (`f76e47c`)

**Repository / branch:** `https://github.com/B-Divyesh/sf-openapi-collection-bridge.git` `main`

**Live URL checked:** `https://openapi-collection-bridge.sociobot.in/`

**Verdict:** **FAIL**. The CLI corrupts non-bearer authentication semantics while its evidence report asserts full representation. This violates the central product contract: API teams must not silently lose authentication during migration.

## Release gates

All commands below were run from the clean candidate checkout, before this report was added.

| Check | Result |
| --- | --- |
| `npm ci` | PASS — 59 packages; `npm audit` reported 0 vulnerabilities. |
| `npm test` | PASS — 4 Rust unit tests, 4 Rust end-to-end tests, and 3 Vitest tests. |
| `cargo fmt --check` | PASS. |
| `cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings` | PASS. |
| `npm run build` | PASS — release `target/release/ocb` and `dist/site/`. |
| `cargo package --manifest-path cli/Cargo.toml --allow-dirty` | PASS — package verified, 98.3 KiB unpacked / 23.1 KiB compressed. |
| Type/lint discovery | No TypeScript `tsconfig` or JS lint configuration/script exists; `npx tsc --noEmit --project site/tsconfig.json` cannot run because that file does not exist. Rust Clippy is the available static check and passed. |

The packed crate was unpacked in a fresh `/tmp` consumer, installed with `cargo install --path … --root …`, and its installed `ocb` binary successfully ran `--help`, `formats --json`, and a cURL-to-Postman `--json` conversion. Default cURL credential replacement was observed in the consumer output.

## End-to-end CLI evidence

- A representative Postman collection with a nested request, query/header/body/example credentials, script, collection variable, and supplied named environment converted to OpenAPI. It produced 1 request and 2 environments; default redaction replaced valid JSON-body and response-example secrets with named placeholders. `--fail-on-loss` wrote output/report and exited `4` for the request script, as documented.
- OpenAPI 3.1 YAML with a server variable converted to Bruno, was re-inspected as 1 request / 1 environment, converted to Insomnia v4, then re-inspected as 1 request / 1 environment.
- A literal cURL POST with headers/body converted without executing the command. It preserved the request and replaced the Authorization value by default.
- Invalid empty OpenAPI and unrecognised input show recovery errors without output. Both exit `3`; this conflicts with README’s stated code `2` for invalid input (see P2-1).

### Blocking authentication reproduction

Input: Postman 2.1 collection containing two requests:

1. `basic` authentication with `username=alice`, `password=wonderland`.
2. `apikey` authentication with `key=X-API-Key`, `value=abc123`, `in=header`.

Command:

```sh
target/release/ocb convert postman-auth.json --to openapi \
  --output postman-to-openapi.json --include-secrets --json
```

Observed generated OpenAPI:

```json
"securitySchemes": {
  "bridgeAuth": { "type": "http", "scheme": "bearer" }
}
```

Neither Basic credentials nor API-key name/location/value appear in that output. Both operations instead require `bridgeAuth`. The accompanying report says `100.0% represented`, `Unsupported: None`, and only the generic statement “Client authentication became an OpenAPI bridgeAuth security requirement.” It does not identify the Basic/API-key loss.

The reverse direction is also unusable:

```sh
target/release/ocb convert openapi-auth.json --to postman \
  --output openapi-to-postman.json --include-secrets --json
```

OpenAPI `http/basic` and `apiKey` schemes both become Postman auth arrays with a single `token` placeholder; API-key `key`, `value`, and `in` semantics are absent. That report lists zero transformed and zero unsupported items.

## Browser, accessibility, privacy, and performance evidence

- `AUDIT_URL=http://127.0.0.1:4173 npm run test:a11y`: PASS — zero axe serious/critical findings and zero console/page errors on `/`, `/privacy/`, and `/terms/`.
- The same audit against the live URL: PASS — zero axe serious/critical findings and zero console/page errors.
- Desktop browser smoke: one `lang`, title, one `<h1>`, and `<main>` present; first Tab stops on “Skip to main content” with a visible `rgb(0, 107, 98) solid 3px` focus outline. Invalid browser-specimen JSON shows an adjacent alert, and replacing it with valid OpenAPI JSON successfully recovers to a visible result.
- At 390×844: no horizontal overflow; reduced-motion changes scrolling to `auto` and reduces the hero animation to `0.01ms`; no console/page errors. A warmed local service worker controlled the second page load and an offline reload rendered the shell successfully.
- `/opt/fleet/lib/verify-url.sh http://127.0.0.1:4173/ …`: PASS — HTTP 200, 522 ms load, no browser errors, title/lang/main/one-h1/alt checks pass.
- Fresh no-license load made no third-party outbound requests. The browser specimen is local-only; there are no analytics or external font/script requests. License verification is the documented optional billing request.
- Built initial assets are 10,777 B JS and 10,367 B CSS uncompressed; the responsive hero is 23,186 B. All are within the stated 200 KB JS, 50 KB CSS, and 300 KB mobile-image budgets.

## Live deployment and response policy

The live deployment is the candidate static build, not a stale/deployment-only failure. SHA-256 content comparisons matched:

| File | SHA-256 |
| --- | --- |
| `/` / `dist/site/index.html` | `ecbe230239b34ce9043a3fea4f963d9fe96c1218a9998e71b2b42ffd76861882` |
| `/privacy/` / `dist/site/privacy/index.html` | `87c97577aac1a6ac7655cb621d06882048d21d9e9db97df73b2c4d977d65a522` |
| `/terms/` / `dist/site/terms/index.html` | `d65bbf3b76845592c4bac90d732147c1f0459362777b91b398010fdb0288158f` |
| `/assets/main-BtineiRm.js` | `487ca22ba4b565a3dc21addcb7fe6150b5fdc3bde8906c444de82223bbf21e8b` |
| `/sw.js` | `7d9d0c292a1e101d894f91f47d782bce777dc9cf89e61a767031e2e4766a8b16` |

Live responses supply HTTPS, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Content-Type-Options: nosniff`. They do not supply `Content-Security-Policy` or `Permissions-Policy`. HTML, hashed JS, CSS, and service-worker responses all use only `Cache-Control: public, must-revalidate, max-age=30` (P2-3).

## Defects

### P1 — non-bearer authentication is silently corrupted and falsely reported as represented

**Impact:** A migration from Postman Basic/API-key auth to OpenAPI produces bearer auth, and OpenAPI Basic/API-key to Postman loses required fields. Generated collections will not authenticate, while the report claims 100% coverage / no unsupported features. This directly defeats the brief’s trust and auth-preservation requirement.

**Location:** `cli/src/export.rs` `export_openapi` always emits bearer `bridgeAuth`; `cli/src/import.rs` `import_openapi` reduces schemes to a synthetic token field; Postman export carries that reduced shape.

**Reproduction:** the two commands and observed output in “Blocking authentication reproduction” above.

### P2-1 — documented invalid-input exit code is not implemented

**Impact:** CI callers following README’s exit-code contract cannot distinguish bad input from conversion failure.

**Evidence:** invalid empty OpenAPI and unknown source each exit `3`; README promises `2` for “invalid usage/input” and `3` for conversion failure.

### P2-2 — mobile footer links miss the 44px touch-target requirement

**Impact:** At 390px, Privacy, Terms, and MIT source footer links measure 25.6px high (their widths are 67.2px, 48.0px, and 96.0px). This fails the explicit mobile/touch accessibility acceptance criterion, even though axe does not flag it.

### P2-3 — live security and caching response policies are incomplete

**Impact:** The deployment has no CSP/Permissions Policy, and immutable hashed assets are revalidated every 30 seconds instead of long-lived immutable caching. This fails the stated response-policy and caching expectations for the static product. The live root and assets byte-match the candidate, so this is not an unrelated old deployment.

## Required next steps

1. Correct auth mapping per format (or explicitly mark each unsupported auth mechanism), preserve Basic and API-key structure/location, and make the evidence report feature-specific. Add round-trip/consumer fixtures for bearer, Basic, API-key, OAuth, and URL/query/header locations.
2. Align invalid-input errors with the promised exit-code contract, and add CLI tests for codes 2/3/4.
3. Increase footer-link hit areas to at least 44×44 at 390px.
4. Configure the static host with a restrictive CSP and Permissions Policy, and immutable caching for content-hashed assets; retain an appropriate short policy for HTML/service worker.
5. Re-run this verification after a new candidate is built and deployed.
