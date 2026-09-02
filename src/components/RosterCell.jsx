import { memo } from 'react';
import { normalizeStatus } from '../lib/status';
import { cx } from '../lib/utils';
import CellEditor from './CellEditor';

function RosterCellImpl({ status, day, isAdmin, selected, editing, teamShifts, onSelect, onOpen, onCommit, onCancel }) {
    const n = normalizeStatus(status, { weekend: day.weekend });
    const label = n.kind === 'empty' ? '–' : n.value;
    return (
        <td
            className={cx('roster-cell', `kind-${n.kind}`, n.period && `period-${n.period}`, day.weekend && 'is-weekend', day.isToday && 'is-today', selected && 'is-selected', editing && 'is-editing', isAdmin && 'is-editable')}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onDoubleClick={(e) => { e.stopPropagation(); if (isAdmin) onOpen(); }}
            title={status && status !== n.value ? `Stored as "${status}"` : undefined}
            data-date={day.iso}
        >
            {editing ? (
                <CellEditor value={status} teamShifts={teamShifts} weekend={day.weekend} onCommit={onCommit} onCancel={onCancel} />
            ) : (
                <span className="cell-text">{label}</span>
            )}
        </td>
    );
}

const RosterCell = memo(RosterCellImpl);
export default RosterCell;
