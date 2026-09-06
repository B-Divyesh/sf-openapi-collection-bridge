# OpenAPI Collection Bridge

OpenAPI Collection Bridge is for API teams moving work between local clients. The `ocb` CLI converts OpenAPI, Postman, Insomnia, Bruno, and cURL while reporting preserved, transformed, and unsupported semantics.

Conversion runs locally. Credential values are replaced by named placeholders unless `--include-secrets` is set. Identical input and CLI versions produce deterministic, source-control-friendly output.

## Try the bundled sample

The sample contains three parcel requests, one environment, API-key authentication, a response example, and a test script.

```sh
cargo run --manifest-path cli/Cargo.toml -- demo
```

`ocb demo` copies the bundled files into a new temporary directory. It runs the real converter and prints the OpenAPI and Markdown report paths.

The browser demo is at <https://openapi-collection-bridge.sociobot.in/demo/>. It loads populated output in one click from the home page. Its input stays in memory, resets to the sample, and clears on reload.

## Install

Build the single `ocb` binary from a source checkout with Rust 1.82 or newer:

```sh
cargo install --path cli
```

## Convert a collection

```sh
ocb convert ./petstore.yaml --from openapi --to bruno --output ./petstore-bruno
ocb convert ./team.postman_collection.json --to insomnia --output ./team-insomnia.json
ocb convert ./billing-bruno --from bruno --to postman --output ./billing.json
ocb convert 'curl -H "Authorization: Bearer secret" https://api.example.test/me' \
  --from curl --to openapi --output ./openapi.json
```

`--from` is optional for known files and Bruno directories. Each successful export writes a Markdown report beside the output. Bruno exports place the report inside their output directory.

Use `--json` for automation. Results go to stdout and diagnostics go to stderr.

```sh
ocb convert collection.json --to bruno --output ./out --json
ocb inspect ./out --from bruno --json
ocb formats --json
```

Exit codes are `0` for success, `2` for invalid input, `3` for conversion or write failure, and `4` for unsupported semantics with `--fail-on-loss`.

```sh
ocb convert collection.json --to openapi --output openapi.json --fail-on-loss
```

## Format coverage

- OpenAPI 3.0 and 3.1 JSON or YAML: operations, parameters, examples, servers, HTTP Basic, bearer, API keys, OAuth 2.0 metadata, and server variables.
- Postman Collection 2.1: nested requests, headers, query and body data, authentication, examples, variables, pre-request scripts, and tests.
- Insomnia v4: workspaces, request groups, requests, environments, bodies, authentication, and parameters.
- Bruno: folder layout, order, environments, authentication, bodies, variables, and script or test blocks.
- cURL text: methods, URLs, headers, Basic or bearer authentication, forms, and bodies. Shell commands are never executed.

Postman base URL variables become OpenAPI servers instead of duplicated path segments. An OpenAPI round trip restores a usable full request URL.

## Privacy and paid tools

The CLI has no telemetry and makes no conversion network requests. The site has no advertising, analytics, fingerprinting, third-party fonts, or tracking scripts.

Core conversion, reports, credential removal, and exports remain free. Pro costs $29 once, with no subscription. It adds a team migration planner and a downloadable GitHub Actions policy file. License checks use only the production Sociobot billing API and are cached for one day.

See the [privacy policy](https://openapi-collection-bridge.sociobot.in/privacy/) and [terms](https://openapi-collection-bridge.sociobot.in/terms/).

## Clean setup and verification

```sh
npm ci
npm run typecheck
npm test
cargo fmt --check
cargo clippy --manifest-path cli/Cargo.toml --all-targets -- -D warnings
npm run build
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

`npm test` runs Rust unit and integration tests, browser specimen tests, every claim test, and release-policy checks. `npm run build` writes the site to `dist/site/` and the binary to `target/release/ocb`.

Each public outcome is registered in `.factory/claims.json`. Run all claim sandboxes with:

```sh
npm run test:claims
```

Run the accessibility and browser audit while a built site is available:

```sh
npm run build:site
npm run dev -- --host 127.0.0.1
AUDIT_URL=http://127.0.0.1:5173 npm run test:a11y
```

## Deploy and publish

Deploy `dist/site/` as a static site. The included host configuration defines the CSP, cache policy, and designed 404 response.

The factory owns release credentials. Do not publish from a worker. Validate the Rust package with:

```sh
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

## License

MIT. See [LICENSE](LICENSE).
