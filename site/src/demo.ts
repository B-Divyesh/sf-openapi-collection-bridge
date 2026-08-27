export type Format = 'openapi' | 'postman' | 'insomnia' | 'curl' | 'bruno';
type Request = { name: string; method: string; url: string; headers: Record<string, string>; body?: string };
export type Finding = { status: 'preserved' | 'transformed' | 'unsupported'; feature: string; detail: string };
export type DemoResult = { output: string; extension: string; requests: number; findings: Finding[] };

export const samples: Record<Exclude<Format, 'bruno'>, string> = {
  openapi: JSON.stringify({ openapi: '3.1.0', info: { title: 'Parcel notes', version: '1.0' }, servers: [{ url: 'https://api.example.test' }], paths: { '/parcels': { get: { summary: 'List parcels', responses: { '200': { description: 'Parcel list' } } }, post: { summary: 'Create parcel', requestBody: { content: { 'application/json': { example: { label: 'PX-104' } } } }, responses: { '201': { description: 'Created' } } } } } }, null, 2),
  postman: JSON.stringify({ info: { name: 'Parcel notes', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'List parcels', request: { method: 'GET', header: [{ key: 'Authorization', value: 'Bearer demo-secret' }], url: { raw: 'https://api.example.test/parcels' } }, response: [] }] }, null, 2),
  insomnia: JSON.stringify({ _type: 'export', __export_format: 4, resources: [{ _id: 'wrk_demo', _type: 'workspace', name: 'Parcel notes' }, { _id: 'req_demo', _type: 'request', parentId: 'wrk_demo', name: 'List parcels', method: 'GET', url: 'https://api.example.test/parcels', headers: [] }] }, null, 2),
  curl: "curl --request POST --header 'Authorization: Bearer demo-secret' --header 'Content-Type: application/json' --data-raw '{\"label\":\"PX-104\"}' https://api.example.test/parcels"
};

export function convertDemo(source: string, from: Exclude<Format, 'bruno'>, to: Format): DemoResult {
  if (!source.trim()) throw new Error('Paste source content or load a file first.');
  const requests = parse(source, from);
  if (!requests.length) throw new Error('No requests were found. Check the selected source format.');
  let stripped = 0;
  for (const request of requests) for (const key of Object.keys(request.headers)) if (/authorization|api[-_]?key|token|secret|cookie/i.test(key) && !request.headers[key].includes('{{')) { request.headers[key] = `{{bridge_secret_${key.toLowerCase().replace(/[^a-z0-9]+/g, '_')}}}`; stripped++; }
  const findings: Finding[] = [
    { status: 'preserved', feature: `${requests.length} request${requests.length === 1 ? '' : 's'}`, detail: 'Methods, URLs, headers, and bodies were inventoried.' },
    ...(stripped ? [{ status: 'transformed' as const, feature: `${stripped} credential value${stripped === 1 ? '' : 's'}`, detail: 'Replaced with named placeholders before export.' }] : []),
  ];
  if (to === 'curl') findings.push({ status: 'unsupported', feature: 'Named environments and tests', detail: 'A cURL command has no portable container for these semantics.' });
  if (to === 'openapi') findings.push({ status: 'transformed', feature: 'Requests', detail: 'Requests became OpenAPI path operations.' });
  return { output: render(requests, to), extension: to === 'bruno' ? 'bru' : to === 'curl' ? 'sh' : 'json', requests: requests.length, findings };
}

