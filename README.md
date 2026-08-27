# OpenAPI Collection Bridge

Move API work between OpenAPI, Postman, Insomnia, Bruno, and cURL without guessing what survived. `ocb` converts locally, strips credentials by default, produces stable source-control-friendly files, and writes a semantic loss report beside every export.

## Install

Prebuilt single binaries are intended for GitHub Releases. From a source checkout:

```sh
cargo install --path cli
```

Rust 1.82 or newer is required to build. The resulting command is `ocb`.

## Usage

Convert one OpenAPI, Postman, Insomnia, Bruno, or cURL source. The destination format can also be any of those five formats.

```sh
ocb convert ./petstore.yaml --from openapi --to bruno --output ./petstore-bruno
ocb convert ./team.postman_collection.json --to insomnia --output ./team-insomnia.json
ocb convert ./billing-bruno --from bruno --to postman --output ./billing.json
ocb convert 'curl -H "Authorization: Bearer secret" https://api.example.test/me' --from curl --to openapi --output ./openapi.json
```

`--from` is optional for files and directories. Every successful conversion writes a Markdown evidence report to `<output>.bridge-report.md` (or inside a directory export). Credentials are replaced by `{{bridge_secret_*}}` variables by default. Use `--include-secrets` only when the destination is appropriately protected.

For scripts and CI, `--json` prints a machine-readable result to stdout while diagnostics stay on stderr:

```sh
ocb convert collection.json --to bruno --output ./out --json
ocb inspect ./out --from bruno --json
ocb formats --json
```

Exit codes are `0` for success, `2` for invalid usage/input, `3` when conversion failed, and `4` when `--fail-on-loss` detects unsupported semantics. `--fail-on-loss` is useful in migration checks:

```sh
ocb convert collection.json --to openapi --output openapi.json --fail-on-loss
```

The public contract starts at `0.1.0`. Output is deterministic for identical input and CLI version: map keys are ordered, request order follows source order, generated IDs are content-derived, and reports contain no timestamps or machine paths.

## Format coverage

- OpenAPI 3.0/3.1 JSON or YAML: paths, operations, parameters, request/response examples, servers, security schemes, and server variables.
- Postman Collection 2.1 plus environment JSON: nested requests, headers, query/body data, collection/request auth, examples, variables, pre-request scripts, and tests.
- Insomnia v4 exports: workspaces, request groups, requests, environments, bodies, auth, parameters, and scripts where represented.
- Bruno folders: `bruno.json`, `.bru` requests, folder ordering, environments, auth, bodies, vars, and script/test blocks.
- cURL command text: method, URL, headers, user/bearer auth, form and request bodies. Shell expansion and commands are never executed.

The report distinguishes exact preservation, an explicit transformation, and unsupported semantics. It does not claim destination clients can represent features they cannot.

## Development

```sh
cargo test --manifest-path cli/Cargo.toml
npm install
npm test
npm run build
```

`npm test` runs the CLI tests and site tests. `npm run build` builds the release CLI and writes the static site to `dist/site/` with `index.html` at that root. `npm run build:site` builds only the Vite site.

No conversion input leaves the browser or CLI. There is no telemetry. The optional one-time Pro license supports development and unlocks batch migration workflow guidance; core conversion, reports, credential stripping, accessibility, and export remain free.

## Deployment and publishing

Deploy `dist/site/` as a static site. The factory owns registry and release credentials; workers must not publish. Validate the Rust package with:

```sh
cargo package --manifest-path cli/Cargo.toml --allow-dirty
```

## License

MIT. See [LICENSE](LICENSE).
