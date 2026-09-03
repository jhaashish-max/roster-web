import { useState } from 'react';
import { Loader2, Plus, Save, Settings, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { deleteShiftConfig, saveShiftConfigs } from '../lib/api';
import { normalizeStatus } from '../lib/status';
import { useToast } from '../hooks/useToast';

/** Per-team shift buffers used by the Freshdesk auto-enable job. */
export default function ShiftConfigModal({ open, team, configs, onClose, onConfigsUpdated }) {
    const toast = useToast();
    const [rows, setRows] = useState(() => configs.filter((c) => c.team_id === team?.id).map((c) => ({ ...c, _id: c.id || crypto.randomUUID() })));
    const [saving, setSaving] = useState(false);

    const add = () => setRows((prev) => [...prev, { _id: crypto.randomUUID(), team_id: team.id, shift_name: '', start_offset_mins: 0, end_offset_mins: 0, isNew: true }]);
    const update = (id, field, value) => setRows((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: value } : c)));

    const remove = async (config) => {
        if (config.isNew) { setRows((prev) => prev.filter((c) => c._id !== config._id)); return; }
        setSaving(true);
        try {
            await deleteShiftConfig(config.id);
            setRows((prev) => prev.filter((c) => c._id !== config._id));
            await onConfigsUpdated?.();
            toast.success('Shift configuration removed');
        } catch (err) {
            toast.error(err.message || 'Failed to delete configuration');
        } finally {
            setSaving(false);
        }
    };

    const save = async () => {
        const valid = rows.filter((c) => c.shift_name.trim());
        if (valid.length === 0 && rows.length > 0) { toast.error('Give every configuration a shift name'); return; }
        const payload = valid.map((c) => ({
            team_id: c.team_id,
            shift_name: normalizeStatus(c.shift_name).value || c.shift_name.trim(),
            start_offset_mins: Number(c.start_offset_mins) || 0,
            end_offset_mins: Number(c.end_offset_mins) || 0,
        }));
        setSaving(true);
        try {
            await saveShiftConfigs(payload);
            await onConfigsUpdated?.();
            toast.success('Shift configurations saved');
            onClose();
        } catch (err) {
            toast.error(err.message || 'Failed to save configurations');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Shift configurations"
            subtitle={team?.name}
            icon={<Settings size={20} />}
            size="md"
            busy={saving}
            footer={(
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                        {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} Save
                    </button>
                </>
            )}
        >
            <p className="muted small">Buffers are minutes relative to the shift: negative = before, positive = after.</p>
            <table className="table table-compact">
                <thead>
                    <tr><th>Shift</th><th className="num">Start buffer</th><th className="num">End buffer</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                    {rows.map((c) => {
                        const canon = normalizeStatus(c.shift_name).value;
                        return (
                            <tr key={c._id}>
                                <td>
                                    <input className="input" value={c.shift_name} onChange={(e) => update(c._id, 'shift_name', e.target.value)} placeholder="e.g. 09:00 - 18:00" disabled={saving} aria-label="Shift name" />
                                    {c.shift_name.trim() && canon && canon !== c.shift_name.trim() && <div className="muted small">Saves as {canon}</div>}
                                </td>
                                <td className="num"><input className="input input-num" type="number" value={c.start_offset_mins} onChange={(e) => update(c._id, 'start_offset_mins', e.target.value)} disabled={saving} aria-label="Start buffer minutes" /></td>
                                <td className="num"><input className="input input-num" type="number" value={c.end_offset_mins} onChange={(e) => update(c._id, 'end_offset_mins', e.target.value)} disabled={saving} aria-label="End buffer minutes" /></td>
                                <td className="num">
                                    <button type="button" className="icon-btn text-danger" onClick={() => remove(c)} disabled={saving} aria-label="Delete shift configuration"><Trash2 size={15} /></button>
                                </td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && <tr><td colSpan={4} className="muted center">No shift configurations yet.</td></tr>}
                </tbody>
            </table>
            <button type="button" className="btn btn-secondary btn-block btn-dashed" onClick={add} disabled={saving}>
                <Plus size={16} aria-hidden="true" /> Add shift configuration
            </button>
        </Modal>
    );
}
