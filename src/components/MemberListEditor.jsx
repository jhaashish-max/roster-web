import { useState } from 'react';
import { ArrowRightLeft, ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import { isValidEmail, isValidMemberName, parseMemberLines } from '../lib/members';
import { cx } from '../lib/utils';

/**
 * Structured editor for a team's members: one row per person (name + e-mail).
 * Replaces the free-text "Name, email" textarea that let e-mails slip into names.
 *
 * @param {{ members: Array<{name:string,email:string}>, onChange: (members) => void, onMove?: (name) => void }} props
 */
export default function MemberListEditor({ members, onChange, onMove }) {
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');

    const update = (i, patch) => onChange(members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
    const remove = (i) => onChange(members.filter((_, idx) => idx !== i));
    const add = () => onChange([...members, { name: '', email: '' }]);

    const applyPaste = () => {
        const parsed = parseMemberLines(pasteText);
        const byName = new Map(members.filter((m) => m.name.trim()).map((m) => [m.name.trim().toLowerCase(), { ...m }]));
        parsed.forEach((p) => {
            const key = p.name.toLowerCase();
            if (byName.has(key)) {
                const cur = byName.get(key);
                if (!cur.email && p.email) cur.email = p.email;
            } else {
                byName.set(key, { name: p.name, email: p.email || '' });
            }
        });
        onChange(Array.from(byName.values()));
        setPasteText('');
        setPasteOpen(false);
    };

    const nameCounts = members.reduce((acc, m) => {
        const k = m.name.trim().toLowerCase();
        if (k) acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="member-editor">
            <div className="member-editor-head">
                <span className="field-label">Members ({members.filter((m) => m.name.trim()).length})</span>
                <div className="member-editor-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasteOpen((o) => !o)} aria-expanded={pasteOpen}>
                        <ClipboardPaste size={14} aria-hidden="true" /> Paste list
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={add}>
                        <Plus size={14} aria-hidden="true" /> Add member
                    </button>
                </div>
            </div>

            {pasteOpen && (
                <div className="member-paste">
                    <textarea
                        className="input mono"
                        rows={5}
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={'One person per line, e.g.\nJane Doe, jane@razorpay.com\nJohn Roe <john@razorpay.com>\nPriya S'}
                        aria-label="Paste members"
                    />
                    <div className="member-paste-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPasteOpen(false); setPasteText(''); }}>Cancel</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={applyPaste} disabled={!pasteText.trim()}>Add {parseMemberLines(pasteText).length || ''} parsed</button>
                    </div>
                </div>
            )}

            <div className="member-rows" role="list">
                {members.length === 0 && <div className="muted small member-empty">No members yet. Add one or paste a list.</div>}
                {members.map((m, i) => {
                    const nameTrim = m.name.trim();
                    const nameError = nameTrim && !isValidMemberName(nameTrim)
                        ? (nameTrim.includes('@') ? 'Put the e-mail in the e-mail box, not the name' : 'Name must be 2–80 characters')
                        : nameTrim && nameCounts[nameTrim.toLowerCase()] > 1 ? 'Duplicate name' : '';
                    const emailError = m.email && !isValidEmail(m.email) ? 'Invalid e-mail' : '';
                    return (
                        <div key={i} className={cx('member-row', (nameError || emailError) && 'has-error')} role="listitem">
                            <div className="member-row-fields">
                                <input className={cx('input', nameError && 'is-invalid')} value={m.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Full name" aria-label={`Member ${i + 1} name`} aria-invalid={!!nameError} />
                                <input className={cx('input', emailError && 'is-invalid')} type="email" value={m.email} onChange={(e) => update(i, { email: e.target.value.trim().toLowerCase() })} placeholder="email@razorpay.com (optional)" aria-label={`Member ${i + 1} e-mail`} aria-invalid={!!emailError} />
                                {onMove && nameTrim && !nameError && (
                                    <button type="button" className="icon-btn" onClick={() => onMove(nameTrim)} title="Move to another team" aria-label={`Move ${nameTrim} to another team`}>
                                        <ArrowRightLeft size={14} />
                                    </button>
                                )}
                                <button type="button" className="icon-btn text-danger" onClick={() => remove(i)} aria-label={`Remove ${nameTrim || 'member'}`} title="Remove from team">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            {(nameError || emailError) && <div className="field-error">{nameError || emailError}</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
