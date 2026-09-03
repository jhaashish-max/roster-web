/**
 * Date helpers that never go through `new Date('YYYY-MM-DD')` (which is parsed as UTC
 * and shifts a day in IST). All ISO strings here are local calendar dates.
 */

const pad2 = (n) => String(n).padStart(2, '0');

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Date → 'YYYY-MM-DD' in local time. */
export function toISODate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → local Date (midnight). Returns null when malformed. */
export function parseISODate(s) {
    if (typeof s !== 'string') return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function isValidISODate(s) {
    const d = parseISODate(s);
    return !!d && toISODate(d) === s;
}

export function todayISO() {
    return toISODate(new Date());
}

export function addDaysISO(s, n) {
    const d = parseISODate(s);
    d.setDate(d.getDate() + n);
    return toISODate(d);
}

export function daysInMonth(year, month /* 1-12 */) {
    return new Date(year, month, 0).getDate();
}

/** All dates of a month as { iso, date, day, weekday, weekend } objects. */
export function monthDays(year, month) {
    const n = daysInMonth(year, month);
    const out = [];
    for (let day = 1; day <= n; day++) {
        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        out.push({ iso: toISODate(date), date, day, weekday: DAY_SHORT[dow], weekend: dow === 0 || dow === 6 });
    }
    return out;
}

/** All dates between two ISO strings (inclusive). */
export function daysBetween(startISO, endISO) {
    const start = parseISODate(startISO);
    const end = parseISODate(endISO);
    if (!start || !end || start > end) return [];
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        out.push({ iso: toISODate(d), date: new Date(d), day: d.getDate(), weekday: DAY_SHORT[dow], weekend: dow === 0 || dow === 6 });
    }
    return out;
}

export function isWeekendISO(s) {
    const d = parseISODate(s);
    if (!d) return false;
    const dow = d.getDay();
    return dow === 0 || dow === 6;
}

export function monthRangeISO(year, month) {
    return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}` };
}

/** Returns [{year, month}] for every month touched by the range. */
export function monthsInRange(startISO, endISO) {
    const start = parseISODate(startISO);
    const end = parseISODate(endISO);
    if (!start || !end || start > end) return [];
    const out = [];
    let y = start.getFullYear();
    let m = start.getMonth() + 1;
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth() + 1)) {
        out.push({ year: y, month: m });
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

export function monthLabel(year, month) {
    return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function firstOfNextMonthISO(fromISO = todayISO()) {
    const d = parseISODate(fromISO) || new Date();
    return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

export function formatISO(s, style = 'medium') {
    const d = parseISODate(s);
    if (!d) return s || '';
    const dow = DAY_SHORT[d.getDay()];
    const mon = MONTH_NAMES[d.getMonth()].slice(0, 3);
    if (style === 'short') return `${d.getDate()} ${mon}`;
    if (style === 'long') return `${dow}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    return `${dow}, ${mon} ${d.getDate()}`;
}
