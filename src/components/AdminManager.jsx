import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { addAdmin, listAdmins, removeAdmin } from '../lib/api';
import { isValidEmail } from '../lib/members';
import { useToast } from '../hooks/useToast';

export default function AdminManager({ open, onClose, currentEmail }) {
    const toast = useToast();
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState('');
    const [saving, setSaving] = useState(false);
    const [pendingRemove, setPendingRemove] = useState(null);

    const load = useCallback(async () => {
        try {
            setAdmins(await listAdmins());
        } catch (err) {
            toast.error(err.message || 'Failed to load admins');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { if (open) load(); }, [open, load]);

    const handleAdd = async (e) => {
        e.preventDefault();
        const email = newEmail.trim().toLowerCase();
        if (!isValidEmail(email)) { toast.error('Enter a valid e-mail address'); return; }
        setSaving(true);
        try {
            await addAdmin(email);
            setNewEmail('');
            toast.success(`${email} is now an admin`);
            await load();
        } catch (err) {
            toast.error(err.message || 'Failed to add admin');
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        const email = pendingRemove;
        setSaving(true);
        try {
            await removeAdmin(email);
            toast.success(`${email} removed`);
            setPendingRemove(null);
            await load();
        } catch (err) {
            toast.error(err.message || 'Failed to remove admin');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Modal open={open} onClose={onClose} title="Manage admins" subtitle="Admins can edit rosters, teams and approve requests" icon={<Users size={20} />} size="sm" footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
                <form onSubmit={handleAdd} className="inline-form">
                    <input type="email" className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@razorpay.com" disabled={saving} aria-label="New admin e-mail" data-autofocus />
                    <button type="submit" className="btn btn-primary" disabled={saving || !newEmail.trim()}>
                        {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Add
                    </button>
                </form>
                {loading ? (
                    <div className="center muted"><Loader2 size={20} className="spin" aria-label="Loading" /></div>
                ) : (
                    <ul className="list">
                        {admins.map((admin) => (
                            <li key={admin.id || admin.email} className="list-row">
                                <div>
                                    <div className="list-title">{admin.email}{admin.email === currentEmail && <span className="tag tag-muted">you</span>}</div>
                                    {admin.added_by && <div className="muted small">added by {admin.added_by}</div>}
                                </div>
                                <button type="button" className="icon-btn text-danger" onClick={() => setPendingRemove(admin.email)} disabled={admin.email === currentEmail || admins.length <= 1} aria-label={`Remove ${admin.email}`} title={admin.email === currentEmail ? 'You cannot remove yourself' : 'Remove admin'}>
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        ))}
                        {admins.length === 0 && <li className="muted">No admins yet</li>}
                    </ul>
                )}
            </Modal>
            <ConfirmDialog
                open={!!pendingRemove}
                title="Remove admin"
                message={`Remove ${pendingRemove} from the admin list? They keep read access.`}
                confirmLabel="Remove"
                danger
                busy={saving}
                onConfirm={handleRemove}
                onCancel={() => setPendingRemove(null)}
            />
        </>
    );
}
