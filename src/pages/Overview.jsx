import { useMemo, useState } from 'react';
import { Briefcase, Calendar, CalendarDays, ChevronLeft, ChevronRight, Moon, Sun, SunMedium, UserX } from 'lucide-react';
import LiveClock from '../components/LiveClock';
import StatusChip from '../components/StatusChip';
import { StatSkeleton, CardSkeleton } from '../components/Skeleton';
import { normalizeStatus, LEAVE_KINDS } from '../lib/status';
import { addDaysISO, formatISO, monthRangeISO, todayISO, isWeekendISO } from '../lib/dates';
import { getAvatarColor, initials } from '../lib/utils';

const NOT_AVAILABLE_KINDS = new Set([...LEAVE_KINDS, 'wo', 'holiday']);

function AgentCard({ row, weekend }) {
    return (
        <div className="agent-row">
            <span className="avatar" style={{ background: getAvatarColor(row.Name) }} aria-hidden="true">{initials(row.Name)}</span>
            <div className="agent-row-body">
                <div className="agent-row-title">
                    <span className="agent-name">{row.Name}</span>
                    {row.Team && <span className="tag">{row.Team}</span>}
                </div>
                <StatusChip status={row.Status} weekend={weekend} className="status-chip-sm" />
            </div>
        </div>
    );
}

