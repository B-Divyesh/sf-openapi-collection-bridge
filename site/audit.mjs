import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const errors = [];
const results = {};

for (const path of ['/', '/demo/', '/privacy/', '/terms/', '/404.html']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') errors.push(`${path}: ${message.text()}`); });
  page.on('pageerror', error => errors.push(`${path}: ${error.message}`));
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  const audit = await new AxeBuilder({ page }).analyze();
  results[path] = audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }));
  const structure = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.title, mains: document.querySelectorAll('main').length, h1s: document.querySelectorAll('h1').length, canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  if (structure.lang !== 'en' || !structure.title || structure.mains !== 1 || structure.h1s !== 1 || !structure.canonical) errors.push(`${path}: required page structure is incomplete`);
  if (structure.overflow) errors.push(`${path}: horizontal overflow at 390px`);
  const undersized = await page.locator('a:visible, button:visible, input:not([type="file"]):visible, select:visible, textarea:visible, summary:visible').evaluateAll(elements => elements.filter(element => { const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44; }).map(element => `${element.textContent?.trim() || element.getAttribute('aria-label') || element.tagName} (${element.getBoundingClientRect().width.toFixed(1)}×${element.getBoundingClientRect().height.toFixed(1)})`));
  if (undersized.length) errors.push(`${path}: controls below 44px: ${undersized.join(', ')}`);
  await page.keyboard.press('Tab');
  if (await page.evaluate(() => document.activeElement?.textContent?.trim()) !== 'Skip to main content') errors.push(`${path}: skip link is not the first keyboard target`);
  await page.keyboard.press('Enter');
  if (await page.evaluate(() => document.activeElement?.id) !== 'main') errors.push(`${path}: skip link did not focus main`);
  if (path === '/demo/') {
    if (!await page.locator('.demo-banner').isVisible()) errors.push('/demo/: demo label is not persistent');
    if (!await page.locator('#conversion-result').isVisible()) errors.push('/demo/: sample result was not populated');
    const output = await page.locator('#output-preview').textContent();
    if (!output?.includes('auth: apikey') || !output.includes('X-Trace')) errors.push('/demo/: populated output lost auth or required headers');
    const findings = await page.locator('#finding-list').textContent();
    if (!findings?.includes('response example') || !findings.includes('unsupported')) errors.push('/demo/: unsupported response example was not reported');
    await page.locator('#source-input').fill('{');
    await page.locator('#convert-button').click();
    if (!await page.locator('#source-error').textContent()) errors.push('/demo/: malformed input did not show an error');
    await page.locator('#reset-demo').click();
    if (!await page.locator('#source-input').inputValue().then(value => value.includes('Parcel operations'))) errors.push('/demo/: reset did not restore the sample');
    if (await page.evaluate(() => localStorage.length) !== 0) errors.push('/demo/: demo touched local storage');
  }
  await context.close();
}

{
  const context = await browser.newContext();
  await context.route('https://api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, reason: 'ok', expires_at: null }) }));
  const page = await context.newPage();
  await page.goto(`${base}/?license=test-license`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).searchParams.has('license')) errors.push('/: returned license remained in the URL');
  if (await page.evaluate(() => localStorage.getItem('sb_license:openapi-collection-bridge')) !== 'test-license') errors.push('/: returned license was not stored');
  if (!await page.locator('#pro-tools').isVisible()) errors.push('/: valid license did not show Pro tools');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${base}/demo/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true));
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (!await page.locator('#offline-note').isVisible()) errors.push('/demo/: offline guidance did not appear');
  if (!await page.locator('#conversion-result').isVisible()) errors.push('/demo/: offline sample result did not render');
  await context.close();
}

await browser.close();
const serious = Object.values(results).flat();
console.log(JSON.stringify({ seriousOrCritical: serious, errors, routes: results }, null, 2));
if (serious.length || errors.length) process.exit(1);
