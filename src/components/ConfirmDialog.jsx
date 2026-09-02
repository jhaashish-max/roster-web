import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Modal from './Modal';

/**
 * Confirmation dialog. `requireText` forces the user to type that exact text (e.g. a team name)
 * before the destructive button enables.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false, requireText, onConfirm, onCancel, children }) {
    const [typed, setTyped] = useState('');
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) { // reset the typed confirmation whenever the dialog closes
        setWasOpen(open);
        if (!open) setTyped('');
    }
    const blocked = !!requireText && typed.trim() !== requireText;

    return (
        <Modal
            open={open}
            onClose={onCancel}
            title={title}
            icon={danger ? <AlertTriangle size={20} className="text-danger" /> : null}
            size="sm"
            busy={busy}
            footer={(
                <>
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
                    <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={busy || blocked} data-autofocus={!requireText || undefined}>
                        {busy && <Loader2 size={16} className="spin" aria-hidden="true" />}
                        {confirmLabel}
                    </button>
                </>
            )}
        >
            {message && <p className="modal-text">{message}</p>}
            {children}
            {requireText && (
                <label className="field">
                    <span className="field-label">Type <strong>{requireText}</strong> to confirm</span>
                    <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={requireText} data-autofocus autoComplete="off" />
                </label>
            )}
        </Modal>
    );
}
