import { useState, useMemo, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO, startOfMonth, endOfMonth, isWeekend, eachMonthOfInterval, eachDayOfInterval } from 'date-fns';
import { Download, Loader2, CalendarDays, Users, Clock } from 'lucide-react';
import { fetchRoster, fetchAllTeamsRoster } from '../lib/api';
import XLSX from 'xlsx-js-style';

const Summary = ({ currentDate, selectedTeam, viewMode, headerAction, teams = [], selectedTeams = [] }) => {
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
        end: format(endOfMonth(currentDate), 'yyyy-MM-dd')
    });

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activePreset, setActivePreset] = useState('month');
    const [activeSubTab, setActiveSubTab] = useState('analytics');

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

    // Headcount data per team per day
    const headcountByTeam = useMemo(() => {
        if (!teams.length) return {};

        const start = parseISO(dateRange.start);
        const end = parseISO(dateRange.end);
        const allDates = eachDayOfInterval({ start, end });

        // Group roster data by team
        const byTeam = {};
        data.forEach(row => {
            const team = row.Team || '';
            if (!byTeam[team]) byTeam[team] = [];
            byTeam[team].push(row);
        });

        // Teams to show
        const teamsToProcess = selectedTeams.length > 0
            ? teams.filter(t => selectedTeams.includes(t.name))
            : teams;

        const result = {};
        teamsToProcess.forEach(team => {
            const teamRows = byTeam[team.name] || [];
            const totalHC = team.members ? team.members.length : 0;

            const dailyData = allDates.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const dayRows = teamRows.filter(r => r.Date === dateStr);

                const rosteredHC = new Set(dayRows.map(r => r.Name)).size;

                const presentHC = dayRows.filter(r => {
                    const s = (r.Status || '').trim();
                    if (!s || s === '-' || s === 'x') return false;
                    const upper = s.toUpperCase();
                    return s.includes(':') || upper === 'WFH' || upper === 'AVAILABLE';
                }).length;

                const woff = dayRows.filter(r => r.Status === 'WO').length;
                const pl = dayRows.filter(r => ['PL', 'SL'].includes(r.Status)).length;
                const wl = dayRows.filter(r => r.Status === 'WL').length;

                // Shrinkage formulas:
                // Planned = (PL + WOFF) / Total HC
                // Unplanned (WL) = WL / Rostered HC
                // Overall = Planned + Unplanned
                const shrinkagePlanned = totalHC > 0 ? (pl + woff) / totalHC * 100 : 0;
                const shrinkageUnplanned = rosteredHC > 0 ? wl / rosteredHC * 100 : 0;
                const shrinkageOverall = shrinkagePlanned + shrinkageUnplanned;

                return { date, dateStr, rosteredHC, presentHC, woff, pl, wl, shrinkagePlanned, shrinkageUnplanned, shrinkageOverall };
            });

            result[team.name] = { totalHC, dailyData };
        });

        return result;
    }, [data, teams, selectedTeams, dateRange]);

    const headcountTeamNames = Object.keys(headcountByTeam);

    const getShrinkageCellClass = (value) => {
        if (value === 0) return 'hc-shrink-zero';
        if (value <= 10) return 'hc-shrink-low';
        if (value <= 25) return 'hc-shrink-mid';
        return 'hc-shrink-high';
    };

    // Export Headcount to Excel
    const handleExportHeadcountXL = () => {
        const wb = XLSX.utils.book_new();

        // Shared styles
        const border = {
            top: { style: 'thin', color: { rgb: 'D0D5DD' } },
            bottom: { style: 'thin', color: { rgb: 'D0D5DD' } },
            left: { style: 'thin', color: { rgb: 'D0D5DD' } },
            right: { style: 'thin', color: { rgb: 'D0D5DD' } },
        };
        const headerFill = { fgColor: { rgb: '1F3864' } };
        const headerFont = { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' };
        const metricFont = { bold: true, sz: 10, name: 'Calibri', color: { rgb: '1F3864' } };
        const dataFont = { sz: 10, name: 'Calibri' };
        const centerAlign = { horizontal: 'center', vertical: 'center' };
        const leftAlign = { horizontal: 'left', vertical: 'center' };
        const weekendFill = { fgColor: { rgb: 'F2F4F7' } };
        const teamHeaderFill = { fgColor: { rgb: 'E8ECF4' } };
        const teamHeaderFont = { bold: true, sz: 11, name: 'Calibri', color: { rgb: '1F3864' } };

        const shrinkFills = {
            zero: { fgColor: { rgb: 'DCFCE7' } },
            low: { fgColor: { rgb: 'FEF9C3' } },
            mid: { fgColor: { rgb: 'FFEDD5' } },
            high: { fgColor: { rgb: 'FEE2E2' } },
        };
        const shrinkFonts = {
            zero: { sz: 10, name: 'Calibri', bold: true, color: { rgb: '166534' } },
            low: { sz: 10, name: 'Calibri', bold: true, color: { rgb: '92400E' } },
            mid: { sz: 10, name: 'Calibri', bold: true, color: { rgb: 'C2410C' } },
            high: { sz: 10, name: 'Calibri', bold: true, color: { rgb: 'B91C1C' } },
        };
        const getShrinkStyle = (val) => {
            if (val === 0) return { fill: shrinkFills.zero, font: shrinkFonts.zero };
            if (val <= 10) return { fill: shrinkFills.low, font: shrinkFonts.low };
            if (val <= 25) return { fill: shrinkFills.mid, font: shrinkFonts.mid };
            return { fill: shrinkFills.high, font: shrinkFonts.high };
        };

        const weekendFont = { sz: 9, name: 'Calibri', italic: true, color: { rgb: '98A2B3' } };
        const metricLabels = ['Total HC', 'Rostered HC', 'Present HC', 'WOFF', 'PL', 'WL', 'Shrinkage - Overall', 'Shrinkage - Planned', 'Shrinkage - Unplanned (WL)'];
        const shrinkageKeys = ['shrinkageOverall', 'shrinkagePlanned', 'shrinkageUnplanned'];
        const BLANK_ROWS = 3;

        // Build all rows for every team on a single sheet
        const allRows = [];
        const merges = [];
        const rowHeights = [];
        let numDateCols = 0;

        headcountTeamNames.forEach((teamName, teamIdx) => {
            const { totalHC, dailyData } = headcountByTeam[teamName];
            numDateCols = Math.max(numDateCols, dailyData.length);

            // 3 blank rows between teams (not before the first)
            if (teamIdx > 0) {
                for (let b = 0; b < BLANK_ROWS; b++) {
                    allRows.push([]);
                    rowHeights.push({ hpt: 16 });
                }
            }

            const teamStartRow = allRows.length;

            // Team name header row
            const teamRow = [{ v: teamName, s: { font: teamHeaderFont, fill: teamHeaderFill, alignment: leftAlign, border } }];
            for (let i = 0; i < dailyData.length; i++) {
                teamRow.push({ v: '', s: { fill: teamHeaderFill, border } });
            }
            allRows.push(teamRow);
            rowHeights.push({ hpt: 26 });
            merges.push({ s: { r: teamStartRow, c: 0 }, e: { r: teamStartRow, c: dailyData.length } });

            // Date header row
            const headerRow = [{ v: 'HC', s: { font: headerFont, fill: headerFill, alignment: centerAlign, border } }];
            dailyData.forEach(d => {
                const weekend = isWeekend(d.date);
                headerRow.push({
                    v: `${format(d.date, 'M/d/yy')}\n${format(d.date, 'EEEE')}`,
                    s: {
                        font: { ...headerFont, sz: 9 },
                        fill: weekend ? { fgColor: { rgb: '2D4A7A' } } : headerFill,
                        alignment: { ...centerAlign, wrapText: true },
                        border,
                    }
                });
            });
            allRows.push(headerRow);
            rowHeights.push({ hpt: 36 });

            // Metric data rows
            metricLabels.forEach((label, idx) => {
                const row = [{
                    v: label,
                    s: { font: metricFont, alignment: leftAlign, border, fill: { fgColor: { rgb: 'F8FAFC' } } }
                }];

                dailyData.forEach(d => {
                    const weekend = isWeekend(d.date);
                    const isShrinkage = idx >= 6;

                    if (isShrinkage) {
                        const key = shrinkageKeys[idx - 6];
                        if (weekend) {
                            row.push({
                                v: 'Weekend',
                                s: { font: weekendFont, fill: weekendFill, alignment: centerAlign, border }
                            });
                        } else {
                            const val = d[key];
                            const style = getShrinkStyle(val);
                            row.push({
                                v: val / 100,
                                t: 'n',
                                z: '0.00%',
                                s: { font: style.font, fill: style.fill, alignment: centerAlign, border }
                            });
                        }
                    } else {
                        let val;
                        switch (idx) {
                            case 0: val = totalHC; break;
                            case 1: val = d.rosteredHC; break;
                            case 2: val = d.presentHC; break;
                            case 3: val = d.woff || ''; break;
                            case 4: val = d.pl || ''; break;
                            case 5: val = d.wl || ''; break;
                        }
                        row.push({
                            v: val,
                            t: typeof val === 'number' ? 'n' : 's',
                            s: {
                                font: dataFont,
                                fill: weekend ? weekendFill : { fgColor: { rgb: 'FFFFFF' } },
                                alignment: centerAlign,
                                border,
                            }
                        });
                    }
                });
                allRows.push(row);
                rowHeights.push({ hpt: 22 });
            });
        });

        const ws = XLSX.utils.aoa_to_sheet(allRows);
        ws['!cols'] = [{ wch: 26 }, ...Array(numDateCols).fill({ wch: 14 })];
        ws['!rows'] = rowHeights;
        ws['!merges'] = merges;

        XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
        XLSX.writeFile(wb, `headcount_${dateRange.start}_${dateRange.end}.xlsx`);
    };

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
                    {activeSubTab === 'analytics' && (
                        <button className="summary-export-btn" onClick={handleExportCSV} title="Export CSV">
                            <Download size={16} />
                        </button>
                    )}
                    {activeSubTab === 'headcount' && headcountTeamNames.length > 0 && (
                        <button className="summary-export-btn" onClick={handleExportHeadcountXL} title="Export to Excel">
                            <Download size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="summary-subtabs">
                <button
                    className={`summary-subtab-btn ${activeSubTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('analytics')}
                >
                    Analytics
                </button>
                <button
                    className={`summary-subtab-btn ${activeSubTab === 'headcount' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('headcount')}
                >
                    Headcount
                </button>
            </div>

            {/* Analytics Tab */}
            {activeSubTab === 'analytics' && (
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
            )}

            {/* Headcount Tab */}
            {activeSubTab === 'headcount' && (
                loading && headcountTeamNames.length === 0 ? (
                    <div className="summary-table-card">
                        <div className="summary-loading">
                            <Loader2 size={28} className="spin" />
                            <p>Fetching headcount data...</p>
                        </div>
                    </div>
                ) : headcountTeamNames.length === 0 ? (
                    <div className="summary-table-card">
                        <div className="summary-empty">
                            <Users size={40} />
                            <p>No headcount data found for this period.</p>
                        </div>
                    </div>
                ) : (
                    <div className="hc-teams-container">
                        {headcountTeamNames.map(teamName => {
                            const { totalHC, dailyData } = headcountByTeam[teamName];
                            const todayStr = format(new Date(), 'yyyy-MM-dd');
                            return (
                                <div key={teamName} className="hc-team-card">
                                    <div className="hc-team-header">{teamName}</div>
                                    <div className="hc-table-wrap">
                                        <table className="hc-table">
                                            <thead>
                                                <tr>
                                                    <th className="hc-th-metric">HC</th>
                                                    {dailyData.map(d => {
                                                        const isCurrent = d.dateStr === todayStr;
                                                        const weekend = isWeekend(d.date);
                                                        return (
                                                            <th key={d.dateStr} className={`hc-th-date${isCurrent ? ' hc-today' : ''}${weekend ? ' hc-weekend' : ''}`}>
                                                                <span className="hc-date-num">{format(d.date, 'M/d/yy')}</span>
                                                                <span className="hc-day-name">{format(d.date, 'EEEE')}</span>
                                                            </th>
                                                        );
                                                    })}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* HC counts group */}
                                                <tr className="hc-row">
                                                    <td className="hc-metric-label">Total HC</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{totalHC}</td>)}
                                                </tr>
                                                <tr className="hc-row">
                                                    <td className="hc-metric-label">Rostered HC</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{d.rosteredHC}</td>)}
                                                </tr>
                                                <tr className="hc-row hc-row-last">
                                                    <td className="hc-metric-label">Present HC</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{d.presentHC}</td>)}
                                                </tr>
                                                {/* Absence breakdown group */}
                                                <tr className="hc-row hc-group-start">
                                                    <td className="hc-metric-label">WOFF</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{d.woff || ''}</td>)}
                                                </tr>
                                                <tr className="hc-row">
                                                    <td className="hc-metric-label">PL</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{d.pl || ''}</td>)}
                                                </tr>
                                                <tr className="hc-row hc-row-last">
                                                    <td className="hc-metric-label">WL</td>
                                                    {dailyData.map(d => <td key={d.dateStr} className={`hc-td${d.dateStr === todayStr ? ' hc-today' : ''}${isWeekend(d.date) ? ' hc-weekend' : ''}`}>{d.wl || ''}</td>)}
                                                </tr>
                                                {/* Shrinkage group */}
                                                {[
                                                    { label: 'Shrinkage - Overall', key: 'shrinkageOverall', first: true },
                                                    { label: 'Shrinkage - Planned', key: 'shrinkagePlanned' },
                                                    { label: 'Shrinkage - Unplanned (WL)', key: 'shrinkageUnplanned' },
                                                ].map(({ label, key, first }) => (
                                                    <tr key={key} className={`hc-row hc-shrinkage-row${first ? ' hc-group-start' : ''}`}>
                                                        <td className="hc-metric-label hc-shrinkage-label">{label}</td>
                                                        {dailyData.map(d => {
                                                            const weekend = isWeekend(d.date);
                                                            const today = d.dateStr === todayStr;
                                                            if (weekend) {
                                                                return (
                                                                    <td key={d.dateStr} className={`hc-td hc-shrink-weekend${today ? ' hc-today' : ''}`}>
                                                                        Weekend
                                                                    </td>
                                                                );
                                                            }
                                                            return (
                                                                <td key={d.dateStr} className={`hc-td hc-shrink-cell ${getShrinkageCellClass(d[key])}${today ? ' hc-today' : ''}`}>
                                                                    {d[key].toFixed(2)}%
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {loading && (
                                        <div className="summary-loading-bar">
                                            <Loader2 size={14} className="spin" /> Updating...
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
};

export default Summary;
