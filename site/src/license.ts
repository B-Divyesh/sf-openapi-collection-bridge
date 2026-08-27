export const LICENSE_KEY = 'sb_license:openapi-collection-bridge';
const VERDICT_KEY = `${LICENSE_KEY}:verdict`;
const DAY = 86_400_000;
export type LicenseState = { unlocked: boolean; message: string; offline?: boolean };

export async function initializeLicense(onState: (state: LicenseState) => void): Promise<void> {
  const url = new URL(location.href);
  const returned = url.searchParams.get('license');
  if (returned) { localStorage.setItem(LICENSE_KEY, returned); url.searchParams.delete('license'); history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`); }
  const token = returned ?? localStorage.getItem(LICENSE_KEY);
  if (!token) { onState({ unlocked: false, message: 'Free edition · all core conversion enabled' }); return; }
  const cached = readVerdict();
  if (cached?.valid) onState({ unlocked: true, message: 'Pro migration kit unlocked' });
  if (returned) { await verifyLicense(token, onState); return; }
  if (cached && Date.now() - cached.checkedAt < DAY) { if (!cached.valid) onState({ unlocked: false, message: 'License no longer active' }); return; }
  await verifyLicense(token, onState);
}

export async function restoreLicense(token: string, onState: (state: LicenseState) => void): Promise<void> {
  localStorage.setItem(LICENSE_KEY, token.trim());
  await verifyLicense(token.trim(), onState);
}

async function verifyLicense(token: string, onState: (state: LicenseState) => void): Promise<void> {
  const base = (import.meta.env.VITE_BILLING_BASE_URL as string | undefined) ?? 'https://pilot-api.sociobot.in/api/v1';
  try {
    const response = await fetch(`${base}/products/openapi-collection-bridge/verify?license=${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error(`verification returned ${response.status}`);
    const data = await response.json() as { valid: boolean; reason: string };
    localStorage.setItem(VERDICT_KEY, JSON.stringify({ valid: data.valid, checkedAt: Date.now() }));
    onState({ unlocked: data.valid, message: data.valid ? 'Pro migration kit unlocked' : 'License no longer active' });
  } catch {
    const cached = readVerdict();
    onState({ unlocked: cached?.valid ?? false, message: cached?.valid ? 'Pro unlocked · verification will retry online' : 'Could not verify while offline', offline: true });
  }
}

function readVerdict(): { valid: boolean; checkedAt: number } | null { try { return JSON.parse(localStorage.getItem(VERDICT_KEY) ?? 'null'); } catch { return null; } }
