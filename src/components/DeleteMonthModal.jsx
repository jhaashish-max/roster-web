import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import Modal from './Modal';

/**
 * Delete a whole month for one team. The team defaults to the single selected team;
 * when several teams are visible the user must choose explicitly.
 */
export default function DeleteMonthModal({ open, teams, defaultTeam = '', monthLabel, rowCountByTeam = {}, busy = false, onClose, onConfirm }) {
    const [team, setTeam] = useState(defaultTeam);
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) { // re-seed the selection each time the dialog opens
        setWasOpen(open);
        if (open) setTeam(defaultTeam);
    }
    const rows = rowCountByTeam[team];

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Delete roster month"
            icon={<Trash2 size={20} className="text-danger" />}
            size="sm"
            busy={busy}
            footer={(
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-danger" onClick={() => onConfirm(team)} disabled={!team || busy}>
                        {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                        Delete {monthLabel}
                    </button>
                </>
            )}
        >
            <label className="field">
                <span className="field-label">Team</span>
                <select className="input" value={team} onChange={(e) => setTeam(e.target.value)} data-autofocus>
                    <option value="">Choose a team…</option>
                    {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
            </label>
            <p className="modal-text">
                This removes every roster cell of <strong>{team || '…'}</strong> for <strong>{monthLabel}</strong>
                {typeof rows === 'number' ? <> ({rows} {rows === 1 ? 'row' : 'rows'})</> : null}. It cannot be undone.
            </p>
        </Modal>
    );
}
