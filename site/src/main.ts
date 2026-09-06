import './style.css';
import { convertDemo, samples, type DemoResult, type Format } from './demo';
import { initializeLicense, restoreLicense } from './license';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const isDemo = location.pathname.replace(/\/+$/, '') === '/demo';
let latest: DemoResult | null = null;

document.querySelector<HTMLAnchorElement>('.skip-link')?.addEventListener('click', event => {
  const main = byId<HTMLElement>('main');
  if (!main) return;
  event.preventDefault();
  main.focus();
  history.replaceState({}, '', `${location.pathname}${location.search}#main`);
});

document.querySelectorAll<HTMLElement>('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const target = document.getElementById(button.dataset.copy ?? '');
  if (!target) return;
  await navigator.clipboard.writeText(target.textContent ?? '');
  const prior = button.textContent;
  button.textContent = 'Copied';
  window.setTimeout(() => { button.textContent = prior; }, 1400);
}));

const sourceFormat = byId<HTMLSelectElement>('source-format');
const targetFormat = byId<HTMLSelectElement>('target-format');
const sourceInput = byId<HTMLTextAreaElement>('source-input');
if (sourceFormat && targetFormat && sourceInput) {
  const sourceError = byId<HTMLElement>('source-error')!;
  const resultBox = byId<HTMLElement>('conversion-result')!;
  const emptyResult = byId<HTMLElement>('empty-result')!;
  const runConversion = (moveFocus = false) => {
    sourceError.textContent = '';
    try {
      latest = convertDemo(sourceInput.value, sourceFormat.value as Exclude<Format, 'bruno'>, targetFormat.value as Format);
      emptyResult.hidden = true;
      resultBox.hidden = false;
      const totals = { preserved: 0, transformed: 0, unsupported: 0 };
      latest.findings.forEach(finding => totals[finding.status]++);
      byId('evidence-summary')!.innerHTML = `<strong>${latest.requests} request${latest.requests === 1 ? '' : 's'}</strong><span>✓ ${totals.preserved} preserved</span><span>↻ ${totals.transformed} transformed</span><span>× ${totals.unsupported} unsupported</span>`;
      byId('finding-list')!.innerHTML = latest.findings.map(finding => `<li class="${finding.status}"><strong>${finding.status === 'preserved' ? '✓ preserved' : finding.status === 'transformed' ? '↻ transformed' : '× unsupported'} · ${escapeHtml(finding.feature)}</strong><span>${escapeHtml(finding.detail)}</span></li>`).join('');
      byId('output-preview')!.textContent = latest.output;
      if (moveFocus) {
        resultBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
        resultBox.focus();
      }
    } catch (error) {
      sourceError.textContent = error instanceof Error ? error.message : 'Conversion failed. Check the source and try again.';
      sourceInput.focus();
    }
  };
  const resetDemo = (moveFocus = true) => {
    sourceFormat.value = 'openapi';
    targetFormat.value = 'bruno';
    sourceInput.value = samples.openapi;
    sourceError.textContent = '';
    runConversion();
    if (moveFocus) byId<HTMLElement>('demo-title')?.focus();
  };
  sourceInput.value = samples.openapi;
  sourceFormat.addEventListener('change', () => { sourceInput.value = samples[sourceFormat.value as keyof typeof samples]; sourceError.textContent = ''; });
  byId<HTMLInputElement>('source-file')?.addEventListener('change', async event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (file) { sourceInput.value = await file.text(); sourceInput.focus(); }
  });
  byId('convert-button')?.addEventListener('click', () => runConversion(true));
  byId('reset-demo')?.addEventListener('click', () => resetDemo());
  byId('download-output')?.addEventListener('click', () => {
    if (!latest) return;
    const url = URL.createObjectURL(new Blob([latest.output], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bridge-export.${latest.extension}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url));
  });
  if (isDemo) resetDemo(false);
}

const offlineNote = byId<HTMLElement>('offline-note');
if (offlineNote) {
  const updateOnline = () => { offlineNote.hidden = navigator.onLine; };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();
}

const buyLink = byId<HTMLAnchorElement>('buy-link');
if (buyLink && !isDemo) {
  const billingBase = (import.meta.env.VITE_BILLING_BASE_URL as string | undefined) ?? 'https://api.sociobot.in/api/v1';
  buyLink.href = `${billingBase}/products/openapi-collection-bridge/checkout`;
  const applyLicense = (state: { unlocked: boolean; message: string; offline?: boolean }) => {
    byId('license-status')!.textContent = state.message;
    byId<HTMLElement>('pro-tools')!.hidden = !state.unlocked;
    buyLink.hidden = state.unlocked;
    byId('license-error')!.textContent = state.offline ? 'The free tools remain available. Reconnect to verify this license.' : (!state.unlocked && state.message.includes('active') ? 'Paste another license or buy a new one.' : '');
  };
  void initializeLicense(applyLicense);
  byId<HTMLFormElement>('license-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = byId<HTMLInputElement>('license-input')!;
    if (!input.value.trim()) return;
    const button = (event.currentTarget as HTMLFormElement).querySelector('button')!;
    button.disabled = true;
    await restoreLicense(input.value, applyLicense);
    button.disabled = false;
  });
  byId('make-plan')?.addEventListener('click', () => {
    const count = Math.max(1, Math.min(500, Number(byId<HTMLInputElement>('collection-count')!.value) || 1));
    byId('plan-output')!.textContent = migrationPlan(count);
  });
  byId('download-ci')?.addEventListener('click', () => downloadText('ocb-migration-check.yml', ciPolicyTemplate));
  byId('copy-ci')?.addEventListener('click', async () => { await navigator.clipboard.writeText(ciPolicyTemplate); byId('ci-status')!.textContent = 'CI policy copied.'; });
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));

export const ciPolicyTemplate = `name: Check API migration\n\non:\n  pull_request:\n    paths:\n      - 'api/**'\n\njobs:\n  bridge:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install OpenAPI Collection Bridge\n        run: cargo install --git https://github.com/B-Divyesh/sf-openapi-collection-bridge --locked\n      - name: Fail on unsupported semantics\n        run: ocb convert api/source.json --to openapi --output api/generated.json --fail-on-loss --json\n`;

function migrationPlan(count: number): string { return `# Migration checklist for ${count} collection${count === 1 ? '' : 's'}\n\n1. Inventory: ocb inspect SOURCE --json\n2. Convert into a disposable destination workspace\n3. Review every transformed and unsupported evidence row\n4. Add --fail-on-loss to the CI check\n5. Compare request and environment counts\n6. Replace the old collection only after review`; }
function downloadText(name: string, contents: string): void { const url = URL.createObjectURL(new Blob([contents], { type: 'text/yaml' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url)); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]!)); }
