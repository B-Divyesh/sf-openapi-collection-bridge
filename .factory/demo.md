# Demo sandbox

## CLI demo

Run the bundled sample with:

```sh
ocb demo
```

From a source checkout, use:

```sh
cargo run --manifest-path cli/Cargo.toml -- demo
```

The command copies `examples/parcel-api.postman_collection.json` and `examples/development.postman_environment.json` into a new directory under the operating system temporary directory. It runs the same conversion path as `ocb convert`, then prints the OpenAPI output and Markdown evidence report paths.

The sample has three parcel requests, a development environment, API-key authentication, a response example, and a Postman test. Credential values are replaced by named placeholders.

## Browser demo

- URL: `https://openapi-collection-bridge.sociobot.in/demo/`
- Local URL: `http://127.0.0.1:5173/demo/`
- Default conversion: three-request OpenAPI sample to Bruno
- Reset: choose **Reset demo** in the persistent demo banner
- Leave demo: choose **Start for real**

Browser demo state exists only in page memory. It uses no local storage, IndexedDB, OPFS, cookies, or backend tenant. It never reads the license namespace. Reset recreates the bundled sample in memory, and leaving or reloading discards edits.

The home-page terminal SVG records output from the real `ocb demo` command. It is not a separate converter implementation.
