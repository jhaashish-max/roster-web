/**
 * Shared roster status vocabulary — the SAME file is used by the Cloudflare
 * worker (src/lib/status.js) and the React app (src/lib/status.js).
 * Pure ESM, no dependencies. Keep the two copies byte-identical.
 *
 * A "status" is the free-text value stored in roster.status. Historically it
 * was typed by hand which produced 20+ spellings of the same shift. This module
 * turns any spelling into ONE canonical value and classifies it.
 *
 *   normalizeStatus('10:00-7:00')  -> { value: '10:00 - 19:00', kind: 'shift' }
 *   normalizeStatus(' pl ')        -> { value: 'PL',            kind: 'pl' }
 *   normalizeStatus('-')           -> { value: '',              kind: 'empty' }   // = delete the cell
 *   normalizeStatus('Sick')        -> { value: 'Sick',          kind: 'other' }   // unknown text is kept as-is
 */

export const STATUS_KINDS = Object.freeze([
  'shift', 'oncall', 'wo', 'pl', 'sl', 'ul', 'wl', 'wfh', 'oh', 'holiday',
  'available', 'exit', 'na', 'empty', 'other',
]);

/** Canonical fixed codes. Keys are UPPERCASE spellings, values are canonical. */
const CODE_ALIASES = Object.freeze({
  'WO': 'WO', 'WEEK OFF': 'WO', 'WEEKOFF': 'WO', 'OFF': 'WO', 'W/O': 'WO',
  'PL': 'PL', 'PLANNED LEAVE': 'PL', 'LEAVE': 'PL', 'CL': 'PL', 'EL': 'PL',
  'SL': 'SL', 'SICK LEAVE': 'SL', 'SICK': 'SL',
  'UL': 'UL', 'UNPAID LEAVE': 'UL', 'LOP': 'UL',
  'WL': 'WL', 'WELLNESS': 'WL', 'WELLNESS LEAVE': 'WL',
  'WFH': 'WFH', 'WORK FROM HOME': 'WFH',
  'OH': 'OH', 'OPTIONAL HOLIDAY': 'OH',
  'HL': 'Holiday', 'HOLIDAY': 'Holiday', 'PUBLIC HOLIDAY': 'Holiday', 'PH': 'Holiday',
  'ON CALL': 'On Call', 'ONCALL': 'On Call', 'ON-CALL': 'On Call', 'OC': 'On Call',
  'AVAILABLE': 'Available', 'AVL': 'Available',
  'EXIT': 'Exit', 'EXITED': 'Exit', 'LEFT': 'Exit', 'RESIGNED': 'Exit',
  'NA': 'NA', 'N/A': 'NA', 'NOT APPLICABLE': 'NA',
});

const CODE_KIND = Object.freeze({
  'WO': 'wo', 'PL': 'pl', 'SL': 'sl', 'UL': 'ul', 'WL': 'wl', 'WFH': 'wfh', 'OH': 'oh',
  'Holiday': 'holiday', 'On Call': 'oncall', 'Available': 'available', 'Exit': 'exit', 'NA': 'na',
});

/** Codes that mean "this person is NOT part of the day's headcount". */
export const NON_HEADCOUNT_KINDS = Object.freeze(['exit', 'na', 'empty']);

/** Kinds that count as "present / working" for headcount purposes. */
export const PRESENT_KINDS = Object.freeze(['shift', 'oncall', 'wfh', 'available']);

/** Kinds that are leaves (planned or unplanned). */
export const LEAVE_KINDS = Object.freeze(['pl', 'sl', 'ul', 'wl', 'oh']);

const EMPTY_VALUES = new Set(['', '-', '–', '—', 'X', 'NONE', 'NULL', 'EMPTY']);

// "9-6", "09:00 - 18:00", "10:00-7:00", "10.00 to 19.00", "18:00 – 03:00", "10:00 - 2100"
const TIME_RANGE_RE = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.]?(\d{2}))?$/i;

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Parse any time-range spelling into { startH, startM, endH, endM } (24h) or null.
 * Ambiguity rule for "small" end hours: "10:00 - 7:00" means 10am–7pm, so when the
 * end hour is smaller than the start hour AND the start is before noon, the end is PM.
 * Overnight shifts starting at/after noon ("18:00 - 03:00", "23:00 - 08:00") are kept.
 */
