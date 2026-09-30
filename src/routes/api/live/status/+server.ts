import { json } from '@sveltejs/kit';
import { liveConnectionStatus } from '$lib/server/connectionStatus';
import type { RequestHandler } from './$types';

// Returns the DrChrono connection status for the live institution (no PHI).
// Gated behind the same unlock cookie as the patient data.
export const GET: RequestHandler = async ({ cookies }) => {
  if (!cookies.get('live_auth')) {
    return json({ connection: null });
  }
  return json({ connection: liveConnectionStatus() });
};
