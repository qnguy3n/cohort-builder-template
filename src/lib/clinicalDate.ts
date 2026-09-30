/**
 * Date helpers for real EHR data, which arrives in mixed formats:
 *   - ISO: "2024-05-28", "2024-05-28T10:00:00Z"
 *   - C-CDA/HL7: "20201201", "20210618113000-0500", "202106"
 * Parsing is forgiving and returns null when a value can't be understood, so the
 * UI can show "—" instead of "Invalid Date".
 */

export function parseClinicalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // ISO-ish — let the engine try first.
  if (/^\d{4}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // HL7/C-CDA: YYYY[MM[DD[HHMMSS]]] with optional ±ZZZZ offset.
  const m = s.match(/^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (m) {
    const [, y, mo = '01', d = '01', hh = '00', mi = '00', ss = '00'] = m;
    const dt = new Date(
      Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss)
    );
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export function fmtDate(value: string | null | undefined): string {
  const d = parseClinicalDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtMonthYear(value: string | null | undefined): string {
  const d = parseClinicalDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

/** Human relative time, e.g. "3 mo ago", "2 yr ago", "today". */
export function relativeTime(value: string | null | undefined, now: Date = new Date()): string {
  const d = parseClinicalDate(value);
  if (!d) return '—';
  const ms = now.getTime() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.round(ms / day);
  if (days <= 0) return 'today';
  if (days < 31) return days === 1 ? '1 d ago' : `${days} d ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) return months <= 1 ? '1 mo ago' : `${months} mo ago`;
  const years = Math.floor(days / 365.25);
  const remMonths = Math.round((days - years * 365.25) / 30.44);
  return remMonths > 0 ? `${years}y ${remMonths}m ago` : `${years} yr ago`;
}
