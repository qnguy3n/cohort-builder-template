import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

// Password that unlocks the live (real-EHR) institution. MUST be supplied via
// LIVE_INSTITUTION_PASSWORD in the environment — there is NO default. If it is
// unset the live (PHI) institution stays locked (fail closed).
const PASSWORD = env.LIVE_INSTITUTION_PASSWORD;
const COOKIE = 'live_auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
  // Fail closed: without a configured password the live institution is unreachable.
  if (!PASSWORD) {
    throw error(503, 'Live institution is not configured');
  }
  const { password } = await request.json().catch(() => ({ password: '' }));
  if (typeof password !== 'string' || password !== PASSWORD) {
    throw error(401, 'Incorrect password');
  }
  cookies.set(COOKIE, '1', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8 // 8h session
  });
  return json({ ok: true });
};

// Lock / sign out of the live institution.
export const DELETE: RequestHandler = async ({ cookies }) => {
  cookies.delete(COOKIE, { path: '/' });
  return json({ ok: true });
};
