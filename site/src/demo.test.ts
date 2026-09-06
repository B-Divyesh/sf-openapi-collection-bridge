import { describe, expect, it } from 'vitest';
import { convertDemo, samples } from './demo';

describe('local demo bridge', () => {
  it('keeps OpenAPI auth and required headers while reporting unsupported examples', () => {
    const result = convertDemo(samples.openapi, 'openapi', 'bruno');
    expect(result.requests).toBe(3);
    expect(result.output).toContain('auth: apikey');
    expect(result.output).toContain('key: X-API-Key');
    expect(result.output).toContain('value: {{bridge_secret_x_api_key}}');
    expect(result.output).toContain('X-Trace: trace-demo-104');
    expect(result.findings).toContainEqual(expect.objectContaining({ status: 'unsupported', feature: '1 response example' }));
  });

  it('strips credentials from Postman output', () => {
    const result = convertDemo(samples.postman, 'postman', 'curl');
    expect(result.output).not.toContain('demo-api-secret');
    expect(result.output).toContain('bridge_secret_value');
  });

  it('keeps response examples when the destination supports them', () => {
    const result = convertDemo(samples.openapi, 'openapi', 'postman');
    const output = JSON.parse(result.output);
    expect(output.item[0].response[0].code).toBe(200);
    expect(output.item[0].response[0].body).toContain('par_104');
  });

  it('explains empty and malformed input and then accepts valid input', () => {
    expect(() => convertDemo('', 'curl', 'openapi')).toThrow(/Paste source/);
    expect(() => convertDemo('{', 'openapi', 'bruno')).toThrow(/accepts JSON/);
    expect(convertDemo(samples.openapi, 'openapi', 'bruno').requests).toBe(3);
  });
});
