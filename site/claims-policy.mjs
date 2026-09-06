import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const claims = JSON.parse(readFileSync(resolve(root, '.factory/claims.json'), 'utf8'));
const tests = readFileSync(resolve(root, 'claims/claims.test.mjs'), 'utf8');
const tags = [...tests.matchAll(/it\(['"]@claim:([a-z0-9-]+)/g)].map(match => match[1]);
const counts = new Map(tags.map(id => [id, tags.filter(candidate => candidate === id).length]));
for (const claim of claims) {
  if (counts.get(claim.id) !== 1) throw new Error(`Claim ${claim.id} must have exactly one outcome test`);
  if (!claim.test.includes(`@claim:${claim.id}`)) throw new Error(`Claim ${claim.id} command does not select its test`);
}
for (const tag of tags) if (!claims.some(claim => claim.id === tag)) throw new Error(`Test @claim:${tag} is not registered`);
if (new Set(claims.map(claim => claim.id)).size !== claims.length) throw new Error('Claim IDs must be unique');
console.log(`${claims.length} public claims map one-to-one to outcome tests.`);
