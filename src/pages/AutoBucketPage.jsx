import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Clock, HelpCircle, Loader2, Phone, Plus, RefreshCw, Save, Settings, UserX } from 'lucide-react';
import AgentAvailability from '../components/AgentAvailability';
import ShiftConfigModal from '../components/ShiftConfigModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { CardSkeleton } from '../components/Skeleton';
import { addTeamMember, fetchRoster, getShiftConfigs, getTeamEmails, removeTeamMember, updateTeam, updateTeamEmails } from '../lib/api';
import { splitNameAndEmail, isValidMemberName, isValidEmail } from '../lib/members';
import { todayISO } from '../lib/dates';
import { useToast } from '../hooks/useToast';
import { cx } from '../lib/utils';

/** Freshdesk auto-enable configuration per member: e-mail, contact, buffers, plus add/remove members. */
export default function AutoBucketPage({ teams, reloadTeams, features }) {
    const toast = useToast();
    const activeTeams = useMemo(() => teams.filter((t) => !t.archived), [teams]);
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [memberEmails, setMemberEmails] = useState({});
    const [original, setOriginal] = useState({});
    const [shiftConfigs, setShiftConfigs] = useState([]);
    const [todayRows, setTodayRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [editingContact, setEditingContact] = useState(null);
    const [newMember, setNewMember] = useState('');
    const [pendingRemove, setPendingRemove] = useState(null);

    const selectedTeam = activeTeams.find((t) => t.id === selectedTeamId) || activeTeams[0] || null;
    const teamId = selectedTeam?.id || '';

    const loadConfig = useCallback(async () => {
        try {
            const [emails, configs] = await Promise.all([getTeamEmails(), getShiftConfigs()]);
            const map = {};
            (emails || []).forEach((e) => { map[e.name] = e; });
            setMemberEmails(map);
            setOriginal(JSON.parse(JSON.stringify(map)));
            setShiftConfigs(configs || []);
        } catch (err) {
            toast.error(err.message || 'Failed to load configuration');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    useEffect(() => {
        if (!selectedTeam) return undefined;
        let cancelled = false;
        const now = new Date();
        fetchRoster(now.getFullYear(), now.getMonth() + 1, selectedTeam.name)
            .then((rows) => { if (!cancelled) setTodayRows(rows.filter((r) => r.Date === todayISO())); })
            .catch(() => { /* today's shift is only a hint */ });
        return () => { cancelled = true; };
    }, [selectedTeam]);

    const updateConfig = (name, field, value) => {
        setMemberEmails((prev) => ({ ...prev, [name]: { ...(prev[name] || { name, email: '' }), [field]: value } }));
    };

    const dirty = useMemo(() => selectedTeam?.members.some((n) => JSON.stringify(memberEmails[n] || {}) !== JSON.stringify(original[n] || {})), [selectedTeam, memberEmails, original]);

    const save = async () => {
        if (!selectedTeam) return;
        const updates = selectedTeam.members.map((name) => {
            const c = memberEmails[name] || {};
            return {
                name,
                email: c.email ? c.email.trim().toLowerCase() : null,
                auto_enable_bucket: c.auto_enable_bucket ?? true,
                start_offset_mins: c.start_offset_mins ?? null,
                end_offset_mins: c.end_offset_mins ?? null,
                freshdesk_agent_id: c.freshdesk_agent_id || null,
                contact_number: c.contact_number || null,
            };
        });
        const bad = updates.find((u) => u.email && !isValidEmail(u.email));
        if (bad) { toast.error(`Invalid e-mail for ${bad.name}`); return; }
        setSaving(true);
        try {
            if (updates.length > 0) await updateTeamEmails(updates);
            toast.success('Configuration saved');
            await loadConfig();
        } catch (err) {
            toast.error(err.message || 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    const addMember = async () => {
        if (!selectedTeam) return;
        const { name, email } = splitNameAndEmail(newMember);
        if (!isValidMemberName(name)) { toast.error('Enter a valid name (e-mails go in the e-mail column)'); return; }
        if (email && !isValidEmail(email)) { toast.error('Invalid e-mail'); return; }
        if (selectedTeam.members.includes(name)) {
            toast.info(`${name} is already in ${selectedTeam.name}. Edit their row below.`);
            setNewMember('');
            return;
        }
        setAdding(true);
        try {
            if (features?.moveMember) {
                await addTeamMember(selectedTeam.id, name, email || undefined);
            } else {
                await updateTeam(selectedTeam.id, { name: selectedTeam.name, members: [...selectedTeam.members, name], custom_prompt: selectedTeam.custom_prompt || null });
                if (email) await updateTeamEmails([{ name, email }]);
            }
            toast.success(`${name} added to ${selectedTeam.name}`);
            setNewMember('');
            await Promise.all([reloadTeams(), loadConfig()]);
        } catch (err) {
            toast.error(err.message || 'Failed to add member');
        } finally {
            setAdding(false);
        }
    };

    const removeMember = async () => {
        const name = pendingRemove;
        if (!selectedTeam || !name) return;
        setSaving(true);
        try {
            if (features?.moveMember) {
                await removeTeamMember(selectedTeam.id, name, todayISO());
            } else {
                await updateTeam(selectedTeam.id, { name: selectedTeam.name, members: selectedTeam.members.filter((m) => m !== name), custom_prompt: selectedTeam.custom_prompt || null });
            }
            toast.success(`${name} removed from ${selectedTeam.name}`);
            setPendingRemove(null);
            await reloadTeams();
        } catch (err) {
            toast.error(err.message || 'Failed to remove member');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page page-autobucket">
            <div className="page-head">
                <div className="page-head-left">
                    <h1 className="page-title"><Clock size={20} aria-hidden="true" /> Auto Bucket Mgmt</h1>
                    <div className="dropdown">
                        <button type="button" className="btn btn-secondary dropdown-btn" onClick={() => setDropdownOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={dropdownOpen} disabled={activeTeams.length === 0}>
                            <span className="truncate">{selectedTeam ? selectedTeam.name : 'Select team'}</span>
                            <ChevronDown size={14} aria-hidden="true" className={dropdownOpen ? 'rotate-180' : undefined} />
                        </button>
                        {dropdownOpen && (
                            <div className="dropdown-menu" role="listbox">
                                {activeTeams.map((t) => (
                                    <button type="button" role="option" aria-selected={t.id === teamId} key={t.id} className={cx('dropdown-item', t.id === teamId && 'active')} onClick={() => { setSelectedTeamId(t.id); setDropdownOpen(false); }}>{t.name}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="page-head-right">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowConfig(true)} disabled={loading || !selectedTeam}><Settings size={16} aria-hidden="true" /> Shift configurations</button>
                    <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !selectedTeam || !dirty}>
                        {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} Save configurations
                    </button>
                </div>
            </div>

            {showConfig && selectedTeam && (
                <ShiftConfigModal open team={selectedTeam} configs={shiftConfigs} onClose={() => setShowConfig(false)} onConfigsUpdated={loadConfig} />
            )}

            {loading ? <CardSkeleton lines={6} /> : !selectedTeam ? (
                <div className="card empty-state-large"><p>No teams available. Create a team first.</p></div>
            ) : (
                <section className="card">
                    <header className="card-head">
                        <h3>{selectedTeam.name}</h3>
                        <p className="muted small">Buffers are minutes relative to the shift (negative = before, positive = after). Every agent needs the Freshdesk e-mail set so the automation can find them.</p>
                    </header>
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Freshdesk e-mail</th>
                                    <th className="center">Availability</th>
                                    <th className="center">Auto enable</th>
                                    <th className="center">Start buffer</th>
                                    <th className="center">End buffer</th>
                                    <th aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {selectedTeam.members.map((name) => {
                                    const c = memberEmails[name] || {};
                                    const todaysShift = todayRows.find((r) => r.Name === name)?.Status || null;
                                    const def = shiftConfigs.find((s) => s.team_id === teamId && s.shift_name === todaysShift);
                                    const hasStart = c.start_offset_mins !== null && c.start_offset_mins !== undefined;
                                    const hasEnd = c.end_offset_mins !== null && c.end_offset_mins !== undefined;
                                    const effStart = hasStart ? c.start_offset_mins : (def?.start_offset_mins ?? 0);
                                    const effEnd = hasEnd ? c.end_offset_mins : (def?.end_offset_mins ?? 0);
                                    const parseBuffer = (field) => (e) => {
                                        const v = e.target.value.trim();
                                        if (v === '' || v === '-') updateConfig(name, field, null);
                                        else { const n = parseInt(v, 10); if (!Number.isNaN(n)) updateConfig(name, field, n); }
                                    };
                                    return (
                                        <tr key={name} className={cx(editingContact === name && 'is-editing')}>
                                            <td>
                                                <div className="member-cell">
                                                    <span className="strong">{name}</span>
                                                    {editingContact === name ? (
                                                        <span className="contact-edit">
                                                            <Phone size={12} aria-hidden="true" />
                                                            <input className="input input-inline" value={c.contact_number || ''} onChange={(e) => updateConfig(name, 'contact_number', e.target.value)} placeholder="Contact no." autoFocus onBlur={() => setEditingContact(null)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingContact(null); }} aria-label={`Contact number for ${name}`} />
                                                        </span>
                                                    ) : (
                                                        <button type="button" className={cx('icon-btn icon-btn-sm', c.contact_number ? 'text-accent' : 'muted')} onClick={() => setEditingContact(name)} title={c.contact_number || 'Add contact number'} aria-label={`Edit contact number for ${name}`}><Phone size={14} /></button>
                                                    )}
                                                </div>
                                            </td>
                                            <td><input type="email" className="input" value={c.email || ''} onChange={(e) => updateConfig(name, 'email', e.target.value)} placeholder="agent@razorpay.com" aria-label={`E-mail for ${name}`} /></td>
                                            <td className="center"><AgentAvailability email={c.email || ''} isAutoEnableOn={original[name]?.auto_enable_bucket ?? true} onShowToast={(t) => toast.toast(t.message, t.type)} /></td>
                                            <td className="center"><input type="checkbox" checked={c.auto_enable_bucket ?? true} onChange={(e) => updateConfig(name, 'auto_enable_bucket', e.target.checked)} aria-label={`Auto enable ${name}`} /></td>
                                            <td className="center"><input className={cx('input input-num', !hasStart && 'is-placeholder')} inputMode="numeric" value={hasStart ? c.start_offset_mins : ''} placeholder="Default" onChange={parseBuffer('start_offset_mins')} title={hasStart ? 'Overridden' : `Default ${effStart} min (shift: ${todaysShift || 'none'})`} aria-label={`Start buffer for ${name}`} /></td>
                                            <td className="center"><input className={cx('input input-num', !hasEnd && 'is-placeholder')} inputMode="numeric" value={hasEnd ? c.end_offset_mins : ''} placeholder="Default" onChange={parseBuffer('end_offset_mins')} title={hasEnd ? 'Overridden' : `Default ${effEnd} min (shift: ${todaysShift || 'none'})`} aria-label={`End buffer for ${name}`} /></td>
                                            <td className="center">
                                                <div className="row-actions">
                                                    {(hasStart || hasEnd) && <button type="button" className="icon-btn icon-btn-sm" onClick={() => { updateConfig(name, 'start_offset_mins', null); updateConfig(name, 'end_offset_mins', null); }} title="Reset to shift default" aria-label={`Reset buffers for ${name}`}><RefreshCw size={14} /></button>}
                                                    <button type="button" className="icon-btn icon-btn-sm text-danger" onClick={() => setPendingRemove(name)} title="Remove from team" aria-label={`Remove ${name} from team`}><UserX size={15} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {selectedTeam.members.length === 0 && <tr><td colSpan={7} className="muted center">No members yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <footer className="card-foot add-member-bar">
                        <div className="inline-form">
                            <input className="input" value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Add member — Name, email (email optional)" onKeyDown={(e) => { if (e.key === 'Enter') addMember(); }} aria-label="New member" disabled={adding} />
                            <button type="button" className="btn btn-primary" onClick={addMember} disabled={adding || !newMember.trim()}>
                                {adding ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Add member
                            </button>
                        </div>
                        <span className="muted small hint"><HelpCircle size={14} aria-hidden="true" /> Members are saved to the team immediately; buffers and e-mails need “Save configurations”.</span>
                    </footer>
                </section>
            )}

            <ConfirmDialog
                open={!!pendingRemove}
                title="Remove from team"
                message={features?.moveMember
                    ? `Remove ${pendingRemove} from ${selectedTeam?.name}? Their roster from today onward is marked Exit so headcount stays correct; history is kept. To transfer them to another team use “Move” in Team Settings instead.`
                    : `Remove ${pendingRemove} from ${selectedTeam?.name}? Existing roster rows are kept.`}
                confirmLabel="Remove"
                danger
                busy={saving}
                onConfirm={removeMember}
                onCancel={() => setPendingRemove(null)}
            />
        </div>
    );
}
