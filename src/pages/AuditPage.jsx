import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, History, RefreshCw } from 'lucide-react';
import Banner from '../components/Banner';
import StatusChip from '../components/StatusChip';
import { CardSkeleton } from '../components/Skeleton';
import { getAudit } from '../lib/api';
import { ACTION_GROUPS, groupFor, labelFor, relativeTime, summarize, toCsv } from '../lib/auditFormat';
import { addDaysISO, todayISO } from '../lib/dates';
import { triggerDownload } from '../lib/skillBundle';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { cx } from '../lib/utils';

const PAGE_SIZES = [25, 50, 100];
const DEBOUNCE_MS = 300;

function useDebounced(value, delay) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function defaultFilters() {
    const to = todayISO();
    return { team: '', action: '', name: '', actor: '', from: addDaysISO(to, -30), to };
}

/** Admin-only, paginated, filterable view of roster_audit_log (v2 worker). */
export default function AuditPage({ teams = [] }) {
    const [filters, setFilters] = useState(defaultFilters);
    const [pageSize, setPageSize] = useLocalStorage('audit_page_size', 50);
    const [offset, setOffset] = useState(0);
    const [data, setData] = useState({ entries: [], total: 0, hasMore: false, actions: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [now, setNow] = useState(() => Date.now());

    const name = useDebounced(filters.name, DEBOUNCE_MS);
    const actor = useDebounced(filters.actor, DEBOUNCE_MS);
    const queryKey = JSON.stringify({ team: filters.team, action: filters.action, name, actor, from: filters.from, to: filters.to, limit: pageSize, offset });

    const load = useCallback(async () => {
        const params = JSON.parse(queryKey);
        setLoading(true);
        setError(null);
        try {
            const res = await getAudit(params);
            setData({
                entries: Array.isArray(res?.entries) ? res.entries : [],
                total: Number(res?.total) || 0,
                hasMore: !!res?.hasMore,
                actions: Array.isArray(res?.actions) ? res.actions : [],
            });
            setNow(Date.now());
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [queryKey]);

    useEffect(() => { load(); }, [load]);

    const setFilter = (patch) => { setFilters((f) => ({ ...f, ...patch })); setOffset(0); setExpanded(null); };
    const clearFilters = () => { setFilters(defaultFilters()); setOffset(0); };
    const isDefault = useMemo(() => JSON.stringify(filters) === JSON.stringify(defaultFilters()), [filters]);

    const actionOptions = useMemo(() => {
        const known = new Set(data.actions);
        return ACTION_GROUPS.map((g) => ({
            group: g,
            actions: Array.from(known).filter((a) => a.startsWith(g.prefix)).sort(),
        })).filter((g) => g.actions.length > 0 || filters.action === g.group.prefix);
    }, [data.actions, filters.action]);

    const activeTeams = teams.filter((t) => !t.archived);
    const from = data.total === 0 ? 0 : offset + 1;
    const to = Math.min(offset + data.entries.length, data.total);

    const exportCsv = () => {
        const blob = new Blob([toCsv(data.entries)], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `audit_${filters.from}_${filters.to}_p${Math.floor(offset / pageSize) + 1}.csv`);
    };

    return (
        <div className="page page-audit">
            <div className="page-head">
                <div>
                    <h1 className="page-title"><History size={20} aria-hidden="true" /> Audit log</h1>
                    <p className="muted small">Every change made through the Roster API — who, what and when.</p>
                </div>
                <div className="page-head-right">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading} aria-label="Refresh"><RefreshCw size={14} className={loading ? 'spin' : undefined} aria-hidden="true" /> Refresh</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={data.entries.length === 0}><Download size={14} aria-hidden="true" /> Export page CSV</button>
                </div>
            </div>

            <div className="card audit-filters">
                <label className="field">
                    <span className="field-label">Team</span>
                    <select className="input" value={filters.team} onChange={(e) => setFilter({ team: e.target.value })}>
                        <option value="">All teams</option>
                        {activeTeams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                </label>
                <label className="field">
                    <span className="field-label">Action</span>
                    <select className="input" value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
                        <option value="">All actions</option>
                        {actionOptions.map(({ group, actions }) => (
                            <optgroup key={group.prefix} label={group.label}>
                                <option value={group.prefix}>All {group.label.toLowerCase()}</option>
                                {actions.map((a) => <option key={a} value={a}>{labelFor(a)}</option>)}
                            </optgroup>
                        ))}
                    </select>
                </label>
                <label className="field">
                    <span className="field-label">Person</span>
                    <input className="input" value={filters.name} onChange={(e) => setFilter({ name: e.target.value })} placeholder="Name contains…" />
                </label>
                <label className="field">
                    <span className="field-label">Actor</span>
                    <input className="input" value={filters.actor} onChange={(e) => setFilter({ actor: e.target.value })} placeholder="E-mail contains…" />
                </label>
                <label className="field">
                    <span className="field-label">From</span>
                    <input type="date" className="input" value={filters.from} max={filters.to} onChange={(e) => setFilter({ from: e.target.value })} />
                </label>
                <label className="field">
                    <span className="field-label">To</span>
                    <input type="date" className="input" value={filters.to} min={filters.from} onChange={(e) => setFilter({ to: e.target.value })} />
                </label>
                <div className="audit-filters-foot">
                    {!isDefault && <button type="button" className="link" onClick={clearFilters}>Clear filters</button>}
                </div>
            </div>

            {error && (
                <Banner tone="danger">Couldn't load the audit log: {error.message}. <button type="button" className="link" onClick={load}>Retry</button></Banner>
            )}

            <div className="card report-card">
                {loading && data.entries.length === 0 ? <CardSkeleton lines={8} /> : data.entries.length === 0 ? (
                    <div className="empty-state-large"><History size={36} aria-hidden="true" /><p>No audit entries match these filters.</p></div>
                ) : (
                    <div className="table-scroll">
                        <table className="table audit-table">
                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Who</th>
                                    <th>Action</th>
                                    <th>Team</th>
                                    <th>Person</th>
                                    <th>Date</th>
                                    <th>Change</th>
                                    <th aria-label="Details" />
                                </tr>
                            </thead>
                            <tbody>
                                {data.entries.map((e) => {
                                    const group = groupFor(e.action);
                                    const summary = summarize(e);
                                    const isOpen = expanded === e.id;
                                    const hasMeta = e.meta && typeof e.meta === 'object' && Object.keys(e.meta).length > 0;
                                    return [
                                        <tr key={e.id} className={cx(isOpen && 'is-editing')}>
                                            <td className="audit-when">
                                                <div>{formatWhen(e.at)}</div>
                                                <div className="muted small">{relativeTime(e.at, now)}</div>
                                            </td>
                                            <td className="audit-actor">
                                                {e.actor === 'service' ? <span className="tag audit-service">API key</span> : <span className="truncate" title={e.actor}>{e.actor}</span>}
                                            </td>
                                            <td><span className={cx('status-chip audit-action', `kind-${group.tone}`)} title={e.action}>{labelFor(e.action)}</span></td>
                                            <td>{e.team || <span className="muted">–</span>}</td>
                                            <td>{e.name || <span className="muted">–</span>}</td>
                                            <td className="audit-date">{e.date || <span className="muted">–</span>}</td>
                                            <td className="audit-change">
                                                {summary === null ? (
                                                    <span className="audit-diff">
                                                        <StatusChip status={e.old_status} className="status-chip-sm" />
                                                        <span className="muted">→</span>
                                                        <StatusChip status={e.new_status} className="status-chip-sm" />
                                                    </span>
                                                ) : <span className="small">{summary || <span className="muted">–</span>}</span>}
                                            </td>
                                            <td className="num">
                                                {hasMeta && (
                                                    <button type="button" className="icon-btn icon-btn-sm" onClick={() => setExpanded(isOpen ? null : e.id)} aria-expanded={isOpen} aria-label={isOpen ? 'Hide details' : 'Show details'}>
                                                        <ChevronDown size={14} className={isOpen ? 'rotate-180' : undefined} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>,
                                        isOpen && hasMeta && (
                                            <tr key={`${e.id}-details`} className="audit-details-row">
                                                <td colSpan={8}>
                                                    <pre className="audit-meta">{JSON.stringify(e.meta, null, 2)}</pre>
                                                </td>
                                            </tr>
                                        ),
                                    ];
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {loading && data.entries.length > 0 && <div className="loading-pill">Updating…</div>}
                <div className="card-foot audit-pager">
                    <span className="muted small">{data.total === 0 ? 'No entries' : `Showing ${from}–${to} of ${data.total}`}</span>
                    <div className="row-actions">
                        <label className="muted small audit-page-size">
                            Rows
                            <select className="input input-num" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setOffset(0); }} aria-label="Rows per page">
                                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOffset((o) => Math.max(0, o - pageSize))} disabled={offset === 0 || loading}><ChevronLeft size={14} aria-hidden="true" /> Prev</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOffset((o) => o + pageSize)} disabled={!data.hasMore || loading}>Next <ChevronRight size={14} aria-hidden="true" /></button>
                    </div>
                </div>
            </div>
            <p className="muted small">Audit entries are kept for 3 months.</p>
        </div>
    );
}
