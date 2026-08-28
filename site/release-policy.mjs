import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'public');
const headers = readFileSync(resolve(root, '_headers'), 'utf8');
const css = readFileSync(resolve(import.meta.dirname, 'src/style.css'), 'utf8');
const requirements = [
  ["Content-Security-Policy: default-src 'self'", 'restrictive CSP'],
  ['Permissions-Policy:', 'Permissions Policy'],
  ['/assets/*\n  Cache-Control: public, max-age=31536000, immutable', 'immutable hashed asset caching'],
  ['/sw.js\n  Cache-Control: public, max-age=0, must-revalidate', 'service-worker revalidation'],
];
for (const [needle, label] of requirements) {
  if (!headers.includes(needle)) throw new Error(`Missing ${label} policy`);
}
if (!css.includes('footer a { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px;')) {
  throw new Error('Footer link 44px touch-target rule is missing');
}
console.log('Static release policy checks passed.');
