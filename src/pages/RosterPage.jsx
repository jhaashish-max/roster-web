import { useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, PlusCircle, Table as TableIcon, Trash2 } from 'lucide-react';
import { addMonths, subMonths } from 'date-fns';
import RosterGrid from '../components/RosterGrid';
import Legend from '../components/Legend';
import LivePresence from '../components/LivePresence';
import { GridSkeleton } from '../components/Skeleton';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { monthDays, monthLabel, todayISO } from '../lib/dates';
import { buildGroups } from '../lib/groups';

export default function RosterPage({ rows, loading, currentDate, onChangeDate, isAdmin, teams, features, shiftConfigs = [], currentUser, onCellUpdate, onOpenGenerator, onOpenDelete, onMoveMember, headerAction, selectedTeams = [] }) {
    const [zoom, setZoom] = useLocalStorage('roster_zoom', 1);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    const days = useMemo(() => {
        const today = todayISO();
        return monthDays(year, month).map((d) => ({ ...d, isToday: d.iso === today }));
    }, [year, month]);

    // "All teams" hides teams that have no roster this month; an explicit selection shows them with "Not set" rows.
    const showEmptyTeams = selectedTeams.length > 0;
    const groups = useMemo(() => buildGroups(rows, teams, { showEmptyTeams, onlyTeams: selectedTeams }), [rows, teams, showEmptyTeams, selectedTeams]);
    const hiddenTeams = useMemo(() => {
        if (showEmptyTeams) return [];
        const withRows = new Set(rows.map((r) => r.Team));
        return teams.filter((t) => !t.archived && !withRows.has(t.name)).map((t) => t.name);
    }, [rows, teams, showEmptyTeams]);

    const shiftOptionsByTeam = useMemo(() => {
        const out = {};
        teams.forEach((t) => {
            out[t.name] = shiftConfigs.filter((c) => c.team_id === t.id).map((c) => c.shift_name).filter(Boolean);
        });
        return out;
    }, [teams, shiftConfigs]);

    return (
        <div className="page page-roster">
            <div className="card toolbar">
                <div className="toolbar-left">{headerAction}</div>
                <div className="toolbar-center">
                    <div className="date-nav">
                        <button type="button" className="icon-btn" onClick={() => onChangeDate(subMonths(currentDate, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
                        <div className="date-display"><Calendar size={16} aria-hidden="true" />{monthLabel(year, month)}</div>
                        <button type="button" className="icon-btn" onClick={() => onChangeDate(addMonths(currentDate, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
                    </div>
                </div>
                <div className="toolbar-right">
                    {isAdmin && (
                        <>
                            <button type="button" className="btn btn-primary" onClick={onOpenGenerator}><PlusCircle size={16} aria-hidden="true" /> Generate</button>
                            {rows.length > 0 && (
                                <button type="button" className="btn btn-secondary text-danger" onClick={onOpenDelete} aria-label="Delete a month"><Trash2 size={16} /></button>
                            )}
                        </>
                    )}
                    {currentUser && <LivePresence currentUser={currentUser} showCount={false} />}
                    <label className="zoom-control" title="Zoom">
                        <span className="muted small">{Math.round(zoom * 100)}%</span>
                        <input type="range" min="0.5" max="1.5" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} aria-label="Table zoom" />
                    </label>
                </div>
            </div>

            <div className="card legend-card">
                <Legend />
                {isAdmin && <span className="muted small legend-hint">Click a cell and press Enter to edit · Delete clears · arrows move</span>}
            </div>

            {loading ? (
                <GridSkeleton cols={Math.min(days.length, 14)} />
            ) : groups.length === 0 ? (
                <div className="card empty-state-large">
                    <TableIcon size={32} aria-hidden="true" />
                    <h3>No roster found</h3>
                    <p>Generate a new roster for {monthLabel(year, month)}{isAdmin ? ' or start filling cells once a team is created' : ''}.</p>
                </div>
            ) : (
                <>
                    <RosterGrid
                        groups={groups}
                        days={days}
                        isAdmin={isAdmin}
                        zoom={zoom}
                        shiftOptionsByTeam={shiftOptionsByTeam}
                        onCellUpdate={onCellUpdate}
                        onMoveMember={features?.moveMember ? onMoveMember : undefined}
                    />
                    {hiddenTeams.length > 0 && (
                        <p className="muted small hidden-teams-note">
                            No roster for {monthLabel(year, month)} yet: {hiddenTeams.join(', ')}. Pick a team from the filter to fill it in.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
