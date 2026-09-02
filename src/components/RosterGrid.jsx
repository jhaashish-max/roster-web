import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, MoreHorizontal } from 'lucide-react';
import RosterCell from './RosterCell';
import { cx } from '../lib/utils';

/**
 * Spreadsheet-like roster grid, one table per team.
 *
 * @param {object} props
 * @param {Array<{ team: string, teamId?: string, agents: string[], unrostered: string[], map: Record<string, Record<string,string>> }>} props.groups
 * @param {Array<{ iso: string, day: number, weekday: string, weekend: boolean, isToday?: boolean }>} props.days
 * @param {(date:string, name:string, status:string, team:string) => void} props.onCellUpdate  status '' means "clear"
 * @param {(name:string, team:string) => void} [props.onMoveMember]
 * @param {Record<string, string[]>} [props.shiftOptionsByTeam]  team name → shift names
 */
export default function RosterGrid({ groups, days, isAdmin = false, onCellUpdate, onMoveMember, shiftOptionsByTeam = {}, zoom = 1 }) {
    const [selection, setSelection] = useState(null); // { type: 'cell'|'row'|'col', team, name, date }
    const [editing, setEditing] = useState(null);     // { team, name, date }
    const [menuFor, setMenuFor] = useState(null);     // `${team}::${name}`
    const containerRef = useRef(null);

    const dayIndex = useMemo(() => new Map(days.map((d, i) => [d.iso, i])), [days]);
    const groupRows = useMemo(() => groups.map((g) => [...g.agents, ...g.unrostered]), [groups]);

    const clearSelection = useCallback(() => { setSelection(null); setMenuFor(null); }, []);

    useEffect(() => {
        if (!menuFor) return undefined;
        const close = (e) => { if (!containerRef.current?.contains(e.target)) setMenuFor(null); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuFor]);

    const moveSelection = useCallback((dRow, dCol) => {
        setSelection((sel) => {
            if (!sel || sel.type !== 'cell') return sel;
            const gi = groups.findIndex((g) => g.team === sel.team);
            if (gi === -1) return sel;
            const rows = groupRows[gi];
            const ri = rows.indexOf(sel.name);
            const ci = dayIndex.get(sel.date);
            if (ri === -1 || ci === undefined) return sel;
            const nr = Math.min(Math.max(ri + dRow, 0), rows.length - 1);
            const nc = Math.min(Math.max(ci + dCol, 0), days.length - 1);
            return { type: 'cell', team: sel.team, name: rows[nr], date: days[nc].iso };
        });
    }, [groups, groupRows, dayIndex, days]);

    const onKeyDown = (e) => {
        if (editing) return; // the editor handles its own keys
        if (!selection || selection.type !== 'cell') return;
        const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (map[e.key]) {
            e.preventDefault();
            moveSelection(...map[e.key]);
            return;
        }
        if (!isAdmin) return;
        if (e.key === 'Enter' || e.key === 'F2') {
            e.preventDefault();
            setEditing({ team: selection.team, name: selection.name, date: selection.date });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onCellUpdate(selection.date, selection.name, '', selection.team);
        } else if (e.key === 'Escape') {
            clearSelection();
        } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            // start typing straight into the cell
            setEditing({ team: selection.team, name: selection.name, date: selection.date });
        }
    };

    const isCellSelected = (team, name, date) => {
        if (!selection || selection.team !== team) return false;
        if (selection.type === 'cell') return selection.name === name && selection.date === date;
        if (selection.type === 'row') return selection.name === name;
        if (selection.type === 'col') return selection.date === date;
        return false;
    };
    const isRowSelected = (team, name) => selection?.type === 'row' && selection.team === team && selection.name === name;
    const isColSelected = (team, date) => selection?.type === 'col' && selection.team === team && selection.date === date;

    return (
        <div
            ref={containerRef}
            className="roster-groups"
            onClick={clearSelection}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="grid"
            aria-label="Roster"
            aria-multiselectable="false"
        >
            {groups.map((group) => {
                const rows = [...group.agents.map((a) => ({ name: a, unrostered: false })), ...group.unrostered.map((a) => ({ name: a, unrostered: true }))];
                const teamShifts = shiftOptionsByTeam[group.team] || [];
                return (
                    <section key={group.team || 'single'} className="card roster-team-card">
                        {group.team && (
                            <header className="roster-team-head">
                                <span className="roster-team-name">{group.team}</span>
                                <span className="roster-team-meta">{rows.length} {rows.length === 1 ? 'person' : 'people'}{group.archived ? ' · archived' : ''}</span>
                            </header>
                        )}
                        <div className="roster-table-wrap">
                            <table className="roster-table" style={{ zoom }}>
                                <thead>
                                    <tr>
                                        <th className="sticky-col corner-cell" scope="col">Agent</th>
                                        {days.map((d) => (
                                            <th
                                                key={d.iso}
                                                scope="col"
                                                className={cx('day-head', d.weekend && 'is-weekend', d.isToday && 'is-today', isColSelected(group.team, d.iso) && 'is-selected')}
                                                onClick={(e) => { e.stopPropagation(); setSelection({ type: 'col', team: group.team, name: null, date: d.iso }); }}
                                            >
                                                <span className="day-num">{d.day}</span>
                                                <span className="day-name">{d.weekday}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(({ name, unrostered }) => {
                                        const menuKey = `${group.team}::${name}`;
                                        return (
                                            <tr key={menuKey} className={cx(isRowSelected(group.team, name) && 'is-selected', unrostered && 'is-unrostered')}>
                                                <th
                                                    scope="row"
                                                    className={cx('sticky-col agent-cell', isRowSelected(group.team, name) && 'is-selected')}
                                                    onClick={(e) => { e.stopPropagation(); setSelection({ type: 'row', team: group.team, name, date: null }); }}
                                                >
                                                    <div className="agent-cell-inner">
                                                        <span className="agent-name">{name}</span>
                                                        {unrostered && <span className="tag tag-muted">Not set</span>}
                                                        {isAdmin && onMoveMember && (
                                                            <span className="row-menu-anchor">
                                                                <button
                                                                    type="button"
                                                                    className="icon-btn icon-btn-sm row-menu-btn"
                                                                    aria-label={`Actions for ${name}`}
                                                                    aria-haspopup="menu"
                                                                    aria-expanded={menuFor === menuKey}
                                                                    onClick={(e) => { e.stopPropagation(); setMenuFor((m) => (m === menuKey ? null : menuKey)); }}
                                                                >
                                                                    <MoreHorizontal size={14} />
                                                                </button>
                                                                {menuFor === menuKey && (
                                                                    <div className="row-menu" role="menu">
                                                                        <button type="button" role="menuitem" className="row-menu-item" onClick={(e) => { e.stopPropagation(); setMenuFor(null); onMoveMember(name, group.team); }}>
                                                                            <ArrowRightLeft size={14} /> Move to another team…
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </th>
                                                {days.map((d) => {
                                                    const status = group.map[name]?.[d.iso] || '';
                                                    const isEditing = !!editing && editing.team === group.team && editing.name === name && editing.date === d.iso;
                                                    return (
                                                        <RosterCell
                                                            key={d.iso}
                                                            status={status}
                                                            day={d}
                                                            isAdmin={isAdmin}
                                                            selected={isCellSelected(group.team, name, d.iso)}
                                                            editing={isEditing}
                                                            teamShifts={teamShifts}
                                                            onSelect={() => { setMenuFor(null); setSelection({ type: 'cell', team: group.team, name, date: d.iso }); }}
                                                            onOpen={() => setEditing({ team: group.team, name, date: d.iso })}
                                                            onCommit={(val) => {
                                                                setEditing(null);
                                                                if ((val || '') !== (status || '')) onCellUpdate(d.iso, name, val, group.team);
                                                                containerRef.current?.focus();
                                                            }}
                                                            onCancel={() => { setEditing(null); containerRef.current?.focus(); }}
                                                        />
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
