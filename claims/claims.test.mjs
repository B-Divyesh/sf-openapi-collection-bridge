import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const bin = resolve(root, 'target/debug/ocb');
const base = 'http://127.0.0.1:43991';
let server;

beforeAll(async () => {
  server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--config', resolve(root, 'site/vite.config.ts'), '--host', '127.0.0.1', '--port', '43991', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const response = await fetch(`${base}/`); if (response.ok) return; } catch { /* Server is starting. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('Vite claim server did not start');
}, 20_000);

afterAll(() => { server?.kill('SIGTERM'); });

function temp() { return mkdtempSync(join(tmpdir(), 'ocb-claim-')); }
function cli(args, options = {}) { return spawnSync(bin, args, { cwd: root, encoding: 'utf8', ...options }); }
function ok(args, options = {}) { const result = cli(args, options); expect(result.status, result.stderr).toBe(0); return result; }
function json(args, options = {}) { return JSON.parse(ok(args, options).stdout); }
function fixture(name) { return resolve(root, 'examples', name); }

it('@claim:five-format-conversion converts every supported source and destination', () => {
  const dir = temp();
  const postman = fixture('parcel-api.postman_collection.json');
  const insomnia = join(dir, 'parcel.insomnia.json');
  ok(['convert', postman, '--to', 'insomnia', '--output', insomnia]);
  const bruno = join(dir, 'bruno');
  ok(['convert', insomnia, '--to', 'bruno', '--output', bruno]);
  const curl = join(dir, 'requests.sh');
  ok(['convert', bruno, '--to', 'curl', '--output', curl]);
  const openapi = join(dir, 'openapi.json');
  ok(['convert', "curl -H 'X-Trace: one' https://api.example.test/parcels", '--from', 'curl', '--to', 'openapi', '--output', openapi]);
  const backToPostman = join(dir, 'postman.json');
  ok(['convert', openapi, '--to', 'postman', '--output', backToPostman]);
  expect(JSON.parse(readFileSync(backToPostman, 'utf8')).item).toHaveLength(1);
  expect(existsSync(join(bruno, 'list-parcels.bru'))).toBe(true);
  expect(readFileSync(curl, 'utf8')).toContain('curl');
});

it('@claim:semantic-report lists preserved, transformed, and unsupported outcomes', () => {
  const dir = temp();
  const output = join(dir, 'openapi.json');
  const result = json(['convert', fixture('parcel-api.postman_collection.json'), '--to', 'openapi', '--output', output, '--json']);
  const report = readFileSync(result.report, 'utf8');
  expect(report).toContain('## Preserved');
  expect(report).toContain('## Transformed');
  expect(report).toContain('## Unsupported');
  expect(report).toContain('request scripts/tests');
  expect(report).toContain("request 'List parcels' URL variable");
});

it('@claim:credential-redaction removes literal credential values by default', () => {
  const dir = temp(); const output = join(dir, 'out.json');
  ok(['convert', "curl -H 'Authorization: Bearer live-secret' --data-raw '{\"password\":\"body-secret\"}' 'https://api.example.test/me?api_key=query-secret'", '--from', 'curl', '--to', 'postman', '--output', output]);
  const text = readFileSync(output, 'utf8');
  expect(text).not.toMatch(/live-secret|body-secret|query-secret/);
  expect(text).toContain('bridge_secret_authorization');
});

it('@claim:deterministic-output produces identical files for identical input', () => {
  const dir = temp(); const first = join(dir, 'first.json'); const second = join(dir, 'second.json');
  const input = "curl -H 'X-Trace: stable' https://api.example.test/ping";
  ok(['convert', input, '--from', 'curl', '--to', 'openapi', '--output', first]);
  ok(['convert', input, '--from', 'curl', '--to', 'openapi', '--output', second]);
  expect(readFileSync(first)).toEqual(readFileSync(second));
});

it('@claim:source-control-output omits timestamps and machine paths from artifacts', () => {
  const dir = temp(); const output = join(dir, 'stable.json');
  const result = json(['convert', 'curl https://api.example.test/ping', '--from', 'curl', '--to', 'openapi', '--output', output, '--json']);
  const artifacts = `${readFileSync(output, 'utf8')}\n${readFileSync(result.report, 'utf8')}`;
  expect(artifacts).not.toContain(dir);
  expect(artifacts).not.toMatch(/20\d\d-\d\d-\d\dT/);
});

