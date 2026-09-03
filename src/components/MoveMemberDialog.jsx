import { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { moveTeamMember } from '../lib/api';
import { firstOfNextMonthISO, isValidISODate, formatISO } from '../lib/dates';
import { useToast } from '../hooks/useToast';

/** Move one person from a team to another as of an effective date (v2 API only). */
export default function MoveMemberDialog({ open, name, fromTeam, teams, onClose, onMoved }) {
    const toast = useToast();
    const [toTeam, setToTeam] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(firstOfNextMonthISO());
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (open) { setToTeam(''); setEffectiveDate(firstOfNextMonthISO()); setBusy(false); setResult(null); }
    }, [open, name, fromTeam]);

    const candidates = teams.filter((t) => t.name !== fromTeam && !t.archived);
    const valid = !!toTeam && isValidISODate(effectiveDate);

    const submit = async () => {
        if (!valid) return;
        setBusy(true);
        try {
            const res = await moveTeamMember({ name, from_team: fromTeam, to_team: toTeam, effective_date: effectiveDate });
            setResult(res);
            toast.success(`${name} moved to ${toTeam} from ${formatISO(effectiveDate)}`);
            onMoved?.(res);
        } catch (err) {
            toast.error(err.message || 'Move failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Move to another team"
            subtitle={`${name} · currently in ${fromTeam}`}
            icon={<ArrowRightLeft size={20} />}
            size="sm"
            busy={busy}
            footer={result ? (
                <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
            ) : (
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
                        {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <ArrowRightLeft size={16} aria-hidden="true" />}
                        Move member
                    </button>
                </>
            )}
        >
            {result ? (
                <div className="stack">
                    <p className="modal-text">Done. {result.rowsMoved ?? 0} roster {result.rowsMoved === 1 ? 'row' : 'rows'} moved to <strong>{toTeam}</strong>{result.rowsDropped ? `, ${result.rowsDropped} duplicate rows dropped` : ''}.</p>
                    <p className="muted small">History before {formatISO(effectiveDate)} stays under {fromTeam}.</p>
                </div>
            ) : (
                <div className="stack">
                    <label className="field">
                        <span className="field-label">New team</span>
                        <select className="input" value={toTeam} onChange={(e) => setToTeam(e.target.value)} data-autofocus>
                            <option value="">Choose a team…</option>
                            {candidates.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                    </label>
                    <label className="field">
                        <span className="field-label">Effective from</span>
                        <input type="date" className="input" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                    </label>
                    <p className="muted small">
                        Membership changes immediately. Roster rows on or after the effective date move to the new team; earlier rows stay with {fromTeam} so history and reports are unchanged. Pending leave requests follow the person.
                    </p>
                </div>
            )}
        </Modal>
    );
}
