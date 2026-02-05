import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfMonth, endOfMonth, isWeekend, eachMonthOfInterval } from 'date-fns';
import { Download, Loader, Moon } from 'lucide-react';
import { fetchRoster, fetchAllTeamsRoster } from '../lib/supabase';

const Summary = ({ currentDate, selectedTeam, viewMode, headerAction }) => {
    // Initialize with current month
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
        end: format(endOfMonth(currentDate), 'yyyy-MM-dd')
    });

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch Logic
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const start = parseISO(dateRange.start);
                const end = parseISO(dateRange.end);

                // Get all months involved in the range
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

                // Filter strictly by range
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

        if (dateRange.start && dateRange.end) {
            loadData();
        }
    }, [dateRange, selectedTeam, viewMode]);


    // Unique Statuses (Dynamic Columns)
    const statusTypes = useMemo(() => {
        const types = new Set();
        data.forEach(row => {
            if (row.Status && row.Status !== '-' && row.Status !== 'x') {
                let type = row.Status;
                if (type.includes(':')) {
                    type = 'Present';
                }
                types.add(type);
            }
        });
        const sorted = Array.from(types).sort();
        if (sorted.includes('Present')) {
            return ['Present', ...sorted.filter(t => t !== 'Present')];
        }
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

            // Track Night Shift before overwriting type
            // Track Night Shift before overwriting type
            const isNight = type.startsWith('18:00');

            if (type.includes(':')) type = 'Present';

            if (!agg[row.Name]) agg[row.Name] = { Total: 0, OnCall: 0, NightShift: 0 };

            agg[row.Name][type] = (agg[row.Name][type] || 0) + 1;
            agg[row.Name].Total += 1;

            // On Call Logic: Weekend AND Not WO
            if (isSatSun && row.Status !== 'WO') {
                agg[row.Name].OnCall += 1;
            }

            // Night Shift Logic
            if (isNight) {
                agg[row.Name].NightShift += 1;
            }
        });
        return agg;
    }, [data]);

    const agents = Object.keys(stats).sort();

    // Handlers for Presets
    const setMonthRange = () => {
        setDateRange({
            start: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
            end: format(endOfMonth(currentDate), 'yyyy-MM-dd')
        });
    };

    const setWeekRange = () => {
        const start = startOfWeek(new Date(), { weekStartsOn: 1 });
        const end = endOfWeek(new Date(), { weekStartsOn: 1 });
        setDateRange({
            start: format(start, 'yyyy-MM-dd'),
            end: format(end, 'yyyy-MM-dd')
        });
    };

    // Export CSV
    const handleExportCSV = () => {
        const headers = ['Agent', 'On Call', 'Night Shift', ...statusTypes, 'Total'];
        const rows = agents.map(agent => {
            return [
                agent,
                stats[agent].OnCall,
                stats[agent].NightShift,
                ...statusTypes.map(t => stats[agent][t] || 0),
                stats[agent].Total
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

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
        <div className="summary-page" style={{ color: 'var(--text-primary)' }}>
            <div className="summary-header">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <h2>Summary</h2>
                    {headerAction}
                    <div className="filter-controls">
                        <button className="btn-filter" onClick={setMonthRange}>Current Month</button>
                        <button className="btn-filter" onClick={setWeekRange}>This Week</button>
                    </div>
                    {loading && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}><Loader className="spin" size={14} /> Loading Data...</span>}
                </div>

                <div className="custom-range-inputs">
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Range:</span>
                    <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="form-input date-input"
                        style={{ colorScheme: 'dark' }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                    <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="form-input date-input"
                        style={{ colorScheme: 'dark' }}
                    />
                    <button className="btn btn-primary" onClick={handleExportCSV} style={{ padding: '0.5rem', marginLeft: '0.5rem' }}>
                        <Download size={16} />
                    </button>
                </div>
            </div>

            <div className="summary-table-wrapper">
                <table className="roster-table summary-table">
                    <thead>
                        <tr>
                            <th className="sticky-col text-left" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Agent</th>
                            <th className="text-center" style={{ color: 'var(--accent-warning)' }}>On Call</th>
                            <th className="text-center" style={{ color: '#818cf8' }}>Night</th>
                            {statusTypes.map(type => (
                                <th key={type} className="text-center" style={{ color: 'var(--text-secondary)' }}>{type}</th>
                            ))}
                            <th className="text-center" style={{ color: 'var(--text-primary)' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.map(agent => (
                            <tr key={agent} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td className="sticky-col agent-cell" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{agent}</td>

                                {/* On Call Column */}
                                <td className="text-center">
                                    <span style={{
                                        fontWeight: '700',
                                        color: stats[agent].OnCall > 0 ? 'var(--accent-warning)' : 'var(--text-muted)'
                                    }}>
                                        {stats[agent].OnCall || '-'}
                                    </span>
                                </td>

                                {/* Night Shift Column */}
                                <td className="text-center">
                                    <span style={{
                                        fontWeight: '700',
                                        color: stats[agent].NightShift > 0 ? '#818cf8' : 'var(--text-muted)'
                                    }}>
                                        {stats[agent].NightShift || '-'}
                                    </span>
                                </td>

                                {statusTypes.map(type => (
                                    <td key={type} className="text-center">
                                        <span style={{
                                            color: stats[agent][type] ? 'var(--text-primary)' : 'var(--text-muted)',
                                            fontWeight: stats[agent][type] ? '500' : '400'
                                        }}>
                                            {stats[agent][type] || '-'}
                                        </span>
                                    </td>
                                ))}

                                <td className="text-center font-bold" style={{ color: 'var(--text-primary)' }}>{stats[agent].Total}</td>
                            </tr>
                        ))}
                        {!loading && agents.length === 0 && (
                            <tr>
                                <td colSpan={statusTypes.length + 4} className="text-center py-8 text-muted">
                                    No data found for this period.
                                </td>
                            </tr>
                        )}
                        {loading && agents.length === 0 && (
                            <tr>
                                <td colSpan={statusTypes.length + 4} className="text-center py-12 text-muted">
                                    <Loader className="spin" style={{ margin: '0 auto', marginBottom: '0.5rem' }} />
                                    Fetching stats...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Summary;
