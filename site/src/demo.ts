export type Format = 'openapi' | 'postman' | 'insomnia' | 'curl' | 'bruno';
type Pair = { name: string; value: string };
type Auth = { kind: string; fields: Record<string, string> };
type Example = { name: string; status: number; body: string };
type Request = {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Pair[];
  body?: string;
  auth?: Auth;
  examples: Example[];
  scripts: string[];
};
type Parsed = { name: string; requests: Request[]; environments: Record<string, string>[] };
export type Finding = { status: 'preserved' | 'transformed' | 'unsupported'; feature: string; detail: string };
export type DemoResult = { output: string; extension: string; requests: number; findings: Finding[] };

const sampleOpenApi = {
  openapi: '3.1.0',
  info: { title: 'Parcel operations', version: '1.0.0' },
  servers: [{ url: 'https://api.example.test', description: 'Development' }],
  components: { securitySchemes: { parcelKey: { type: 'apiKey', name: 'X-API-Key', in: 'header' } } },
  paths: {
    '/parcels': {
      get: {
        summary: 'List parcels',
        security: [{ parcelKey: [] }],
        parameters: [
          { name: 'X-Trace', in: 'header', required: true, schema: { type: 'string', default: 'trace-demo-104' } },
          { name: 'status', in: 'query', schema: { type: 'string', default: 'in_transit' } }
        ],
        responses: { '200': { description: 'Two parcels', content: { 'application/json': { example: { items: [{ id: 'par_104', status: 'in_transit' }, { id: 'par_105', status: 'in_transit' }] } } } } }
      },
      post: {
        summary: 'Create parcel',
        requestBody: { content: { 'application/json': { example: { recipient: 'Mira Chen', postal_code: '94107' } } } },
        responses: { '201': { description: 'Created' } }
      }
    },
    '/parcels/{parcel_id}/events': {
      get: {
        summary: 'Track parcel',
        parameters: [{ name: 'parcel_id', in: 'path', required: true, schema: { type: 'string', default: 'par_104' } }],
        responses: { '200': { description: 'Tracking events' } }
      }
    }
  }
};

