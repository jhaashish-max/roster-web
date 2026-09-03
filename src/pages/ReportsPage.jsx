import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Download, Users } from 'lucide-react';
import { fetchAllTeamsRoster, fetchRoster } from '../lib/api';
import { normalizeStatus } from '../lib/status';
import { computeTeamHeadcount, shrinkageTier } from '../lib/headcount';
import { daysBetween, isWeekendISO, monthRangeISO, monthsInRange, todayISO, toISODate } from '../lib/dates';
import { CardSkeleton } from '../components/Skeleton';
import { useToast } from '../hooks/useToast';
import { cx } from '../lib/utils';

const HC_ROWS = [
    { label: 'Total HC', key: 'totalHC', group: 'cap' },
    { label: 'Rostered HC', key: 'rosteredHC', group: 'cap' },
    { label: 'Present HC', key: 'presentHC', group: 'cap' },
    { label: 'WOFF', key: 'woff', group: 'abs' },
    { label: 'PL', key: 'pl', group: 'abs' },
    { label: 'WL', key: 'wl', group: 'abs' },
];
const SHRINK_ROWS = [
    { label: 'Shrinkage · Overall', key: 'shrinkageOverall' },
    { label: 'Shrinkage · Planned', key: 'shrinkagePlanned' },
    { label: 'Shrinkage · Unplanned (WL)', key: 'shrinkageUnplanned' },
];

function startOfWeekISO() {
    const d = new Date();
    const day = d.getDay(); // 0 Sun
    const diff = (day + 6) % 7; // Monday start
    d.setDate(d.getDate() - diff);
    const start = toISODate(d);
    d.setDate(d.getDate() + 6);
    return { start, end: toISODate(d) };
}