it('@claim:no-telemetry completes with all proxy routes unavailable', () => {
  const dir = temp(); const output = join(dir, 'out.json');
  const result = cli(['convert', 'curl https://api.example.test/ping', '--from', 'curl', '--to', 'openapi', '--output', output], { env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9' } });
  expect(result.status, result.stderr).toBe(0);
  expect(existsSync(output)).toBe(true);
});

it('@claim:local-conversion-network keeps browser conversion requests on origin', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); const page = await context.newPage(); const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(`${base}/demo/`, { waitUntil: 'networkidle' });
  await page.locator('#convert-button').click();
  await expect.poll(() => page.locator('#conversion-result').isVisible()).toBe(true);
  expect(requests.every(url => url.startsWith(base))).toBe(true);
  await browser.close();
});

it('@claim:markdown-report writes a Markdown report beside every export', () => {
  const dir = temp(); const file = join(dir, 'out.json'); const result = json(['convert', 'curl https://api.example.test/ping', '--from', 'curl', '--to', 'postman', '--output', file, '--json']);
  expect(result.report).toBe(`${file}.bridge-report.md`);
  expect(readFileSync(result.report, 'utf8')).toContain('# Bridge evidence:');
  const bruno = join(dir, 'bruno'); const directoryResult = json(['convert', 'curl https://api.example.test/ping', '--from', 'curl', '--to', 'bruno', '--output', bruno, '--json']);
  expect(directoryResult.report).toBe(join(bruno, 'bridge-report.md'));
});

it('@claim:format-detection detects known file and directory sources', () => {
  const dir = temp();
  const cases = [
    [fixture('parcel-api.postman_collection.json'), 'postman'],
    [join(dir, 'openapi.json'), 'openapi'],
    [join(dir, 'insomnia.json'), 'insomnia']
  ];
  writeFileSync(cases[1][0], '{"openapi":"3.1.0","info":{"title":"Ping","version":"1"},"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}');
  writeFileSync(cases[2][0], '{"_type":"export","resources":[{"_id":"w","_type":"workspace","name":"W"},{"_id":"r","_type":"request","parentId":"w","name":"Ping","url":"https://api.example.test/ping"}]}');
  for (const [path, format] of cases) expect(json(['inspect', path, '--json']).collection.source).toBe(format);
  const bruno = join(dir, 'bruno'); mkdirSync(bruno); writeFileSync(join(bruno, 'bruno.json'), '{"name":"B"}'); writeFileSync(join(bruno, 'ping.bru'), 'meta {\n name: Ping\n}\nget {\n url: https://api.example.test/ping\n}');
  expect(json(['inspect', bruno, '--json']).collection.source).toBe('bruno');
});

it('@claim:json-streams prints JSON to stdout and diagnostics to stderr', () => {
  const dir = temp(); const result = cli(['convert', 'curl https://api.example.test/ping', '--from', 'curl', '--to', 'openapi', '--output', join(dir, 'out.json'), '--json']);
  expect(result.status).toBe(0); expect(() => JSON.parse(result.stdout)).not.toThrow(); expect(result.stderr).toBe('');
  const invalid = cli(['inspect', 'not-a-format', '--json']); expect(invalid.status).toBe(2); expect(invalid.stdout).toBe(''); expect(invalid.stderr).toContain('error:');
});

it('@claim:exit-codes returns documented exit codes 0, 2, 3, and 4', () => {
  const dir = temp();
  expect(cli(['formats']).status).toBe(0);
  expect(cli(['inspect', 'not-a-format']).status).toBe(2);
  const blocked = join(dir, 'file'); writeFileSync(blocked, 'x'); expect(cli(['convert', 'curl https://api.example.test', '--from', 'curl', '--to', 'openapi', '--output', join(blocked, 'out.json')]).status).toBe(3);
  expect(cli(['convert', fixture('parcel-api.postman_collection.json'), '--to', 'openapi', '--output', join(dir, 'loss.json'), '--fail-on-loss']).status).toBe(4);
});