export const samples: Record<Exclude<Format, 'bruno'>, string> = {
  openapi: JSON.stringify(sampleOpenApi, null, 2),
  postman: JSON.stringify({
    info: { name: 'Parcel operations', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    variable: [{ key: 'base_url', value: 'https://api.example.test' }],
    item: [{ name: 'List parcels', request: { method: 'GET', auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-API-Key' }, { key: 'value', value: 'demo-api-secret' }, { key: 'in', value: 'header' }] }, header: [{ key: 'X-Trace', value: 'trace-demo-104' }], url: { raw: '{{base_url}}/parcels?status=in_transit', query: [{ key: 'status', value: 'in_transit' }] } }, response: [{ name: 'Two parcels', code: 200, body: '{"items":[{"id":"par_104","status":"in_transit"}]}' }] }]
  }, null, 2),
  insomnia: JSON.stringify({ _type: 'export', __export_format: 4, resources: [{ _id: 'wrk_demo', _type: 'workspace', name: 'Parcel operations' }, { _id: 'env_demo', _type: 'environment', parentId: 'wrk_demo', name: 'Development', data: { base_url: 'https://api.example.test' } }, { _id: 'req_demo', _type: 'request', parentId: 'wrk_demo', name: 'List parcels', method: 'GET', url: '{{ _.base_url }}/parcels', headers: [{ name: 'X-Trace', value: 'trace-demo-104' }], authentication: { type: 'bearer', token: 'demo-api-secret' } }] }, null, 2),
  curl: "curl --request POST --header 'Authorization: Bearer demo-api-secret' --header 'Content-Type: application/json' --data-raw '{\"recipient\":\"Mira Chen\",\"postal_code\":\"94107\"}' https://api.example.test/parcels"
};

export function convertDemo(source: string, from: Exclude<Format, 'bruno'>, to: Format): DemoResult {
  if (!source.trim()) throw new Error('Paste source content or load a file first.');
  const parsed = parse(source, from);
  if (!parsed.requests.length) throw new Error('No requests were found. Check the selected source format.');
  const findings: Finding[] = [];
  let stripped = 0;
  for (const request of parsed.requests) stripped += redactRequest(request);
  findings.push({ status: 'preserved', feature: `${parsed.requests.length} request${parsed.requests.length === 1 ? '' : 's'}`, detail: 'Methods and usable URLs are included in the output.' });
  if (parsed.requests.some(request => Object.keys(request.headers).length || request.query.length || request.body)) findings.push({ status: 'preserved', feature: 'Request data', detail: 'Headers, query values, and request bodies are included where present.' });
  if (stripped) findings.push({ status: 'transformed', feature: `${stripped} credential value${stripped === 1 ? '' : 's'}`, detail: 'Literal credentials were replaced with named placeholders.' });
  addSemanticFindings(parsed, to, findings);
  return { output: render(parsed, to), extension: to === 'bruno' ? 'bru' : to === 'curl' ? 'sh' : 'json', requests: parsed.requests.length, findings };
}

function parse(source: string, from: Exclude<Format, 'bruno'>): Parsed {
  if (from === 'curl') return parseCurl(source);
  let doc: any;
  try { doc = JSON.parse(source); } catch { throw new Error('This browser demo accepts JSON. The CLI also accepts OpenAPI YAML.'); }
  if (from === 'openapi') return parseOpenApi(doc);
  if (from === 'postman') return parsePostman(doc);
  return parseInsomnia(doc);
}

function blankRequest(name: string, method: string, url: string): Request { return { name, method, url, headers: {}, query: [], examples: [], scripts: [] }; }

function parseOpenApi(doc: any): Parsed {
  if (!doc.openapi || !doc.paths || typeof doc.paths !== 'object') throw new Error('Expected an OpenAPI document with a paths object.');
  const base = doc.servers?.[0]?.url ?? '';
  const requests: Request[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths) as [string, any][]) {
    for (const [method, operation] of Object.entries(pathItem) as [string, any][]) {
      if (!/^(get|post|put|patch|delete|head|options|trace)$/i.test(method)) continue;
      const request = blankRequest(operation.summary ?? operation.operationId ?? `${method.toUpperCase()} ${path}`, method.toUpperCase(), `${base}${path}`);
      for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
        const value = valueText(parameter.example ?? parameter.schema?.default ?? `{{${parameter.name}}}`);
        if (parameter.in === 'header') request.headers[parameter.name] = value;
        if (parameter.in === 'query') request.query.push({ name: parameter.name, value });
      }
      const body = firstExample(operation.requestBody?.content);
      if (body !== undefined) request.body = valueText(body);
      for (const [status, response] of Object.entries(operation.responses ?? {}) as [string, any][]) {
        const example = firstExample(response.content);
        if (example !== undefined) request.examples.push({ name: response.description ?? `Response ${status}`, status: Number(status) || 200, body: valueText(example) });
      }
      const schemeName = Object.keys((operation.security ?? doc.security ?? [])[0] ?? {})[0];
      if (schemeName) request.auth = openApiAuth(doc.components?.securitySchemes?.[schemeName], schemeName);
      requests.push(request);
    }
  }
  return { name: doc.info?.title ?? 'Bridge export', requests, environments: (doc.servers ?? []).map((server: any) => ({ base_url: server.url ?? '' })) };
}

function openApiAuth(scheme: any, name: string): Auth | undefined {
  if (!scheme) return undefined;
  if (scheme.type === 'apiKey') return { kind: 'apikey', fields: { key: scheme.name ?? 'X-API-Key', value: `{{bridge_secret_${slug(scheme.name ?? name)}}}`, in: scheme.in ?? 'header' } };
  if (scheme.type === 'http' && scheme.scheme === 'basic') return { kind: 'basic', fields: { username: `{{bridge_secret_${slug(name)}_username}}`, password: `{{bridge_secret_${slug(name)}_password}}` } };
  if (scheme.type === 'http') return { kind: 'bearer', fields: { token: `{{bridge_secret_${slug(name)}}}` } };
  if (scheme.type === 'oauth2') return { kind: 'oauth2', fields: { accessToken: `{{bridge_secret_${slug(name)}}}` } };
  return { kind: String(scheme.type ?? 'unknown'), fields: {} };
}

function parsePostman(doc: any): Parsed {
  if (!Array.isArray(doc.item)) throw new Error('Expected a Postman collection item array.');
  const requests: Request[] = [];
  const walk = (items: any[]) => items.forEach(item => {
    if (item.item) { walk(item.item); return; }
    if (!item.request) return;
    const raw = item.request;
    const request = blankRequest(item.name ?? 'Untitled', raw.method ?? 'GET', typeof raw.url === 'string' ? raw.url : raw.url?.raw ?? '');
    request.headers = Object.fromEntries((raw.header ?? []).filter((header: any) => !header.disabled).map((header: any) => [header.key, valueText(header.value)]));
    request.query = (raw.url?.query ?? []).filter((query: any) => !query.disabled).map((query: any) => ({ name: query.key, value: valueText(query.value) }));
    if (raw.body?.raw !== undefined) request.body = valueText(raw.body.raw);
    request.auth = postmanAuth(raw.auth);
    request.examples = (item.response ?? []).map((example: any) => ({ name: example.name ?? 'Example', status: example.code ?? 200, body: valueText(example.body ?? '') }));
    request.scripts = (item.event ?? []).map((event: any) => (event.script?.exec ?? []).join('\n')).filter(Boolean);
    requests.push(request);
  });
  walk(doc.item);
  const variables = Object.fromEntries((doc.variable ?? []).map((item: any) => [item.key, valueText(item.value)]));
  return { name: doc.info?.name ?? 'Bridge export', requests, environments: Object.keys(variables).length ? [variables] : [] };
}

function postmanAuth(value: any): Auth | undefined {
  if (!value?.type || value.type === 'noauth') return undefined;
  return { kind: value.type, fields: Object.fromEntries((value[value.type] ?? []).map((part: any) => [part.key, valueText(part.value)])) };
}

function parseInsomnia(doc: any): Parsed {
  if (!Array.isArray(doc.resources)) throw new Error('Expected an Insomnia resources array.');
  const requests = doc.resources.filter((resource: any) => resource._type === 'request').map((resource: any) => {
    const request = blankRequest(resource.name ?? 'Untitled', resource.method ?? 'GET', resource.url ?? '');
    request.headers = Object.fromEntries((resource.headers ?? []).filter((header: any) => !header.disabled).map((header: any) => [header.name, valueText(header.value)]));
    request.query = (resource.parameters ?? []).filter((query: any) => !query.disabled).map((query: any) => ({ name: query.name, value: valueText(query.value) }));
    if (resource.body?.text) request.body = valueText(resource.body.text);
    if (resource.authentication?.type && resource.authentication.type !== 'none') request.auth = { kind: resource.authentication.type, fields: Object.fromEntries(Object.entries(resource.authentication).filter(([key]) => !['type', 'disabled'].includes(key)).map(([key, value]) => [key, valueText(value)])) };
    return request;
  });
  const environments = doc.resources.filter((resource: any) => resource._type === 'environment').map((resource: any) => resource.data ?? {});
  return { name: doc.resources.find((resource: any) => resource._type === 'workspace')?.name ?? 'Bridge export', requests, environments };
}

function parseCurl(source: string): Parsed {
  const url = source.match(/https?:\/\/[^\s'"\\]+/)?.[0];
  if (!/^\s*curl\b/.test(source) || !url) throw new Error('Expected a cURL command with an http or https URL.');
  const method = source.match(/(?:-X|--request)\s+['"]?([A-Za-z]+)/)?.[1]?.toUpperCase() ?? (/(?:-d|--data)/.test(source) ? 'POST' : 'GET');
  const request = blankRequest('Imported cURL request', method, url);
  for (const match of source.matchAll(/(?:-H|--header)\s+(['"])(.*?)\1/g)) {
    const split = match[2].indexOf(':');
    if (split > 0) request.headers[match[2].slice(0, split).trim()] = match[2].slice(split + 1).trim();
  }
  request.body = source.match(/(?:-d|--data(?:-raw|-binary)?)\s+(['"])(.*?)\1/)?.[2];
  return { name: 'cURL import', requests: [request], environments: [] };
}

function redactRequest(request: Request): number {
  let count = 0;
  for (const key of Object.keys(request.headers)) if (secretKey(key) && !request.headers[key].includes('{{')) { request.headers[key] = `{{bridge_secret_${slug(key)}}}`; count++; }
  if (request.auth) for (const key of Object.keys(request.auth.fields)) if (authSecret(request.auth.kind, key) && !request.auth.fields[key].includes('{{')) { request.auth.fields[key] = `{{bridge_secret_${slug(key)}}}`; count++; }
  if (request.body) {
    try {
      const body = JSON.parse(request.body);
      const walk = (value: any): void => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (secretKey(key)) { value[key] = `{{bridge_secret_${slug(key)}}}`; count++; } else walk(child); } };
      walk(body);
      request.body = JSON.stringify(body);
    } catch { /* Plain bodies are retained as entered. */ }
  }
  return count;
}

function addSemanticFindings(parsed: Parsed, to: Format, findings: Finding[]): void {
  const auth = parsed.requests.filter(request => request.auth);
  if (auth.length) findings.push({ status: to === 'curl' ? 'transformed' : 'preserved', feature: `${auth.length} authentication rule${auth.length === 1 ? '' : 's'}`, detail: to === 'curl' ? 'Authentication became quoted cURL options or headers.' : `Authentication type and fields are included in the ${to} output.` });
  const examples = parsed.requests.reduce((total, request) => total + request.examples.length, 0);
  if (examples) findings.push(to === 'postman' || to === 'openapi' ? { status: 'preserved', feature: `${examples} response example${examples === 1 ? '' : 's'}`, detail: `Response status and body are included in the ${to} output.` } : { status: 'unsupported', feature: `${examples} response example${examples === 1 ? '' : 's'}`, detail: `${to} output has no portable request-attached response example.` });
  const scripts = parsed.requests.reduce((total, request) => total + request.scripts.length, 0);
  if (scripts) findings.push(to === 'postman' || to === 'bruno' ? { status: 'preserved', feature: `${scripts} test script${scripts === 1 ? '' : 's'}`, detail: `Script text is included in the ${to} output.` } : { status: 'unsupported', feature: `${scripts} test script${scripts === 1 ? '' : 's'}`, detail: `${to} output has no portable request test block.` });
  if (parsed.environments.length) findings.push(to === 'curl' ? { status: 'unsupported', feature: `${parsed.environments.length} environment${parsed.environments.length === 1 ? '' : 's'}`, detail: 'cURL command text has no named environment container.' } : { status: 'transformed', feature: `${parsed.environments.length} environment${parsed.environments.length === 1 ? '' : 's'}`, detail: `Server and variable values are represented in the ${to} output.` });
}

function render(parsed: Parsed, to: Format): string {
  if (to === 'curl') return parsed.requests.map(renderCurl).join('\n\n');
  if (to === 'bruno') return parsed.requests.map(renderBruno).join('\n\n--- next .bru file ---\n\n');
  if (to === 'openapi') return renderOpenApi(parsed);
  if (to === 'postman') return renderPostman(parsed);
  return renderInsomnia(parsed);
}

function renderBruno(request: Request, index: number): string {
  const authKind = request.auth?.kind ?? 'none';
  let text = `meta {\n  name: ${request.name}\n  type: http\n  seq: ${index + 1}\n}\n\n${request.method.toLowerCase()} {\n  url: ${withQuery(request)}\n  body: ${request.body ? 'json' : 'none'}\n  auth: ${authKind}\n}`;
  if (Object.keys(request.headers).length) text += `\n\nheaders {\n${keyValueLines(request.headers)}\n}`;
  if (request.auth) text += `\n\nauth:${authKind} {\n${keyValueLines(request.auth.fields)}\n}`;
  if (request.body) text += `\n\nbody:json {\n${request.body}\n}`;
  for (const script of request.scripts) text += `\n\ntests {\n${script}\n}`;
  return text;
}

function renderCurl(request: Request): string {
  const parts = ['curl', '--request', quote(request.method)];
  for (const [key, value] of Object.entries(request.headers)) parts.push('--header', quote(`${key}: ${value}`));
  if (request.auth?.kind === 'basic') parts.push('--user', quote(`${request.auth.fields.username ?? ''}:${request.auth.fields.password ?? ''}`));
  else if (request.auth?.kind === 'bearer') parts.push('--header', quote(`Authorization: Bearer ${request.auth.fields.token ?? ''}`));
  else if (request.auth?.kind === 'apikey') parts.push('--header', quote(`${request.auth.fields.key ?? 'X-API-Key'}: ${request.auth.fields.value ?? ''}`));
  if (request.body) parts.push('--data-raw', quote(request.body));
  parts.push(quote(withQuery(request)));
  return parts.join(' ');
}

function renderOpenApi(parsed: Parsed): string {
  const paths: any = {};
  const securitySchemes: any = {};
  parsed.requests.forEach((request, index) => {
    const path = operationPath(request.url);
    paths[path] ??= {};
    const operation: any = { summary: request.name, parameters: [...request.query.map(pair => ({ in: 'query', name: pair.name, schema: { type: 'string', default: pair.value } })), ...Object.entries(request.headers).map(([name, value]) => ({ in: 'header', name, schema: { type: 'string', default: value } }))], responses: {} };
    if (request.body) operation.requestBody = { content: { 'application/json': { example: safeJson(request.body) } } };
    if (request.examples.length) for (const example of request.examples) operation.responses[String(example.status)] = { description: example.name, content: { 'application/json': { example: safeJson(example.body) } } };
    else operation.responses['200'] = { description: 'Imported response' };
    if (request.auth) { const name = `bridge_${slug(request.auth.kind)}_${index + 1}`; securitySchemes[name] = openApiScheme(request.auth); operation.security = [{ [name]: [] }]; operation['x-bridge-auth-fields'] = request.auth.fields; }
    paths[path][request.method.toLowerCase()] = operation;
  });
  const servers = parsed.environments.map(environment => ({ url: environment.base_url ?? '{{base_url}}', variables: Object.fromEntries(Object.entries(environment).filter(([key]) => key !== 'base_url').map(([key, value]) => [key, { default: value }])) }));
  return JSON.stringify({ openapi: '3.1.0', info: { title: parsed.name, version: '1.0.0' }, servers, paths, components: { securitySchemes } }, null, 2);
}

function openApiScheme(auth: Auth): any {
  if (auth.kind === 'apikey') return { type: 'apiKey', name: auth.fields.key ?? 'X-API-Key', in: auth.fields.in ?? 'header' };
  if (auth.kind === 'oauth2') return { type: 'oauth2', flows: { clientCredentials: { tokenUrl: auth.fields.accessTokenUrl ?? 'https://id.example.test/token', scopes: {} } } };
  return { type: 'http', scheme: auth.kind === 'basic' ? 'basic' : 'bearer' };
}

function renderPostman(parsed: Parsed): string {
  return JSON.stringify({ info: { name: parsed.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: parsed.requests.map(request => ({ name: request.name, event: request.scripts.map(code => ({ listen: 'test', script: { type: 'text/javascript', exec: code.split('\n') } })), request: { method: request.method, header: Object.entries(request.headers).map(([key, value]) => ({ key, value })), url: { raw: withQuery(request), query: request.query.map(pair => ({ key: pair.name, value: pair.value })) }, auth: request.auth ? { type: request.auth.kind, [request.auth.kind]: Object.entries(request.auth.fields).map(([key, value]) => ({ key, value, type: 'string' })) } : { type: 'noauth' }, ...(request.body ? { body: { mode: 'raw', raw: request.body } } : {}) }, response: request.examples.map(example => ({ name: example.name, code: example.status, body: example.body })) })), variable: Object.entries(parsed.environments[0] ?? {}).map(([key, value]) => ({ key, value })) }, null, 2);
}

function renderInsomnia(parsed: Parsed): string {
  return JSON.stringify({ _type: 'export', __export_format: 4, resources: [{ _id: 'wrk_bridge', _type: 'workspace', name: parsed.name }, ...parsed.requests.map((request, index) => ({ _id: `req_${index + 1}`, _type: 'request', parentId: 'wrk_bridge', name: request.name, method: request.method, url: request.url, headers: Object.entries(request.headers).map(([name, value]) => ({ name, value })), parameters: request.query, authentication: request.auth ? { type: request.auth.kind, ...request.auth.fields } : { type: 'none' }, body: request.body ? { mimeType: 'application/json', text: request.body } : {} })), ...parsed.environments.map((environment, index) => ({ _id: `env_${index + 1}`, _type: 'environment', parentId: 'wrk_bridge', name: `Environment ${index + 1}`, data: environment }))] }, null, 2);
}

function firstExample(content: any): any { const media = content && Object.values(content)[0] as any; return media?.example ?? media?.examples?.default?.value; }
function operationPath(url: string): string { try { return new URL(url).pathname; } catch { return (url.replace(/^{{[^}]+}}/, '') || '/').replaceAll(/{{([^}]+)}}/g, '{$1}'); } }
function withQuery(request: Request): string { if (!request.query.length || request.url.includes('?')) return request.url; return `${request.url}?${request.query.map(pair => `${pair.name}=${pair.value}`).join('&')}`; }
function valueText(value: any): string { return typeof value === 'string' ? value : JSON.stringify(value); }
function safeJson(value: string): any { try { return JSON.parse(value); } catch { return value; } }
function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
function keyValueLines(values: Record<string, string>): string { return Object.entries(values).map(([key, value]) => `  ${key}: ${value}`).join('\n'); }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function secretKey(key: string): boolean { return /authorization|api[-_]?key|token|secret|password|cookie/i.test(key); }
function authSecret(kind: string, key: string): boolean { return secretKey(key) || (kind === 'apikey' && key === 'value') || (kind.includes('oauth') && /accessToken|refreshToken|clientSecret/i.test(key)); }
