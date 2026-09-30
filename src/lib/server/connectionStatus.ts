/**
 * Server-only: reads the DrChrono connection-status file written by the
 * ingestion-service (`scripts/check_access.py`). Used to explain, in the UI,
 * why a live institution has no data (e.g. missing DrChrono permissions).
 *
 * Path comes from COHORT_STATUS_PATH; returns null if unset/missing/unreadable.
 */
import { readFileSync, existsSync } from 'node:fs';

export type PermissionItem = { key: string; label: string };

export type ConnectionStatus = {
  hospital_id?: string;
  status: 'ok' | 'permission_denied' | 'not_connected' | 'error';
  checked_at?: string;
  authorized_user?: string | null;
  is_doctor?: boolean | null;
  message: string;
  missing_permissions: PermissionItem[];
  required_permissions: PermissionItem[];
  oauth_scopes_ok?: string[];
  detail?: string;
};

export function liveConnectionStatus(): ConnectionStatus | null {
  const path = process.env.COHORT_STATUS_PATH;
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ConnectionStatus;
  } catch {
    return null;
  }
}