function parse(source: string, from: Exclude<Format, 'bruno'>): Request[] {
  if (from === 'curl') {
    const url = source.match(/https?:\/\/[^\s'"\\]+/)?.[0];
    if (!/^\s*curl\b/.test(source) || !url) throw new Error('This does not look like a cURL command with an http(s) URL.');
    const method = source.match(/(?:-X|--request)\s+['"]?([A-Za-z]+)/)?.[1]?.toUpperCase() ?? (/(?:-d|--data)/.test(source) ? 'POST' : 'GET');
    const headers: Record<string, string> = {};
    for (const match of source.matchAll(/(?:-H|--header)\s+(['"])(.*?)\1/g)) { const split = match[2].indexOf(':'); if (split > 0) headers[match[2].slice(0, split).trim()] = match[2].slice(split + 1).trim(); }
    const body = source.match(/(?:-d|--data(?:-raw|-binary)?)\s+(['"])(.*?)\1/)?.[2];
    return [{ name: 'Imported cURL request', method, url, headers, body }];
  }
  let doc: any;
  try { doc = JSON.parse(source); } catch { throw new Error('The browser specimen accepts JSON. The CLI also accepts OpenAPI YAML.'); }
  if (from === 'openapi') {
    if (!doc.openapi || !doc.paths) throw new Error('Expected an OpenAPI document with a paths object.');
    const base = doc.servers?.[0]?.url ?? '';
    return Object.entries(doc.paths).flatMap(([path, operations]: [string, any]) => Object.entries(operations).filter(([method]) => /^(get|post|put|patch|delete|head|options)$/i.test(method)).map(([method, op]: [string, any]) => ({ name: op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), url: `${base}${path}`, headers: {}, body: firstExample(op.requestBody?.content) })));
  }
  if (from === 'postman') {
    if (!Array.isArray(doc.item)) throw new Error('Expected a Postman collection item array.');
    const out: Request[] = [];
    const walk = (items: any[]) => items.forEach(item => item.item ? walk(item.item) : item.request && out.push({ name: item.name ?? 'Untitled', method: item.request.method ?? 'GET', url: typeof item.request.url === 'string' ? item.request.url : item.request.url?.raw ?? '', headers: Object.fromEntries((item.request.header ?? []).map((h: any) => [h.key, h.value])), body: item.request.body?.raw }));
    walk(doc.item); return out;
  }
  if (!Array.isArray(doc.resources)) throw new Error('Expected an Insomnia resources array.');
  return doc.resources.filter((r: any) => r._type === 'request').map((r: any) => ({ name: r.name ?? 'Untitled', method: r.method ?? 'GET', url: r.url ?? '', headers: Object.fromEntries((r.headers ?? []).map((h: any) => [h.name, h.value])), body: r.body?.text }));
}

function firstExample(content: any): string | undefined { const media = content && Object.values(content)[0] as any; return media?.example === undefined ? undefined : JSON.stringify(media.example); }
function operationPath(url: string): string { try { return new URL(url).pathname; } catch { return url.startsWith('/') ? url : `/${url}`; } }
function render(requests: Request[], to: Format): string {
  if (to === 'curl') return requests.map(r => ['curl', '--request', r.method, ...Object.entries(r.headers).flatMap(([k,v]) => ['--header', quote(`${k}: ${v}`)]), ...(r.body ? ['--data-raw', quote(r.body)] : []), quote(r.url)].join(' ')).join('\n\n');
  if (to === 'bruno') return requests.map((r, i) => `meta {\n  name: ${r.name}\n  type: http\n  seq: ${i + 1}\n}\n\n${r.method.toLowerCase()} {\n  url: ${r.url}\n  body: ${r.body ? 'json' : 'none'}\n  auth: none\n}\n${Object.keys(r.headers).length ? `\nheaders {\n${Object.entries(r.headers).map(([k,v]) => `  ${k}: ${v}`).join('\n')}\n}` : ''}${r.body ? `\n\nbody:json {\n${r.body}\n}` : ''}`).join('\n\n--- next .bru file ---\n\n');
  if (to === 'openapi') { const paths: any = {}; requests.forEach(r => { const path = operationPath(r.url); paths[path] ??= {}; paths[path][r.method.toLowerCase()] = { summary: r.name, responses: { '200': { description: 'Imported response' } }, ...(r.body ? { requestBody: { content: { 'application/json': { example: safeJson(r.body) } } } } : {}) }; }); return JSON.stringify({ openapi: '3.1.0', info: { title: 'Bridge export', version: '1.0.0' }, paths }, null, 2); }
  if (to === 'postman') return JSON.stringify({ info: { name: 'Bridge export', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: requests.map(r => ({ name: r.name, request: { method: r.method, header: Object.entries(r.headers).map(([key,value]) => ({ key, value })), url: { raw: r.url }, ...(r.body ? { body: { mode: 'raw', raw: r.body } } : {}) }, response: [] })) }, null, 2);
  return JSON.stringify({ _type: 'export', __export_format: 4, resources: [{ _id: 'wrk_bridge', _type: 'workspace', name: 'Bridge export' }, ...requests.map((r,i) => ({ _id: `req_${i + 1}`, _type: 'request', parentId: 'wrk_bridge', name: r.name, method: r.method, url: r.url, headers: Object.entries(r.headers).map(([name,value]) => ({ name, value })), body: r.body ? { mimeType: 'application/json', text: r.body } : {} }))] }, null, 2);
}
function safeJson(value: string): any { try { return JSON.parse(value); } catch { return value; } }
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
