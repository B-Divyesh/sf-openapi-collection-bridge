import './style.css';
import { convertDemo, samples, type DemoResult, type Format } from './demo';
import { initializeLicense, restoreLicense } from './license';

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const sourceFormat = $('#source-format') as HTMLSelectElement;
const targetFormat = $('#target-format') as HTMLSelectElement;
const sourceInput = $('#source-input') as HTMLTextAreaElement;
const sourceError = $('#source-error');
const resultBox = $('#conversion-result');
const emptyResult = $('#empty-result');
let latest: DemoResult | null = null;

const billingBase = (import.meta.env.VITE_BILLING_BASE_URL as string | undefined) ?? 'https://pilot-api.sociobot.in/api/v1';
($('#buy-link') as HTMLAnchorElement).href = `${billingBase}/products/openapi-collection-bridge/checkout`;

sourceInput.value = samples.openapi;
sourceFormat.addEventListener('change', () => { sourceInput.value = samples[sourceFormat.value as keyof typeof samples]; sourceError.textContent = ''; });
$('#source-file').addEventListener('change', async event => { const file = (event.currentTarget as HTMLInputElement).files?.[0]; if (file) { sourceInput.value = await file.text(); sourceInput.focus(); } });
$('#convert-button').addEventListener('click', () => {
  sourceError.textContent = '';
  try {
    latest = convertDemo(sourceInput.value, sourceFormat.value as Exclude<Format, 'bruno'>, targetFormat.value as Format);
    emptyResult.hidden = true; resultBox.hidden = false;
    const totals = { preserved: 0, transformed: 0, unsupported: 0 }; latest.findings.forEach(f => totals[f.status]++);
    $('#evidence-summary').innerHTML = `<strong>${latest.requests} request${latest.requests === 1 ? '' : 's'}</strong><span>✓ ${totals.preserved} preserved</span><span>↻ ${totals.transformed} transformed</span><span>× ${totals.unsupported} unsupported</span>`;
    $('#finding-list').innerHTML = latest.findings.map(f => `<li class="${f.status}"><strong>${f.status === 'preserved' ? '✓' : f.status === 'transformed' ? '↻' : '×'} ${escapeHtml(f.feature)}</strong><span>${escapeHtml(f.detail)}</span></li>`).join('');
    $('#output-preview').textContent = latest.output;
    resultBox.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  } catch (error) { sourceError.textContent = error instanceof Error ? error.message : 'Conversion failed. Check the source and try again.'; sourceInput.focus(); }
});
$('#download-output').addEventListener('click', () => { if (!latest) return; const url = URL.createObjectURL(new Blob([latest.output], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = `bridge-export.${latest.extension}`; a.click(); URL.revokeObjectURL(url); });
document.querySelectorAll<HTMLElement>('[data-copy]').forEach(button => button.addEventListener('click', async () => { const target = document.getElementById(button.dataset.copy!)!; await navigator.clipboard.writeText(target.textContent ?? ''); const prior = button.textContent; button.textContent = 'Copied'; setTimeout(() => button.textContent = prior, 1400); }));

const offlineNote = $('#offline-note');
const updateOnline = () => { offlineNote.hidden = navigator.onLine; };
window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); updateOnline();

const applyLicense = (state: { unlocked: boolean; message: string; offline?: boolean }) => { $('#license-status').textContent = state.message; $('#pro-tools').hidden = !state.unlocked; $('#buy-link').hidden = state.unlocked; $('#license-error').textContent = state.offline ? 'The free tools remain available. Reconnect to verify this license.' : (!state.unlocked && state.message.includes('active') ? 'Paste another license or purchase a new one.' : ''); };
void initializeLicense(applyLicense);
$('#license-form').addEventListener('submit', async event => { event.preventDefault(); const input = $('#license-input') as HTMLInputElement; if (!input.value.trim()) return; ($('#license-form button') as HTMLButtonElement).disabled = true; await restoreLicense(input.value, applyLicense); ($('#license-form button') as HTMLButtonElement).disabled = false; });
$('#make-plan').addEventListener('click', () => { const count = Number(($('#collection-count') as HTMLInputElement).value); $('#plan-output').textContent = `# Migration checklist for ${count} collection${count === 1 ? '' : 's'}\n\n1. Inventory: ocb inspect SOURCE --json\n2. Dry run: ocb convert SOURCE --to TARGET --output OUT\n3. Review every × unsupported evidence row\n4. Enforce: repeat with --fail-on-loss in CI\n5. Import into a disposable destination workspace\n6. Compare request and environment counts before cutover`; });

if ('serviceWorker' in navigator) window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]!)); }
