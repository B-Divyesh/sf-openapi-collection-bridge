import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'public');
const config = JSON.parse(readFileSync(resolve(root, 'staticwebapp.config.json'), 'utf8'));
const headers = config.globalHeaders ?? {};
if (!headers['Content-Security-Policy']?.includes("default-src 'self'")) throw new Error('Missing restrictive CSP');
if (headers['Content-Security-Policy'].includes('pilot-api.sociobot.in')) throw new Error('Production CSP allows the pilot billing host');
if (!headers['Permissions-Policy']) throw new Error('Missing Permissions Policy');
const route = path => config.routes.find(item => item.route === path);
if (route('/assets/*')?.headers?.['Cache-Control'] !== 'public, max-age=31536000, immutable') throw new Error('Hashed assets are not immutable');
if (route('/sw.js')?.headers?.['Cache-Control'] !== 'public, max-age=0, must-revalidate') throw new Error('Service worker must revalidate');
if (config.responseOverrides?.['404']?.rewrite !== '/404.html' || config.responseOverrides?.['404']?.statusCode !== 404) throw new Error('Designed 404 response is missing');
console.log('Static release policy checks passed.');
