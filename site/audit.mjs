import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const base = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const consoleErrors = [];
const results = {};

for (const path of ['/', '/privacy/', '/terms/']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(`${path}: ${message.text()}`); });
  page.on('pageerror', error => consoleErrors.push(`${path}: ${error.message}`));
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  const audit = await new AxeBuilder({ page }).analyze();
  results[path] = audit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? '')).map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) consoleErrors.push(`${path}: horizontal overflow at 390px`);
  const undersizedFooterLinks = await page.locator('footer a').evaluateAll(links => links
    .filter(link => link.getBoundingClientRect().height < 44 || link.getBoundingClientRect().width < 44)
    .map(link => `${link.textContent?.trim()} (${link.getBoundingClientRect().width.toFixed(1)}×${link.getBoundingClientRect().height.toFixed(1)})`));
  if (undersizedFooterLinks.length) consoleErrors.push(`${path}: footer links below 44px target: ${undersizedFooterLinks.join(', ')}`);
  if (path === '/') {
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (firstFocus !== 'Skip to main content') consoleErrors.push(`/: first keyboard target was ${firstFocus}`);
    await page.locator('#convert-button').click();
    if (!await page.locator('#conversion-result').isVisible()) consoleErrors.push('/: local conversion result did not appear');
    const resultAudit = await new AxeBuilder({ page }).include('#conversion-result').analyze();
    for (const item of resultAudit.violations.filter(item => ['serious', 'critical'].includes(item.impact ?? ''))) results[path].push({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) });
    await page.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true), undefined, { timeout: 5000 });
    await page.reload({ waitUntil: 'networkidle' });
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))) consoleErrors.push('/: service worker did not control the warmed reload');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!await page.locator('#offline-note').isVisible()) consoleErrors.push('/: offline guidance did not appear');
    await context.setOffline(false);
  }
  await context.close();
}

{
  const context = await browser.newContext();
  await context.route('https://pilot-api.sociobot.in/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: true, reason: 'ok', expires_at: null }) }));
  const page = await context.newPage();
  await page.goto(`${base}/?license=test-license`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).searchParams.has('license')) consoleErrors.push('/: returned license was not stripped from the URL');
  if (await page.evaluate(() => localStorage.getItem('sb_license:openapi-collection-bridge')) !== 'test-license') consoleErrors.push('/: returned license was not stored');
  if (!await page.locator('#pro-tools').isVisible()) consoleErrors.push('/: valid returned license did not unlock Pro tools');
  await context.close();
}

await browser.close();
const serious = Object.values(results).flat();
console.log(JSON.stringify({ seriousOrCritical: serious, consoleErrors, routes: results }, null, 2));
if (serious.length || consoleErrors.length) process.exit(1);