export default function Overview({ rows, loading, currentDate, headerAction }) {
    const [viewDate, setViewDate] = useState(() => todayISO());
    const today = todayISO();
    const isViewingToday = viewDate === today;
    const weekend = isWeekendISO(viewDate);

    const day = useMemo(() => {
        const todayRows = rows.filter((r) => r.Date === viewDate);
        const classified = todayRows.map((r) => ({ row: r, n: normalizeStatus(r.Status, { weekend }) }))
            .filter(({ n }) => n.kind !== 'empty' && n.kind !== 'exit' && n.kind !== 'na');
        const working = classified.filter(({ n }) => n.kind === 'shift' || n.kind === 'oncall' || n.kind === 'available' || n.kind === 'wfh');
        const byPeriod = (p) => working.filter(({ n }) => n.period === p).map(({ row }) => row);
        const notAvailable = classified.filter(({ n }) => NOT_AVAILABLE_KINDS.has(n.kind)).map(({ row }) => row);
        return {
            count: classified.length,
            working: working.length,
            morning: byPeriod('morning'),
            afternoon: byPeriod('afternoon'),
            night: byPeriod('night'),
            other: working.filter(({ n }) => !n.period).map(({ row }) => row),
            leave: classified.filter(({ n }) => LEAVE_KINDS.includes(n.kind) && n.kind !== 'wl').length,
            wo: classified.filter(({ n }) => n.kind === 'wo').length,
            wl: classified.filter(({ n }) => n.kind === 'wl').length,
            notAvailable,
        };
    }, [rows, viewDate, weekend]);

    const upcoming = useMemo(() => {
        const { end } = monthRangeISO(currentDate.getFullYear(), currentDate.getMonth() + 1);
        const groups = new Map();
        rows
            .filter((r) => r.Date > today && r.Date <= end)
            .forEach((r) => {
                const n = normalizeStatus(r.Status, { weekend: isWeekendISO(r.Date) });
                if (!LEAVE_KINDS.includes(n.kind) && !(n.kind === 'wo' && !isWeekendISO(r.Date)) && n.kind !== 'holiday') return;
                if (!groups.has(r.Date)) groups.set(r.Date, []);
                groups.get(r.Date).push(r);
            });
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [rows, currentDate, today]);

    const blocks = [
        { key: 'morning', title: 'Morning', Icon: Sun, list: day.morning, cls: 'period-morning' },
        { key: 'afternoon', title: 'Afternoon', Icon: SunMedium, list: day.afternoon, cls: 'period-afternoon' },
        { key: 'night', title: 'Night', Icon: Moon, list: day.night, cls: 'period-night' },
    ];

    return (
        <div className="page page-overview">
            <div className="page-head">
                <div className="page-head-left">
                    <LiveClock />
                    <div className="date-nav date-nav-day">
                        <button type="button" className="icon-btn" onClick={() => setViewDate((d) => addDaysISO(d, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
                        <button type="button" className={`date-chip${isViewingToday ? ' is-today' : ''}`} onClick={() => setViewDate(today)} title={isViewingToday ? 'Viewing today' : 'Back to today'}>
                            <CalendarDays size={13} aria-hidden="true" /> {formatISO(viewDate)}
                        </button>
                        <button type="button" className="icon-btn" onClick={() => setViewDate((d) => addDaysISO(d, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
                    </div>
                </div>
                <div className="page-head-right">{headerAction}</div>
            </div>

            {loading ? (
                <>
                    <StatSkeleton />
                    <div className="two-col"><CardSkeleton lines={5} /><CardSkeleton lines={4} /></div>
                </>
            ) : rows.length === 0 ? (
                <div className="card empty-state-large">
                    <Calendar size={32} aria-hidden="true" />
                    <h3>No roster found</h3>
                    <p>Generate or enter a roster for this month to see the overview.</p>
                </div>
            ) : (
                <>
                    <div className="stats-grid">
                        <div className="stat-card tone-working"><span className="stat-icon" aria-hidden="true">👨‍💻</span><h3>Working</h3><div className="stat-value">{day.working}</div></div>
                        <div className="stat-card tone-morning"><span className="stat-icon" aria-hidden="true">☀️</span><h3>Morning</h3><div className="stat-value">{day.morning.length}</div></div>
                        <div className="stat-card tone-afternoon"><span className="stat-icon" aria-hidden="true">⛅</span><h3>Afternoon</h3><div className="stat-value">{day.afternoon.length}</div></div>
                        <div className="stat-card tone-night"><span className="stat-icon" aria-hidden="true">🌙</span><h3>Night</h3><div className="stat-value">{day.night.length}</div></div>
                        <div className="stat-card tone-leave"><span className="stat-icon" aria-hidden="true">🧳</span><h3>Leave</h3><div className="stat-value">{day.leave}</div></div>
                        <div className="stat-card tone-wo"><span className="stat-icon" aria-hidden="true">🏖️</span><h3>Week off</h3><div className="stat-value">{day.wo}</div></div>
                        {day.wl > 0 && <div className="stat-card tone-wl"><span className="stat-icon" aria-hidden="true">🤒</span><h3>Wellness</h3><div className="stat-value">{day.wl}</div></div>}
                    </div>

                    <div className="two-col">
                        <section className="card panel">
                            <header className="panel-head"><Briefcase size={18} aria-hidden="true" /><h3>{isViewingToday ? "Today's schedule" : `Schedule · ${formatISO(viewDate)}`}</h3></header>
                            <div className="schedule-blocks">
                                {blocks.map((block) => {
                                    const BlockIcon = block.Icon;
                                    return (
                                        <div key={block.key} className={`schedule-block ${block.cls}`}>
                                            <div className="schedule-block-head"><BlockIcon size={15} aria-hidden="true" /><span>{block.title}</span><span className="muted">{block.list.length}</span></div>
                                            <div className="schedule-block-list">
                                                {block.list.length > 0 ? block.list.map((r) => <AgentCard key={`${r.Team}-${r.Name}`} row={r} weekend={weekend} />) : <div className="empty-slot">Nobody scheduled.</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                                {day.other.length > 0 && (
                                    <div className="schedule-block period-other">
                                        <div className="schedule-block-head"><Briefcase size={15} aria-hidden="true" /><span>Other</span><span className="muted">{day.other.length}</span></div>
                                        <div className="schedule-block-list">{day.other.map((r) => <AgentCard key={`${r.Team}-${r.Name}`} row={r} weekend={weekend} />)}</div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="stack">
                            <section className="card panel">
                                <header className="panel-head"><UserX size={18} aria-hidden="true" className="text-danger" /><h3>Not available ({day.notAvailable.length})</h3></header>
                                {day.notAvailable.length > 0 ? (
                                    <div className="agent-list">{day.notAvailable.map((r) => <AgentCard key={`${r.Team}-${r.Name}`} row={r} weekend={weekend} />)}</div>
                                ) : <p className="empty-state">Everyone is available.</p>}
                            </section>
                            <section className="card panel">
                                <header className="panel-head"><CalendarDays size={18} aria-hidden="true" /><h3>Upcoming leaves</h3></header>
                                {upcoming.length > 0 ? (
                                    <div className="upcoming-list">
                                        {upcoming.map(([date, list]) => (
                                            <div key={date} className="upcoming-group">
                                                <div className="upcoming-date">{formatISO(date)}</div>
                                                {list.map((r) => (
                                                    <div key={`${r.Team}-${r.Name}`} className="upcoming-item">
                                                        <span className="avatar avatar-xs" style={{ background: getAvatarColor(r.Name) }} aria-hidden="true">{initials(r.Name)}</span>
                                                        <span className="upcoming-name">{r.Name}</span>
                                                        {r.Team && <span className="tag">{r.Team}</span>}
                                                        <StatusChip status={r.Status} weekend={isWeekendISO(r.Date)} className="status-chip-sm" />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="empty-state">No upcoming leaves this month.</p>}
                            </section>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
