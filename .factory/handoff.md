# OpenAPI Collection Bridge review 1 handoff — FAIL

## Review result

**FAIL — 10 findings and 28 untested public claims.**

The strict review is recorded in `.factory/review-1.md`. No product code was modified.

## Candidate identity

- Implementation reviewed: `407be451a3d25774bb1285f3ab55907905de27bb`
- Documentation head reviewed: `48d944d1287bc51176ba367540298f25b0f3bff1`
- Live URL: `https://openapi-collection-bridge.sociobot.in/`

The later commits only changed reports/handoff. Fresh SHA-256 comparisons confirmed that root, legal pages, main JavaScript, and service worker match the clean build of the implementation candidate.

## What was done

- Audited the live site in fresh desktop and 390px phone contexts before scrolling and through the populated specimen.
- Checked empty, malformed, recovery, keyboard, focus, reduced-motion, offline, privacy, route, legal, metadata, link, and 404 behavior.
- Ran axe and Lighthouse mobile. Lighthouse scores were 100 in performance, accessibility, best practices, and SEO; LCP was 1.234s, CLS 0, and TBT 0ms.
- Built, packaged, and installed the crate in a clean consumer. Exercised help, formats, conversion, inspection, redaction, JSON output, and exit codes.
- Reconciled every earlier review finding.

## Verification commands

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
AUDIT_URL=https://openapi-collection-bridge.sociobot.in npm run test:a11y
```

All commands above passed. There were no declared claim commands because `.factory/claims.json` is missing.

## Main gaps

- Postman `{{base_url}}` requests become broken OpenAPI paths and the loss report does not disclose it.
- The live browser specimen silently drops API-key auth, required headers, and response examples while reporting zero unsupported semantics.
- The required one-click CLI demo, bundled examples, persistent demo state controls, and demo documentation are absent.
- Production checkout points to the pilot/staging billing host; the promised reusable CI policy templates are not present after unlock.
- Claims registry, real 404, required metadata/site structure, copy audit, and working skip-link focus transfer are missing.

## Evidence

The canonical report is `.factory/review-1.md`. A copy and machine-readable result are at `/work/.evidence/qa-report.md` and `/work/.evidence/qa-result.json`; browser artifacts are under `/work/.evidence/openapi-collection-bridge-review-1/`.
