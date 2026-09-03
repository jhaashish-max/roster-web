/**
 * Pure headcount / shrinkage maths used by the Reports › Headcount view and its Excel export.
 *
 * Per day and team:
 *   people      = members ∪ names that have a roster row that day
 *                 minus anyone whose status that day is Exit / NA  (they are off the books)
 *   Total HC    = |people|
 *   Rostered HC = people that have a real (non-empty) row that day   → always ≤ Total HC
 *   Present HC  = rostered people on a shift / on call / WFH / Available
 *   WOFF        = WO rows,   PL = PL + SL rows,   WL = WL rows,   Holiday = Holiday + OH rows
 *   Planned shrinkage   = (PL + WOFF) / Total HC
 *   Unplanned shrinkage = WL / Rostered HC
 *   Overall             = Planned + Unplanned
 */
import { normalizeStatus, PRESENT_KINDS } from './status.js';
import { isWeekendISO } from './dates.js';

const OFF_BOOKS = new Set(['exit', 'na']);

/**
 * @param {{ members: string[], rows: Array<{Name:string, Status:string}>, dateStr: string }} input
 *   rows = roster rows of ONE team for ONE day
 */
export function computeDailyHeadcount({ members = [], rows = [], dateStr }) {
    const weekend = dateStr ? isWeekendISO(dateStr) : false;
    const byName = new Map();
    rows.forEach((r) => {
        const name = (r.Name || '').trim();
        if (!name) return;
        const n = normalizeStatus(r.Status, { weekend });
        // An empty cell is the same as "no row" for headcount purposes.
        if (n.kind === 'empty') return;
        byName.set(name, n);
    });

    const people = new Set(members.map((m) => String(m).trim()).filter(Boolean));
    byName.forEach((_n, name) => people.add(name));
    byName.forEach((n, name) => { if (OFF_BOOKS.has(n.kind)) people.delete(name); });

    let rosteredHC = 0, presentHC = 0, woff = 0, pl = 0, wl = 0, holiday = 0, wfh = 0;
    people.forEach((name) => {
        const n = byName.get(name);
        if (!n) return; // member without a row
        rosteredHC += 1;
        if (PRESENT_KINDS.includes(n.kind)) presentHC += 1;
        if (n.kind === 'wfh') wfh += 1;
        if (n.kind === 'wo') woff += 1;
        if (n.kind === 'pl' || n.kind === 'sl' || n.kind === 'ul') pl += 1;
        if (n.kind === 'wl') wl += 1;
        if (n.kind === 'holiday' || n.kind === 'oh') holiday += 1;
    });

    const totalHC = people.size;
    const shrinkagePlanned = totalHC > 0 ? ((pl + woff) / totalHC) * 100 : 0;
    const shrinkageUnplanned = rosteredHC > 0 ? (wl / rosteredHC) * 100 : 0;
    const shrinkageOverall = shrinkagePlanned + shrinkageUnplanned;

    return { dateStr, weekend, totalHC, rosteredHC, presentHC, wfh, woff, pl, wl, holiday, shrinkagePlanned, shrinkageUnplanned, shrinkageOverall };
}

/**
 * @param {{ team: {name:string, members?:string[]}, rows: Array<{Date,Name,Status,Team}>, dates: Array<{iso:string}> }} input
 * @returns {{ totalHC: number, dailyData: Array }} totalHC = the largest daily headcount in the range (for the card header)
 */
export function computeTeamHeadcount({ team, rows, dates }) {
    const byDate = new Map();
    rows.forEach((r) => {
        if ((r.Team || '') !== team.name) return;
        if (!byDate.has(r.Date)) byDate.set(r.Date, []);
        byDate.get(r.Date).push(r);
    });
    const dailyData = dates.map((d) => {
        const day = computeDailyHeadcount({ members: team.members || [], rows: byDate.get(d.iso) || [], dateStr: d.iso });
        return { ...day, date: d.date, dateStr: d.iso };
    });
    const totalHC = dailyData.reduce((max, d) => Math.max(max, d.totalHC), 0);
    return { totalHC, dailyData };
}

export function shrinkageTier(value) {
    if (value === 0) return 'zero';
    if (value <= 10) return 'low';
    if (value <= 25) return 'mid';
    return 'high';
}