it('@claim:openapi-semantics inventories operations, parameters, examples, servers, auth, and variables', () => {
  const dir = temp(); const source = join(dir, 'api.json');
  writeFileSync(source, JSON.stringify({ openapi: '3.1.0', info: { title: 'Orders', version: '1' }, servers: [{ url: 'https://{region}.api.test', variables: { region: { default: 'us' } } }], components: { securitySchemes: { key: { type: 'apiKey', name: 'X-API-Key', in: 'header' } } }, paths: { '/orders': { post: { security: [{ key: [] }], parameters: [{ in: 'header', name: 'X-Trace', example: 'trace-1' }], requestBody: { content: { 'application/json': { example: { sku: 'A1' } } } }, responses: { 201: { description: 'Created', content: { 'application/json': { example: { id: 'ord_1' } } } } } } } } }));
  const inventory = json(['inspect', source, '--json']).collection;
  expect(inventory.requests[0].headers['X-Trace']).toBe('trace-1'); expect(inventory.requests[0].body.text).toContain('A1'); expect(inventory.requests[0].examples[0].body).toContain('ord_1'); expect(inventory.requests[0].auth.fields.key).toBe('X-API-Key'); expect(inventory.environments[0].variables.region).toBe('us');
  const openapi30 = join(dir, 'api-3.0.json'); writeFileSync(openapi30, '{"openapi":"3.0.3","info":{"title":"Ping","version":"1"},"paths":{"/ping":{"get":{"responses":{"200":{"description":"ok"}}}}}}'); expect(json(['inspect', openapi30, '--json']).collection.requests[0].url).toBe('/ping');
});

it('@claim:postman-semantics inventories nested requests, auth, examples, variables, scripts, and tests', () => {
  const inventory = json(['inspect', fixture('parcel-api.postman_collection.json'), '--json']).collection;
  expect(inventory.requests).toHaveLength(3); expect(inventory.requests[0].auth.fields.key).toBe('X-API-Key'); expect(inventory.requests[0].examples[0].status).toBe(200); expect(inventory.requests[2].scripts[0].code).toContain('pm.test'); expect(inventory.environments[0].variables.base_url).toBe('https://api.example.test');
});

it('@claim:insomnia-semantics inventories requests, environments, bodies, auth, and parameters', () => {
  const dir = temp(); const source = join(dir, 'insomnia.json');
  writeFileSync(source, JSON.stringify({ _type: 'export', resources: [{ _id: 'w', _type: 'workspace', name: 'W' }, { _id: 'e', _type: 'environment', parentId: 'w', name: 'Dev', data: { base_url: 'https://api.test' } }, { _id: 'r', _type: 'request', parentId: 'w', name: 'Create', method: 'POST', url: '{{base_url}}/items', headers: [{ name: 'X-Trace', value: 'one' }], parameters: [{ name: 'expand', value: 'all' }], body: { mimeType: 'application/json', text: '{"name":"A"}' }, authentication: { type: 'bearer', token: 'secret' } }] }));
  const request = json(['inspect', source, '--json']).collection.requests[0]; expect(request.body.text).toContain('name'); expect(request.auth.kind).toBe('bearer'); expect(request.query[0].name).toBe('expand');
});

it('@claim:bruno-semantics inventories layout, ordering, environments, auth, bodies, variables, and scripts', () => {
  const dir = temp(); const bruno = join(dir, 'bruno'); mkdirSync(bruno); mkdirSync(join(bruno, 'environments'));
  writeFileSync(join(bruno, 'bruno.json'), '{"name":"Orders"}'); writeFileSync(join(bruno, 'z-create.bru'), 'meta {\n name: Create\n seq: 1\n}\npost {\n url: {{base_url}}/orders\n body: json\n auth: bearer\n}\nbody:json {\n{"sku":"A1"}\n}\nauth:bearer {\n token: secret\n}\ntests {\nexpect(res.status).to.equal(201);\n}'); writeFileSync(join(bruno, 'a-list.bru'), 'meta {\n name: List\n seq: 2\n}\nget {\n url: {{base_url}}/orders\n}'); writeFileSync(join(bruno, 'environments', 'dev.bru'), 'vars {\n base_url: https://api.test\n}');
  const inventory = json(['inspect', bruno, '--json']).collection; expect(inventory.name).toBe('Orders'); expect(inventory.requests.map(request => request.name)).toEqual(['Create', 'List']); expect(inventory.requests[0].body.text).toContain('A1'); expect(inventory.requests[0].auth.kind).toBe('bearer'); expect(inventory.requests[0].scripts[0].code).toContain('201'); expect(inventory.environments[0].variables.base_url).toBe('https://api.test');
});

it('@claim:curl-semantics parses method, URL, headers, auth, forms, and bodies without shell execution', () => {
  const dir = temp(); const marker = join(dir, 'should-not-exist');
  const command = `curl -X POST -u alice:secret -H 'X-Trace: one' -F 'file=@fixture.txt' 'https://api.test/upload'; touch '${marker}'`;
  const inventory = json(['inspect', command, '--from', 'curl', '--json']).collection.requests[0];
  expect(inventory.method).toBe('POST'); expect(inventory.url).toBe('https://api.test/upload'); expect(inventory.headers['X-Trace']).toBe('one'); expect(inventory.auth.kind).toBe('basic'); expect(inventory.body.mime).toBe('multipart/form-data'); expect(existsSync(marker)).toBe(false);
});

