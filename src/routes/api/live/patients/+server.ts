import { json, error } from '@sveltejs/kit';
import { listLiveSummaries, isLiveStoreAvailable } from '$lib/server/liveDb';
import { LIVE_HOSPITAL_ID } from '$lib/hospitals';
import type { RequestHandler } from './$types';

// Returns the real patients for the live institution as PatientSummary rows for
// store injection. Requires the live_auth cookie (set by /api/live/unlock).
// PHI (name/MRN) is included once unlocked; the client `irbCleared` toggle still
// controls whether those columns are displayed — matching every other tenant.
export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!cookies.get('live_auth')) {
    throw error(401, 'Locked — unlock the institution first');
  }
  if (!isLiveStoreAvailable()) {
    return json({ available: false, patients: [] });
  }
  const hospitalId = url.searchParams.get('hospitalId') || LIVE_HOSPITAL_ID;
  const patients = listLiveSummaries(hospitalId, /* includePhi */ true);
  return json({ available: true, patients });
};