export function parseTimeRange(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(TIME_RANGE_RE);
  if (!m) return null;
  let startH = parseInt(m[1], 10);
  const startM = m[2] ? parseInt(m[2], 10) : 0;
  let endH = parseInt(m[3], 10);
  const endM = m[4] ? parseInt(m[4], 10) : 0;
  if ([startH, endH].some((h) => Number.isNaN(h) || h > 24) || startM > 59 || endM > 59) return null;
  if (startH === 24) startH = 0;
  if (endH === 24) endH = 0;
  // "10-10" / "9-9" (12h shifts written as same digit) → treat end as PM.
  if (endH <= startH && startH < 12 && endH <= 12) endH += 12;
  if (endH === 24) endH = 0;
  return { startH, startM, endH, endM };
}

export function formatTimeRange({ startH, startM, endH, endM }) {
  return `${pad2(startH)}:${pad2(startM)} - ${pad2(endH)}:${pad2(endM)}`;
}

/** Classify a parsed shift by its start hour. */
export function shiftPeriod(startH) {
  if (startH >= 6 && startH < 11) return 'morning';
  if (startH >= 11 && startH < 18) return 'afternoon';
  return 'night'; // 18:00–05:59
}

/**
 * Normalize any raw status.
 * @param {string|null|undefined} raw
 * @param {{ weekend?: boolean }} [opts] weekend=true lets a 07:00 start count as on-call (legacy rule)
 * @returns {{ value: string, kind: string, period?: 'morning'|'afternoon'|'night', startH?: number }}
 */
export function normalizeStatus(raw, opts = {}) {
  const text = (raw == null ? '' : String(raw)).replace(/\s+/g, ' ').trim();
  const upper = text.toUpperCase();
  if (EMPTY_VALUES.has(upper)) return { value: '', kind: 'empty' };

  if (Object.prototype.hasOwnProperty.call(CODE_ALIASES, upper)) {
    const value = CODE_ALIASES[upper];
    return { value, kind: CODE_KIND[value] };
  }

  const range = parseTimeRange(text);
  if (range) {
    const value = formatTimeRange(range);
    const period = shiftPeriod(range.startH);
    // Legacy on-call conventions: the 10:00 - 22:00 stretch, or a 07:00 start on a weekend.
    if (value === '10:00 - 22:00' || (opts.weekend && range.startH === 7)) {
      return { value, kind: 'oncall', period, startH: range.startH };
    }
    return { value, kind: 'shift', period, startH: range.startH };
  }

  if (upper.includes('NIGHT')) return { value: text, kind: 'shift', period: 'night', startH: 18 };
  if (upper.includes('HOLIDAY')) return { value: 'Holiday', kind: 'holiday' };
  if (upper.includes('ON CALL') || upper.includes('ONCALL')) return { value: 'On Call', kind: 'oncall' };

  return { value: text, kind: 'other' };
}

/** Convenience: canonical stored value (empty string means "no cell"). */
export function canonicalStatus(raw, opts) {
  return normalizeStatus(raw, opts).value;
}

/** Convenience: kind only. */
export function statusKind(raw, opts) {
  return normalizeStatus(raw, opts).kind;
}

export function isWorkingStatus(raw, opts) {
  return PRESENT_KINDS.includes(statusKind(raw, opts));
}

export function isLeaveStatus(raw, opts) {
  return LEAVE_KINDS.includes(statusKind(raw, opts));
}

export function isHeadcountStatus(raw, opts) {
  return !NON_HEADCOUNT_KINDS.includes(statusKind(raw, opts));
}

/** Statuses offered in pickers, in display order. Team shifts are prepended by callers. */
export const QUICK_STATUSES = Object.freeze([
  { value: 'WO', label: 'WO · Week off' },
  { value: 'PL', label: 'PL · Planned leave' },
  { value: 'WL', label: 'WL · Wellness leave' },
  { value: 'SL', label: 'SL · Sick leave' },
  { value: 'WFH', label: 'WFH · Work from home' },
  { value: 'OH', label: 'OH · Optional holiday' },
  { value: 'Holiday', label: 'Holiday' },
  { value: 'On Call', label: 'On Call' },
  { value: 'Exit', label: 'Exit · Left the team' },
]);

export const COMMON_SHIFTS = Object.freeze([
  '07:00 - 16:00', '08:00 - 17:00', '09:00 - 18:00', '10:00 - 19:00', '11:00 - 20:00',
  '12:00 - 21:00', '10:00 - 22:00', '18:00 - 03:00', '23:00 - 08:00',
]);
