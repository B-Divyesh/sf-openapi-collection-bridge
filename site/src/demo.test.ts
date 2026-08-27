import { describe, expect, it } from 'vitest';
import { convertDemo, samples } from './demo';

describe('local demo bridge', () => {
  it('converts OpenAPI operations to Bruno', () => { const result = convertDemo(samples.openapi, 'openapi', 'bruno'); expect(result.requests).toBe(2); expect(result.output).toContain('get {'); });
  it('strips credentials from Postman', () => { const result = convertDemo(samples.postman, 'postman', 'curl'); expect(result.output).not.toContain('demo-secret'); expect(result.output).toContain('bridge_secret_authorization'); });
  it('explains empty and malformed input', () => { expect(() => convertDemo('', 'curl', 'openapi')).toThrow(/Paste source/); expect(() => convertDemo('{', 'openapi', 'bruno')).toThrow(/accepts JSON/); });
});
