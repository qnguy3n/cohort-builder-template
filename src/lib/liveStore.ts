/**
 * Client-side coordination for the live (real-EHR) institution:
 * password unlock + loading real patients into the patient store.
 */
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { setLiveSummaries, liveSummaryCount } from '$lib/patients';
import type { PatientSummary } from '$lib/types';

// --- Persisted idle session (survives refresh / navigation) ---
// We persist only the idle DEADLINE (epoch ms). The session is valid while the
// deadline is in the future AND the server cookie is still good. This lets a
// refresh/navigation within the 15-min window restore silently instead of
// re-prompting, while idle expiry / leaving still locks it.
const SESSION_KEY = 'cohort-builder:live-session:v1';
export const LIVE_IDLE_MS = 15 * 60 * 1000;

export function bumpSession(): void {
  if (!browser) return;
  try {
    localStorage.setItem(SESSION_KEY, String(Date.now() + LIVE_IDLE_MS));
  } catch {
    /* ignore */
  }
}
export function clearSession(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
/** Milliseconds left on the idle session, or 0 if none/expired. */
export function sessionRemainingMs(): number {
  if (!browser) return 0;
  try {
    const v = localStorage.getItem(SESSION_KEY);
    if (!v) return 0;
    return Math.max(0, Number(v) - Date.now());
  } catch {
    return 0;
  }
}

/** True once the institution password has been accepted this session. */
export const liveUnlocked = writable<boolean>(false);

/** DrChrono connection status (why there may be no data); null when unknown/ok-unfetched. */
export const liveStatus = writable<ConnectionStatus | null>(null);

export type ConnectionStatus = {
  status: 'ok' | 'permission_denied' | 'not_connected' | 'error';
  message: string;
  authorized_user?: string | null;
  is_doctor?: boolean | null;
  missing_permissions: { key: string; label: string }[];
  required_permissions: { key: string; label: string }[];
  oauth_scopes_ok?: string[];
  checked_at?: string;
};

/** Refresh the DrChrono connection status banner data. */
export async function fetchLiveStatus(): Promise<void> {
  try {
    const r = await fetch('/api/live/status');
    if (!r.ok) return;
    const body = (await r.json()) as { connection: ConnectionStatus | null };
    liveStatus.set(body.connection ?? null);
  } catch {
    /* non-fatal */
  }
}

/** Fetch the real patients and inject them into the patient store. */
export async function loadLivePatients(): Promise<number> {
  const res = await fetch('/api/live/patients');
  if (!res.ok) throw new Error(`load failed: ${res.status}`);
  const body = (await res.json()) as { available: boolean; patients: PatientSummary[] };
  setLiveSummaries(body.patients ?? []);
  await fetchLiveStatus(); // refresh the connection-status banner alongside the data
  return liveSummaryCount();
}

/**
 * Lock the live institution: clear the in-memory patients, the unlock state, the
 * status banner, and the server session cookie. Used on idle timeout and when
 * leaving the institution.
 */
export async function lockLive(): Promise<void> {
  liveUnlocked.set(false);
  liveStatus.set(null);
  clearSession(); // end the persisted idle session
  setLiveSummaries([]); // remove PHI from the client store
  try {
    await fetch('/api/live/unlock', { method: 'DELETE' }); // clear the session cookie
  } catch {
    /* non-fatal */
  }
}

/** Verify the password server-side; on success, load patients + mark unlocked. */
export async function unlockLive(password: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  const res = await fetch('/api/live/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    return { ok: false, error: res.status === 401 ? 'Incorrect password' : `Error ${res.status}` };
  }
  try {
    const count = await loadLivePatients();
    liveUnlocked.set(true);
    bumpSession(); // start the 15-min idle session
    return { ok: true, count };
  } catch (e) {
    return { ok: false, error: 'Unlocked, but failed to load patients' };
  }
}

/**
 * On app load the live institution may still be the active tenant (persisted)
 * while the in-memory patients are gone. If the session cookie is still valid,
 * silently reload; returns true on success.
 */
export async function tryRestoreLive(): Promise<boolean> {
  try {
    await loadLivePatients(); // 401 if the cookie is missing/expired
    liveUnlocked.set(true);
    return true;
  } catch {
    return false;
  }
}
