import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfMonth, endOfMonth, isWeekend, eachMonthOfInterval } from 'date-fns';
import { Download, Loader2, CalendarDays, Users, Clock, Moon, Sun as SunIcon, TrendingUp } from 'lucide-react';
import { fetchRoster, fetchAllTeamsRoster } from '../lib/api';

const Summary = ({ currentDate, selectedTeam, viewMode, headerAction }) => {
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
        end: format(endOfMonth(currentDate), 'yyyy-MM-dd')
    });

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activePreset, setActivePreset] = useState('month');

    // Fetch Logic
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const start = parseISO(dateRange.start);
                const end = parseISO(dateRange.end);
                const months = eachMonthOfInterval({ start, end });

                let accumulatedData = [];
                for (const monthDate of months) {
                    const year = monthDate.getFullYear();
                    const month = monthDate.getMonth() + 1;

                    if (viewMode === 'all') {
                        const monthDataMap = await fetchAllTeamsRoster(year, month);
                        const flat = Object.values(monthDataMap).flat();
                        accumulatedData = [...accumulatedData, ...flat];
                    } else {
                        const monthData = await fetchRoster(year, month, selectedTeam);
                        accumulatedData = [...accumulatedData, ...monthData];
                    }
                }

                const filtered = accumulatedData.filter(row => {
                    if (!row.Date) return false;
                    const rowDate = parseISO(row.Date);
                    return isWithinInterval(rowDate, { start, end });
                });

                setData(filtered);
            } catch (err) {
                console.error("Summary fetch error:", err);
            } finally {
                setLoading(false);
            }
        };

        if (dateRange.start && dateRange.end) loadData();
    }, [dateRange, selectedTeam, viewMode]);

    // Unique Statuses (Dynamic Columns)
    const statusTypes = useMemo(() => {
        const types = new Set();
        data.forEach(row => {
            if (row.Status && row.Status !== '-' && row.Status !== 'x') {
                let type = row.Status;
                if (type.includes(':')) type = 'Present';
                types.add(type);
            }
        });
        const sorted = Array.from(types).sort();
        if (sorted.includes('Present')) return ['Present', ...sorted.filter(t => t !== 'Present')];
        return sorted;
    }, [data]);

    // Aggregate Stats
    const stats = useMemo(() => {
        const agg = {};
        data.forEach(row => {
            let type = row.Status;
            if (!type || type === '-' || type === 'x') return;

            const rowDate = parseISO(row.Date);
            const isSatSun = isWeekend(rowDate);
            const isNight = type.startsWith('18:00');

            if (type.includes(':')) type = 'Present';

            if (!agg[row.Name]) agg[row.Name] = { Total: 0, OnCall: 0, NightShift: 0 };

            agg[row.Name][type] = (agg[row.Name][type] || 0) + 1;
            agg[row.Name].Total += 1;

            if (isSatSun && row.Status !== 'WO') agg[row.Name].OnCall += 1;
            if (isNight) agg[row.Name].NightShift += 1;
        });
        return agg;
    }, [data]);

    const agents = Object.keys(stats).sort();

    // Totals row
    const totals = useMemo(() => {
        const t = { OnCall: 0, NightShift: 0, Total: 0 };
        statusTypes.forEach(s => t[s] = 0);
        agents.forEach(a => {
            t.OnCall += stats[a].OnCall || 0;
            t.NightShift += stats[a].NightShift || 0;
            t.Total += stats[a].Total || 0;
            statusTypes.forEach(s => t[s] += stats[a][s] || 0);
        });
        return t;
    }, [stats, agents, statusTypes]);

    // Presets
    const setMonthRange = () => {
        setActivePreset('month');
        setDateRange({
            start: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
            end: format(endOfMonth(currentDate), 'yyyy-MM-dd')
        });
    };

    const setWeekRange = () => {
        setActivePreset('week');
        const start = startOfWeek(new Date(), { weekStartsOn: 1 });
        const end = endOfWeek(new Date(), { weekStartsOn: 1 });
        setDateRange({ start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') });
    };

    // Export CSV
    const handleExportCSV = () => {
        const headers = ['Agent', 'On Call', 'Night Shift', ...statusTypes, 'Total'];
        const rows = agents.map(agent => [
            agent,
            stats[agent].OnCall,
            stats[agent].NightShift,
            ...statusTypes.map(t => stats[agent][t] || 0),
            stats[agent].Total
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `roster_summary_${dateRange.start}_${dateRange.end}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="summary-page">
            {/* Header */}
            <div className="summary-header">
                <div className="summary-header-left">
                    <h1 className="dashboard-title">Summary</h1>
                    {headerAction}
                </div>
                <div className="summary-header-right">
                    <div className="summary-presets">
                        <button className={`summary-preset-btn ${activePreset === 'month' ? 'active' : ''}`} onClick={setMonthRange}>
                            <CalendarDays size={14} /> Month
                        </button>
                        <button className={`summary-preset-btn ${activePreset === 'week' ? 'active' : ''}`} onClick={setWeekRange}>
                            <Clock size={14} /> Week
                        </button>
                    </div>
                    <div className="summary-date-range">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => { setActivePreset('custom'); setDateRange(prev => ({ ...prev, start: e.target.value })); }}
                            className="summary-date-input"
                        />
                        <span className="summary-date-sep">→</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => { setActivePreset('custom'); setDateRange(prev => ({ ...prev, end: e.target.value })); }}
                            className="summary-date-input"
                        />
                    </div>
                    <button className="summary-export-btn" onClick={handleExportCSV} title="Export CSV">
                        <Download size={16} />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="summary-table-card">
                {loading && agents.length === 0 ? (
                    <div className="summary-loading">
                        <Loader2 size={28} className="spin" />
                        <p>Fetching summary data...</p>
                    </div>
                ) : agents.length === 0 ? (
                    <div className="summary-empty">
                        <CalendarDays size={40} />
                        <p>No data found for this period.</p>
                    </div>
                ) : (
                    <div className="summary-table-scroll">
                        <table className="summary-table">
                            <thead>
                                <tr>
                                    <th className="summary-th-agent">Agent</th>
                                    <th className="summary-th summary-th-oncall">On Call</th>
                                    <th className="summary-th summary-th-night">Night</th>
                                    {statusTypes.map(type => (
                                        <th key={type} className="summary-th">{type}</th>
                                    ))}
                                    <th className="summary-th summary-th-total">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.map(agent => (
                                    <tr key={agent} className="summary-row">
                                        <td className="summary-td-agent">{agent}</td>
                                        <td className="summary-td">
                                            <span className={`summary-badge ${stats[agent].OnCall > 0 ? 'badge-oncall' : 'badge-zero'}`}>
                                                {stats[agent].OnCall || '-'}
                                            </span>
                                        </td>
                                        <td className="summary-td">
                                            <span className={`summary-badge ${stats[agent].NightShift > 0 ? 'badge-night' : 'badge-zero'}`}>
                                                {stats[agent].NightShift || '-'}
                                            </span>
                                        </td>
                                        {statusTypes.map(type => (
                                            <td key={type} className="summary-td">
                                                <span className={stats[agent][type] ? 'summary-val' : 'summary-val-empty'}>
                                                    {stats[agent][type] || '-'}
                                                </span>
                                            </td>
                                        ))}
                                        <td className="summary-td summary-td-total">{stats[agent].Total}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="summary-totals-row">
                                    <td className="summary-td-agent" style={{ fontWeight: 700 }}>Total</td>
                                    <td className="summary-td"><span className="summary-badge badge-oncall">{totals.OnCall}</span></td>
                                    <td className="summary-td"><span className="summary-badge badge-night">{totals.NightShift}</span></td>
                                    {statusTypes.map(type => (
                                        <td key={type} className="summary-td"><span className="summary-val" style={{ fontWeight: 600 }}>{totals[type] || 0}</span></td>
                                    ))}
                                    <td className="summary-td summary-td-total" style={{ fontWeight: 800 }}>{totals.Total}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
                {loading && agents.length > 0 && (
                    <div className="summary-loading-bar">
                        <Loader2 size={14} className="spin" /> Updating...
                    </div>
                )}
            </div>
        </div>
    );
};

export default Summary;
