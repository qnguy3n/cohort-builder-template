import { json, error } from '@sveltejs/kit';
import { liveFullPatient } from '$lib/server/liveDb';
import { LIVE_HOSPITAL_ID } from '$lib/hospitals';
import type { RequestHandler } from './$types';

// Real clinical detail for a live patient (conditions, meds, procedures, labs,
// allergies, notes, timeline) — all derived from the bundle, never mock. Gated
// on the live_auth cookie; data is read from the de-identified bundle.
export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!cookies.get('live_auth')) {
    throw error(401, 'Locked — unlock the institution first');
  }
  const patientId = url.searchParams.get('patientId');
  if (!patientId) {
    throw error(400, 'patientId is required');
  }
  const hospitalId = url.searchParams.get('hospitalId') || LIVE_HOSPITAL_ID;
  const record = liveFullPatient(hospitalId, patientId);
  if (!record) {
    throw error(404, 'Patient not found in live store');
  }
  return json(record);
};