it('@claim:browser-download converts locally and downloads populated output', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext({ acceptDownloads: true }); const page = await context.newPage(); await page.goto(`${base}/demo/`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-output').click()]);
  const path = join(temp(), 'result.bru'); await download.saveAs(path); const output = readFileSync(path, 'utf8'); expect(output).toContain('name: List parcels'); expect(output).toContain('auth: apikey'); await browser.close();
});

it('@claim:offline-demo reloads and converts after the first visit', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); const page = await context.newPage(); await page.goto(`${base}/demo/`, { waitUntil: 'networkidle' }); await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true)); await page.reload({ waitUntil: 'networkidle' }); expect(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true); await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' }); await expect.poll(() => page.locator('#conversion-result').isVisible()).toBe(true); await page.locator('#convert-button').click(); expect(await page.locator('#output-preview').textContent()).toContain('List parcels'); await context.close(); await browser.close();
});

it('@claim:single-binary runs from a clean directory with no companion files', () => {
  const dir = temp(); const standalone = join(dir, 'ocb'); copyFileSync(bin, standalone); const result = spawnSync(standalone, ['formats', '--json'], { cwd: dir, encoding: 'utf8' }); expect(result.status, result.stderr).toBe(0); expect(JSON.parse(result.stdout)).toHaveLength(5);
});

it('@claim:no-account runs the bundled sample without account setup', () => {
  const result = json(['demo', '--json']); expect(result.status).toBe('converted'); expect(result.counts.requests).toBe(3);
});

it('@claim:free-core converts, reports, redacts, and exports without a license', () => {
  const dir = temp(); const output = join(dir, 'free.json'); const result = json(['convert', "curl -H 'Authorization: secret' https://api.test/me", '--from', 'curl', '--to', 'postman', '--output', output, '--json']); expect(existsSync(output)).toBe(true); expect(existsSync(result.report)).toBe(true); expect(readFileSync(output, 'utf8')).toContain('bridge_secret_authorization');
});

it('@claim:pro-price shows the production $29 one-time offer with no subscription', async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(`${base}/`); const link = page.locator('#buy-link'); expect(await link.getAttribute('href')).toBe('https://api.sociobot.in/api/v1/products/openapi-collection-bridge/checkout'); expect(await link.textContent()).toContain('$29'); expect(await page.locator('#pricing').textContent()).toContain('no subscription'); await browser.close();
});

it('@claim:pro-planner builds a collection-specific migration plan after valid verification', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true,"reason":"ok","expires_at":null}' })); const page = await context.newPage(); await page.goto(`${base}/?license=valid-fixture`, { waitUntil: 'networkidle' }); await page.locator('#collection-count').fill('7'); await page.locator('#make-plan').click(); expect(await page.locator('#plan-output').textContent()).toContain('7 collections'); await browser.close();
});

it('@claim:pro-ci-policy downloads a reusable CI policy after valid verification', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext({ acceptDownloads: true }); await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true,"reason":"ok","expires_at":null}' })); const page = await context.newPage(); await page.goto(`${base}/?license=valid-fixture`, { waitUntil: 'networkidle' }); const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-ci').click()]); const path = join(temp(), 'policy.yml'); await download.saveAs(path); const policy = readFileSync(path, 'utf8'); expect(policy).toContain('name: Check API migration'); expect(policy).toContain('--fail-on-loss'); await browser.close();
});

it('@claim:license-return stores the token and removes it from the address bar', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true,"reason":"ok","expires_at":null}' })); const page = await context.newPage(); await page.goto(`${base}/?license=returned-token`, { waitUntil: 'networkidle' }); expect(new URL(page.url()).searchParams.has('license')).toBe(false); expect(await page.evaluate(() => localStorage.getItem('sb_license:openapi-collection-bridge'))).toBe('returned-token'); await browser.close();
});

it('@claim:license-daily-cache verifies at most once daily and keeps cached first paint', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); let checks = 0; await context.route('https://api.sociobot.in/**', route => { checks++; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true,"reason":"ok","expires_at":null}' }); }); const page = await context.newPage(); await page.goto(`${base}/?license=cached-token`, { waitUntil: 'networkidle' }); expect(checks).toBe(1); await page.reload({ waitUntil: 'networkidle' }); expect(checks).toBe(1); expect(await page.locator('#license-status').textContent()).toContain('unlocked'); await browser.close();
});