export default function ReportsPage({ currentDate, teams, selectedTeams, headerAction }) {
    const toast = useToast();
    const [range, setRange] = useState(() => monthRangeISO(currentDate.getFullYear(), currentDate.getMonth() + 1));
    const [preset, setPreset] = useState('month');
    const [tab, setTab] = useState('analytics');
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const singleTeam = selectedTeams.length === 1 ? selectedTeams[0] : '';
    const teamFilterKey = selectedTeams.join('|');

    useEffect(() => {
        if (!range.start || !range.end || range.start > range.end) return undefined;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const months = monthsInRange(range.start, range.end);
                const chunks = await Promise.all(months.map(async ({ year, month }) => {
                    if (singleTeam) return fetchRoster(year, month, singleTeam);
                    const map = await fetchAllTeamsRoster(year, month);
                    return Object.values(map || {}).flat();
                }));
                if (cancelled) return;
                const selected = new Set(selectedTeams);
                setData(chunks.flat().filter((r) => r?.Date >= range.start && r.Date <= range.end && (selected.size === 0 || selected.has(r.Team))));
            } catch (err) {
                if (!cancelled) toast.error(err.message || 'Failed to load report data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [range.start, range.end, singleTeam, teamFilterKey, toast]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Analytics ──
    const analytics = useMemo(() => {
        const columns = new Set();
        const agg = {};
        data.forEach((row) => {
            const n = normalizeStatus(row.Status, { weekend: isWeekendISO(row.Date) });
            if (n.kind === 'empty' || n.kind === 'na') return;
            const col = n.kind === 'shift' || n.kind === 'oncall' || n.kind === 'available' ? 'Present' : n.value;
            columns.add(col);
            if (!agg[row.Name]) agg[row.Name] = { Total: 0, OnCall: 0, NightShift: 0 };
            agg[row.Name][col] = (agg[row.Name][col] || 0) + 1;
            agg[row.Name].Total += 1;
            if (isWeekendISO(row.Date) && n.kind !== 'wo' && n.kind !== 'exit') agg[row.Name].OnCall += 1;
            if (n.period === 'night') agg[row.Name].NightShift += 1;
        });
        const sorted = Array.from(columns).sort();
        const statusTypes = sorted.includes('Present') ? ['Present', ...sorted.filter((c) => c !== 'Present')] : sorted;
        const agents = Object.keys(agg).sort();
        const totals = { OnCall: 0, NightShift: 0, Total: 0 };
        statusTypes.forEach((s) => { totals[s] = 0; });
        agents.forEach((a) => {
            totals.OnCall += agg[a].OnCall; totals.NightShift += agg[a].NightShift; totals.Total += agg[a].Total;
            statusTypes.forEach((s) => { totals[s] += agg[a][s] || 0; });
        });
        return { statusTypes, agents, stats: agg, totals };
    }, [data]);

    // ── Headcount ──
    const headcount = useMemo(() => {
        const dates = daysBetween(range.start, range.end);
        const toProcess = (selectedTeams.length > 0 ? teams.filter((t) => selectedTeams.includes(t.name)) : teams.filter((t) => !t.archived));
        const out = {};
        toProcess.forEach((team) => { out[team.name] = computeTeamHeadcount({ team, rows: data, dates }); });
        return { dates, byTeam: out, names: Object.keys(out) };
    }, [data, teams, selectedTeams, range.start, range.end]);

    const exportCSV = () => {
        const { statusTypes, agents, stats } = analytics;
        const headers = ['Agent', 'On Call', 'Night Shift', ...statusTypes, 'Total'];
        const rows = agents.map((a) => [a, stats[a].OnCall, stats[a].NightShift, ...statusTypes.map((t) => stats[a][t] || 0), stats[a].Total]);
        const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url; a.download = `roster_summary_${range.start}_${range.end}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportHeadcountXLSX = async () => {
        const XLSX = (await import('xlsx-js-style')).default; // loaded on demand: the library is ~800 kB
        const border = { top: { style: 'thin', color: { rgb: 'D0D5DD' } }, bottom: { style: 'thin', color: { rgb: 'D0D5DD' } }, left: { style: 'thin', color: { rgb: 'D0D5DD' } }, right: { style: 'thin', color: { rgb: 'D0D5DD' } } };
        const center = { horizontal: 'center', vertical: 'center' };
        const left = { horizontal: 'left', vertical: 'center' };
        const fonts = { head: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '1F2937' } }, metric: { bold: true, sz: 10, name: 'Calibri', color: { rgb: '1E3A8A' } }, data: { sz: 10, name: 'Calibri' }, team: { bold: true, sz: 11, name: 'Calibri', color: { rgb: '1E3A8A' } }, wknd: { sz: 9, name: 'Calibri', italic: true, color: { rgb: '98A2B3' } } };
        const fills = { head: { fgColor: { rgb: 'EEF2FF' } }, headWknd: { fgColor: { rgb: 'E5E7EB' } }, wknd: { fgColor: { rgb: 'F3F4F6' } }, team: { fgColor: { rgb: 'DBE7FB' } }, label: { fgColor: { rgb: 'F8FAFC' } }, white: { fgColor: { rgb: 'FFFFFF' } } };
        const shrink = { zero: ['D9F2E3', '14532D'], low: ['FDF0B8', '713F12'], mid: ['FFE6B3', '78350F'], high: ['FBD5D5', '881337'] };
        const rowsOut = []; const merges = []; const heights = []; let numCols = 0;
        headcount.names.forEach((teamName, ti) => {
            const { dailyData } = headcount.byTeam[teamName];
            numCols = Math.max(numCols, dailyData.length);
            if (ti > 0) for (let b = 0; b < 3; b++) { rowsOut.push([]); heights.push({ hpt: 16 }); }
            const start = rowsOut.length;
            rowsOut.push([{ v: teamName, s: { font: fonts.team, fill: fills.team, alignment: left, border } }, ...dailyData.map(() => ({ v: '', s: { fill: fills.team, border } }))]);
            heights.push({ hpt: 26 });
            merges.push({ s: { r: start, c: 0 }, e: { r: start, c: dailyData.length } });
            rowsOut.push([{ v: 'HC', s: { font: fonts.head, fill: fills.head, alignment: center, border } }, ...dailyData.map((d) => ({ v: `${d.date.getMonth() + 1}/${d.date.getDate()}/${String(d.date.getFullYear()).slice(2)}\n${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.date.getDay()]}`, s: { font: { ...fonts.head, sz: 9 }, fill: d.weekend ? fills.headWknd : fills.head, alignment: { ...center, wrapText: true }, border } }))]);
            heights.push({ hpt: 36 });
            [...HC_ROWS, ...SHRINK_ROWS.map((r) => ({ ...r, shrink: true }))].forEach((r) => {
                const row = [{ v: r.label, s: { font: fonts.metric, alignment: left, border, fill: fills.label } }];
                dailyData.forEach((d) => {
                    if (r.shrink) {
                        if (d.weekend) row.push({ v: 'Weekend', s: { font: fonts.wknd, fill: fills.wknd, alignment: center, border } });
                        else {
                            const [bg, fg] = shrink[shrinkageTier(d[r.key])];
                            row.push({ v: d[r.key] / 100, t: 'n', z: '0.00%', s: { font: { sz: 10, name: 'Calibri', bold: true, color: { rgb: fg } }, fill: { fgColor: { rgb: bg } }, alignment: center, border } });
                        }
                    } else {
                        const val = r.group === 'abs' ? (d[r.key] || '') : d[r.key];
                        row.push({ v: val, t: typeof val === 'number' ? 'n' : 's', s: { font: fonts.data, fill: d.weekend ? fills.wknd : fills.white, alignment: center, border } });
                    }
                });
                rowsOut.push(row); heights.push({ hpt: 22 });
            });
        });
        const ws = XLSX.utils.aoa_to_sheet(rowsOut);
        ws['!cols'] = [{ wch: 26 }, ...Array(numCols).fill({ wch: 14 })];
        ws['!rows'] = heights; ws['!merges'] = merges;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
        XLSX.writeFile(wb, `headcount_${range.start}_${range.end}.xlsx`);
    };

    const today = todayISO();
    const { statusTypes, agents, stats, totals } = analytics;

    return (
        <div className="page page-reports">
            <div className="page-head">
                <div className="page-head-left"><h1 className="page-title">Reports</h1>{headerAction}</div>
                <div className="page-head-right">
                    <div className="segmented">
                        <button type="button" className={cx('segmented-btn', preset === 'month' && 'active')} onClick={() => { setPreset('month'); setRange(monthRangeISO(currentDate.getFullYear(), currentDate.getMonth() + 1)); }}><CalendarDays size={14} aria-hidden="true" /> Month</button>
                        <button type="button" className={cx('segmented-btn', preset === 'week' && 'active')} onClick={() => { setPreset('week'); setRange(startOfWeekISO()); }}><Clock size={14} aria-hidden="true" /> Week</button>
                    </div>
                    <div className="date-range">
                        <input type="date" className="input input-date" value={range.start} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, start: e.target.value })); }} aria-label="Range start" />
                        <span className="muted">→</span>
                        <input type="date" className="input input-date" value={range.end} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, end: e.target.value })); }} aria-label="Range end" />
                    </div>
                    {tab === 'analytics' && agents.length > 0 && <button type="button" className="btn btn-primary btn-icon-only" onClick={exportCSV} title="Export CSV" aria-label="Export CSV"><Download size={16} /></button>}
                    {tab === 'headcount' && headcount.names.length > 0 && <button type="button" className="btn btn-primary btn-icon-only" onClick={exportHeadcountXLSX} title="Export to Excel" aria-label="Export to Excel"><Download size={16} /></button>}
                </div>
            </div>

            <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'analytics'} className={cx('tab', tab === 'analytics' && 'active')} onClick={() => setTab('analytics')}>Analytics</button>
                <button type="button" role="tab" aria-selected={tab === 'headcount'} className={cx('tab', tab === 'headcount' && 'active')} onClick={() => setTab('headcount')}>Headcount</button>
            </div>

            {tab === 'analytics' && (
                <div className="card report-card">
                    {loading && agents.length === 0 ? <CardSkeleton lines={6} /> : agents.length === 0 ? (
                        <div className="empty-state-large"><CalendarDays size={36} aria-hidden="true" /><p>No data found for this period.</p></div>
                    ) : (
                        <div className="table-scroll">
                            <table className="table report-table">
                                <thead>
                                    <tr>
                                        <th className="sticky-col">Agent</th>
                                        <th className="num">On call</th>
                                        <th className="num">Night</th>
                                        {statusTypes.map((t) => <th key={t} className="num">{t}</th>)}
                                        <th className="num">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents.map((a) => (
                                        <tr key={a}>
                                            <th scope="row" className="sticky-col">{a}</th>
                                            <td className="num"><span className={cx('badge', stats[a].OnCall > 0 ? 'badge-oncall' : 'badge-zero')}>{stats[a].OnCall || '–'}</span></td>
                                            <td className="num"><span className={cx('badge', stats[a].NightShift > 0 ? 'badge-night' : 'badge-zero')}>{stats[a].NightShift || '–'}</span></td>
                                            {statusTypes.map((t) => <td key={t} className={cx('num', !stats[a][t] && 'muted')}>{stats[a][t] || '–'}</td>)}
                                            <td className="num strong">{stats[a].Total}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <th scope="row" className="sticky-col">Total</th>
                                        <td className="num strong">{totals.OnCall}</td>
                                        <td className="num strong">{totals.NightShift}</td>
                                        {statusTypes.map((t) => <td key={t} className="num strong">{totals[t] || 0}</td>)}
                                        <td className="num strong">{totals.Total}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                    {loading && agents.length > 0 && <div className="loading-pill">Updating…</div>}
                </div>
            )}

            {tab === 'headcount' && (
                loading && headcount.names.length === 0 ? <CardSkeleton lines={6} /> : headcount.names.length === 0 ? (
                    <div className="card empty-state-large"><Users size={36} aria-hidden="true" /><p>No headcount data for this period.</p></div>
                ) : (
                    <div className="hc-list">
                        {headcount.names.map((teamName) => {
                            const { totalHC, dailyData } = headcount.byTeam[teamName];
                            return (
                                <section key={teamName} className="card hc-card">
                                    <header className="hc-head"><span className="hc-team">{teamName}</span><span className="muted small">{totalHC} {totalHC === 1 ? 'member' : 'members'}</span></header>
                                    <div className="table-scroll">
                                        <table className="table hc-table">
                                            <thead>
                                                <tr>
                                                    <th className="sticky-col hc-corner" />
                                                    {dailyData.map((d) => (
                                                        <th key={d.dateStr} className={cx('hc-date', d.weekend && 'is-weekend', d.dateStr === today && 'is-today')}>
                                                            <span className="hc-d">{d.date.getDate()}</span>
                                                            <span className="hc-day">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.date.getDay()]}</span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {HC_ROWS.map((r, i, arr) => (
                                                    <tr key={r.key} className={cx(i > 0 && arr[i - 1].group !== r.group && 'group-first')}>
                                                        <th scope="row" className={`sticky-col hc-label hc-g-${r.group}`}>{r.label}</th>
                                                        {dailyData.map((d) => <td key={d.dateStr} className={cx('num', d.weekend && 'is-weekend', d.dateStr === today && 'is-today')}>{r.group === 'abs' ? (d[r.key] || '') : d[r.key]}</td>)}
                                                    </tr>
                                                ))}
                                                {SHRINK_ROWS.map((r, i) => (
                                                    <tr key={r.key} className={cx(i === 0 && 'group-first')}>
                                                        <th scope="row" className="sticky-col hc-label hc-g-shr">{r.label}</th>
                                                        {dailyData.map((d) => d.weekend
                                                            ? <td key={d.dateStr} className="num is-weekend muted">–</td>
                                                            : <td key={d.dateStr} className={cx('num', `shrink-${shrinkageTier(d[r.key])}`, d.dateStr === today && 'is-today')}>{d[r.key].toFixed(2)}%</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            );
                        })}
                        {loading && <div className="loading-pill">Updating…</div>}
                    </div>
                )
            )}
        </div>
    );
}
