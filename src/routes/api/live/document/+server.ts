import { json, error } from '@sveltejs/kit';
import { liveDocument } from '$lib/server/liveDb';
import { LIVE_HOSPITAL_ID } from '$lib/hospitals';
import type { RequestHandler } from './$types';

// Raw source document for a live patient (PHI). Gated on the live_auth cookie
// (same gate as /api/live/patients); the UI only surfaces the link behind the
// IRB toggle. Returns text for text documents, metadata-only for binary/scanned.
export const GET: RequestHandler = async ({ cookies, url }) => {
  if (!cookies.get('live_auth')) {
    throw error(401, 'Locked — unlock the institution first');
  }
  const patientId = url.searchParams.get('patientId');
  const docId = url.searchParams.get('docId');
  if (!patientId || !docId) {
    throw error(400, 'patientId and docId are required');
  }
  const hospitalId = url.searchParams.get('hospitalId') || LIVE_HOSPITAL_ID;
  const doc = liveDocument(hospitalId, patientId, docId);
  if (!doc.found) {
    throw error(404, 'Document not found');
  }
  return json(doc);
};