it('@claim:restore-license verifies a pasted license and shows Pro tools', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true,"reason":"ok","expires_at":null}' })); const page = await context.newPage(); await page.goto(`${base}/`); await page.locator('#license-input').fill('pasted-license'); await page.locator('#license-form button').click(); await expect.poll(() => page.locator('#pro-tools').isVisible()).toBe(true); expect(await page.evaluate(() => localStorage.getItem('sb_license:openapi-collection-bridge'))).toBe('pasted-license'); await browser.close();
});

it('@claim:revoked-license locks Pro tools and restores the purchase action', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":false,"reason":"revoked","expires_at":null}' })); const page = await context.newPage(); await page.goto(`${base}/?license=refunded-license`, { waitUntil: 'networkidle' }); expect(await page.locator('#pro-tools').isHidden()).toBe(true); expect(await page.locator('#license-status').textContent()).toContain('no longer active'); expect(await page.locator('#buy-link').isVisible()).toBe(true); await browser.close();
});

it('@claim:no-tracking loads and converts with no advertising, analytics, font, or tracking requests', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); const requests = []; const page = await context.newPage(); page.on('request', request => requests.push(request.url())); await page.goto(`${base}/demo/`, { waitUntil: 'networkidle' }); await page.locator('#convert-button').click(); expect(requests.every(url => url.startsWith(base))).toBe(true); expect(await page.locator('script[src*="analytics"], link[href*="fonts.googleapis"]').count()).toBe(0); await browser.close();
});

it('@claim:memory-only-demo does not retain browser input and clears it on reload', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); const page = await context.newPage(); await page.goto(`${base}/demo/`); await page.locator('#source-input').fill('private-input-marker'); expect(await page.evaluate(() => localStorage.length)).toBe(0); await page.reload(); expect(await page.locator('#source-input').inputValue()).not.toContain('private-input-marker'); expect(await page.locator('#source-input').inputValue()).toContain('Parcel operations'); expect(await page.evaluate(() => localStorage.length)).toBe(0); await browser.close();
});

it('@claim:demo-sandbox loads populated sample, keeps its label, resets, and leaves real storage unchanged', async () => {
  const browser = await chromium.launch(); const context = await browser.newContext(); const page = await context.newPage(); await page.goto(`${base}/demo/`); expect(await page.locator('.demo-banner').textContent()).toContain('Demo — sample data, nothing is saved'); expect(await page.locator('#evidence-summary').textContent()).toContain('3 requests'); await page.evaluate(() => localStorage.setItem('real:marker', 'unchanged')); await page.locator('#source-input').fill('changed'); await page.locator('#reset-demo').click(); expect(await page.locator('#source-input').inputValue()).toContain('Parcel operations'); expect(await page.evaluate(() => localStorage.getItem('real:marker'))).toBe('unchanged'); expect(await page.locator('.demo-banner').isVisible()).toBe(true); expect(await page.locator('.demo-banner a').getAttribute('href')).toBe('/#install'); await browser.close();
});

it('@claim:variable-url-roundtrip keeps Postman base URLs usable through OpenAPI', () => {
  const dir = temp(); const collection = join(dir, 'source.json'); const environment = join(dir, 'env.json'); writeFileSync(collection, '{"info":{"name":"Pilot","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"item":[{"name":"Account","request":{"method":"GET","url":{"raw":"{{base_url}}/account"}}}]}'); writeFileSync(environment, '{"name":"Development","values":[{"key":"base_url","value":"https://api.example.test","enabled":true}]}'); const openapi = join(dir, 'openapi.json'); ok(['convert', collection, '--to', 'openapi', '--output', openapi, '--environment', environment]); const document = JSON.parse(readFileSync(openapi, 'utf8')); expect(document.paths['/account'].get).toBeTruthy(); expect(document.paths['/{{base_url}}/account']).toBeUndefined(); const roundtrip = join(dir, 'roundtrip.json'); ok(['convert', openapi, '--to', 'postman', '--output', roundtrip]); expect(JSON.parse(readFileSync(roundtrip, 'utf8')).item[0].request.url.raw).toBe('https://api.example.test/account');
});

it('@claim:designed-404 provides a clear missing-page route with a way home', async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(`${base}/404.html`); expect(await page.title()).toBe('Page not found — OpenAPI Collection Bridge'); expect(await page.locator('h1').textContent()).toBe('This page was not found'); expect(await page.locator('main a').getAttribute('href')).toBe('/'); await browser.close();
});
