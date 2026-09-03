import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Loader2, Maximize2, Minimize2, Plus, Save, Settings, Trash2, Users } from 'lucide-react';
import MemberListEditor from '../components/MemberListEditor';
import ConfirmDialog from '../components/ConfirmDialog';
import { CardSkeleton } from '../components/Skeleton';
import { ApiError, archiveTeam, createTeam, deleteTeam, getTeamEmails, unarchiveTeam, updateTeam, updateTeamEmails } from '../lib/api';
import { isValidMemberName, isValidEmail } from '../lib/members';
import { DEFAULT_PROMPT, PROMPT_VARIABLES } from '../lib/prompt';
import { useToast } from '../hooks/useToast';
import { cx } from '../lib/utils';

export default function TeamSettingsPage({ teams, teamsLoading, reloadTeams, features, onMoveMember }) {
    const toast = useToast();
    const [memberEmails, setMemberEmails] = useState({});
    const [editingId, setEditingId] = useState(null); // team id | 'new' | null
    const [showArchived, setShowArchived] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formName, setFormName] = useState('');
    const [formMembers, setFormMembers] = useState([]);
    const [formPrompt, setFormPrompt] = useState('');
    const [usePrompt, setUsePrompt] = useState(false);
    const [promptFullscreen, setPromptFullscreen] = useState(false);
    const [confirm, setConfirm] = useState(null); // { kind: 'delete'|'purge', team }

    const editingTeam = useMemo(() => (editingId && editingId !== 'new' ? teams.find((t) => t.id === editingId) : null), [teams, editingId]);
    const visibleTeams = useMemo(() => teams.filter((t) => showArchived || !t.archived), [teams, showArchived]);

    useEffect(() => {
        getTeamEmails().then((rows) => {
            const map = {};
            (rows || []).forEach((e) => { map[e.name] = e; });
            setMemberEmails(map);
        }).catch(() => { /* e-mails are optional in this view */ });
    }, []);

    const startCreate = () => {
        setEditingId('new'); setFormName(''); setFormMembers([{ name: '', email: '' }]); setFormPrompt(''); setUsePrompt(false); setPromptFullscreen(false);
    };
    const startEdit = (team) => {
        setEditingId(team.id);
        setFormName(team.name);
        setFormMembers(team.members.map((name) => ({ name, email: memberEmails[name]?.email || '' })));
        setFormPrompt(team.custom_prompt || '');
        setUsePrompt(!!team.custom_prompt);
        setPromptFullscreen(false);
    };
    const cancel = () => { setEditingId(null); setPromptFullscreen(false); };

    const cleanMembers = formMembers.map((m) => ({ name: m.name.trim(), email: (m.email || '').trim().toLowerCase() })).filter((m) => m.name);
    const memberErrors = cleanMembers.some((m) => !isValidMemberName(m.name) || (m.email && !isValidEmail(m.email)))
        || new Set(cleanMembers.map((m) => m.name.toLowerCase())).size !== cleanMembers.length;
    const canSave = formName.trim().length > 0 && cleanMembers.length > 0 && !memberErrors && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        const names = cleanMembers.map((m) => m.name);
        const emails = cleanMembers.filter((m) => m.email).map((m) => ({ name: m.name, email: m.email }));
        const prompt = usePrompt && formPrompt.trim() ? formPrompt : null;
        try {
            if (editingId === 'new') await createTeam(formName.trim(), names, prompt);
            else await updateTeam(editingId, { name: formName.trim(), members: names, custom_prompt: prompt });
            if (emails.length > 0) await updateTeamEmails(emails);
            toast.success(editingId === 'new' ? `Team ${formName.trim()} created` : 'Team saved');
            await reloadTeams();
            setEditingId(null);
        } catch (err) {
            toast.error(err.message || 'Failed to save team');
        } finally {
            setSaving(false);
        }
    };

    const runDelete = async (team, mode) => {
        setSaving(true);
        try {
            await deleteTeam(team.id, mode);
            toast.success(mode === 'archive' ? `${team.name} archived` : `${team.name} deleted`);
            setConfirm(null);
            if (editingId === team.id) setEditingId(null);
            await reloadTeams();
        } catch (err) {
            if (err instanceof ApiError && err.code === 'HAS_ROSTER') {
                setConfirm({ kind: 'has-roster', team, rows: err.details?.rows });
            } else {
                toast.error(err.message || 'Failed to delete team');
            }
        } finally {
            setSaving(false);
        }
    };

    const toggleArchive = async (team) => {
        setSaving(true);
        try {
            if (team.archived) await unarchiveTeam(team.id); else await archiveTeam(team.id);
            toast.success(team.archived ? `${team.name} restored` : `${team.name} archived`);
            await reloadTeams();
        } catch (err) {
            toast.error(err.message || 'Failed to update team');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page page-teams">
            <div className="page-head">
                <div>
                    <h1 className="page-title"><Settings size={20} aria-hidden="true" /> Team settings</h1>
                    <p className="muted small">Teams, members, tracking e-mails and custom AI prompts</p>
                </div>
            </div>

            <div className="teams-layout">
                <aside className="card teams-list">
                    <header className="card-head row-between">
                        <h3>Teams</h3>
                        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}><Plus size={14} aria-hidden="true" /> New</button>
                    </header>
                    {teamsLoading ? <div className="pad"><CardSkeleton lines={4} /></div> : (
                        <ul className="teams-items">
                            {visibleTeams.map((team) => (
                                <li key={team.id}>
                                    <button type="button" className={cx('team-item', editingId === team.id && 'active', team.archived && 'is-archived')} onClick={() => startEdit(team)}>
                                        <span className="team-item-name">{team.name}{team.archived && <span className="tag tag-muted">archived</span>}</span>
                                        <span className="muted small">{team.members.length} members</span>
                                    </button>
                                </li>
                            ))}
                            {visibleTeams.length === 0 && <li className="muted small pad">No teams yet</li>}
                        </ul>
                    )}
                    {features?.archive && teams.some((t) => t.archived) && (
                        <label className="checkbox-row pad">
                            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived teams
                        </label>
                    )}
                </aside>

                <section className="card team-form">
                    {!editingId ? (
                        <div className="empty-state-large">
                            <Users size={48} aria-hidden="true" className="muted" />
                            <h3>Team management</h3>
                            <p>Select a team on the left to edit its members and AI prompt, or create a new one.</p>
                        </div>
                    ) : (
                        <div className="stack">
                            <div className="row-between">
                                <h3>{editingId === 'new' ? 'Create team' : 'Edit team'}</h3>
                                {editingTeam && (
                                    <div className="row-actions">
                                        {features?.archive && (
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleArchive(editingTeam)} disabled={saving}>
                                                {editingTeam.archived ? <><ArchiveRestore size={14} aria-hidden="true" /> Restore</> : <><Archive size={14} aria-hidden="true" /> Archive</>}
                                            </button>
                                        )}
                                        <button type="button" className="btn btn-secondary btn-sm text-danger" onClick={() => setConfirm({ kind: 'delete', team: editingTeam })} disabled={saving}><Trash2 size={14} aria-hidden="true" /> Delete</button>
                                    </div>
                                )}
                            </div>

                            <label className="field">
                                <span className="field-label">Team name</span>
                                <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. TS - Payments" data-autofocus />
                                {editingTeam && formName.trim() !== editingTeam.name && <span className="muted small">Renaming moves every roster row of this team to the new name.</span>}
                            </label>

                            <MemberListEditor members={formMembers} onChange={setFormMembers} onMove={features?.moveMember && editingTeam ? (name) => onMoveMember(name, editingTeam.name) : undefined} />

                            <label className="checkbox-card">
                                <input type="checkbox" checked={usePrompt} onChange={(e) => { setUsePrompt(e.target.checked); if (e.target.checked && !formPrompt) setFormPrompt(DEFAULT_PROMPT); }} />
                                <span>
                                    <span className="strong">Use a custom AI prompt</span>
                                    <span className="muted small block">Override the default generation rules for this team</span>
                                </span>
                            </label>

                            {usePrompt && (
                                <div className={cx('prompt-editor', promptFullscreen && 'is-fullscreen')}>
                                    <div className="row-between">
                                        <span className="field-label">Custom prompt</span>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPromptFullscreen((f) => !f)}>
                                            {promptFullscreen ? <><Minimize2 size={14} aria-hidden="true" /> Exit fullscreen</> : <><Maximize2 size={14} aria-hidden="true" /> Fullscreen</>}
                                        </button>
                                    </div>
                                    <p className="muted small mono">Variables: {PROMPT_VARIABLES.join(', ')}</p>
                                    <textarea className="input mono prompt-textarea" rows={promptFullscreen ? 30 : 12} value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)} aria-label="Custom prompt" />
                                </div>
                            )}

                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
                                    {saving ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />} Save team
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <ConfirmDialog
                open={confirm?.kind === 'delete'}
                title="Delete team"
                message={features?.archive
                    ? `Delete ${confirm?.team?.name}? If the team still has roster rows you will be offered to archive it instead.`
                    : `Delete ${confirm?.team?.name}? Its roster rows stay in the database but will no longer be shown.`}
                confirmLabel="Delete"
                danger
                busy={saving}
                onConfirm={() => runDelete(confirm.team)}
                onCancel={() => setConfirm(null)}
            />
            <ConfirmDialog
                open={confirm?.kind === 'has-roster'}
                title="This team has roster history"
                message={`${confirm?.team?.name} has ${confirm?.rows ?? 'existing'} roster rows. Archive it to hide it from lists while keeping the history, or purge it to delete the team and every one of its rows.`}
                confirmLabel="Archive instead"
                busy={saving}
                onConfirm={() => runDelete(confirm.team, 'archive')}
                onCancel={() => setConfirm(null)}
            >
                <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setConfirm({ kind: 'purge', team: confirm.team })} disabled={saving}>Purge team and roster…</button>
            </ConfirmDialog>
            <ConfirmDialog
                open={confirm?.kind === 'purge'}
                title="Purge team"
                message={`This permanently deletes ${confirm?.team?.name} and ALL of its roster rows. There is no undo.`}
                confirmLabel="Purge permanently"
                danger
                busy={saving}
                requireText={confirm?.team?.name}
                onConfirm={() => runDelete(confirm.team, 'purge')}
                onCancel={() => setConfirm(null)}
            />
        </div>
    );
}
