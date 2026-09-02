/**
 * Human labels and one-line summaries for roster_audit_log entries.
 * Actions are dotted: "<group>.<verb>" — e.g. roster.update, team.move_member, admin.add.
 */

export const ACTION_GROUPS = Object.freeze([
    { prefix: 'roster.', label: 'Roster', tone: 'afternoon' },
    { prefix: 'team.', label: 'Teams', tone: 'morning' },
    { prefix: 'member.', label: 'Members', tone: 'oncall' },
    { prefix: 'admin.', label: 'Admins', tone: 'night' },
    { prefix: 'request.', label: 'Requests', tone: 'pl' },
    { prefix: 'freshdesk.', label: 'Freshdesk', tone: 'wfh' },
]);

const LABELS = Object.freeze({
    'roster.update': 'Cell updated',
    'roster.delete_cell': 'Cell cleared',
    'roster.bulk_update': 'Bulk update',
    'roster.delete_month': 'Month deleted',
    'roster.generate': 'Roster generated',
    'team.create': 'Team created',
    'team.update': 'Team updated',
    'team.rename': 'Team renamed',
    'team.delete': 'Team deleted',
    'team.purge': 'Team purged',
    'team.archive': 'Team archived',
    'team.unarchive': 'Team restored',
    'team.add_member': 'Member added',
    'team.remove_member': 'Member removed',
    'team.move_member': 'Member moved',
    'member.emails': 'Member config saved',
    'member.update': 'Member config saved',
    'member.shift_configs': 'Shift configs saved',
    'member.shift_config_delete': 'Shift config deleted',
    'admin.add': 'Admin added',
    'admin.remove': 'Admin removed',
    'request.create': 'Request raised',
    'request.review': 'Request reviewed',
    'request.approved': 'Request approved',
    'request.declined': 'Request declined',
    'freshdesk.toggle': 'Availability toggled',
});

const VERBS = Object.freeze({ create: 'created', update: 'updated', delete: 'deleted', add: 'added', remove: 'removed', move: 'moved', rename: 'renamed', archive: 'archived', unarchive: 'restored', toggle: 'toggled', approve: 'approved', decline: 'declined', review: 'reviewed', generate: 'generated' });

export function groupFor(action) {
    const a = String(action || '');
    return ACTION_GROUPS.find((g) => a.startsWith(g.prefix)) || { prefix: '', label: 'Other', tone: 'other' };
}

/** "team.move_member" → "Member moved"; unknown actions get a readable fallback ("Freshdesk sync"). */
export function labelFor(action) {
    const a = String(action || '').trim();
    if (!a) return 'Unknown';
    if (LABELS[a]) return LABELS[a];
    const [group, ...rest] = a.split('.');
    const verbWords = (rest.join('.') || group).split(/[._-]+/).filter(Boolean);
    if (verbWords.length === 0) return a;
    const verb = VERBS[verbWords[0]];
    const subject = verbWords.slice(1).join(' ');
    const groupWord = group.charAt(0).toUpperCase() + group.slice(1);
    if (verb && subject) return `${subject.charAt(0).toUpperCase() + subject.slice(1)} ${verb}`;
    if (verb) return `${groupWord} ${verb}`;
    return `${groupWord} ${verbWords.join(' ')}`;
}

const num = (v) => (typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * One-line summary for the Change column when the entry isn't a simple old→new status change.
 * Returns null when the caller should render old_status → new_status chips instead.
 */
export function summarize(entry) {
    if (!entry) return '';
    const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : {};
    const action = String(entry.action || '');
    const parts = [];

    if (action === 'team.move_member') {
        const from = meta.from || meta.from_team || entry.team;
        const to = meta.to || meta.to_team;
        if (from && to) parts.push(`from ${from} to ${to}`);
        const rows = num(meta.rowsMoved ?? meta.rows_moved ?? meta.rows);
        if (rows !== null) parts.push(`${rows} ${rows === 1 ? 'row' : 'rows'}`);
        if (meta.effectiveDate || meta.effective_date) parts.push(`from ${meta.effectiveDate || meta.effective_date}`);
        return parts.join(' · ') || 'moved';
    }
    if (action === 'team.rename' || (action === 'team.update' && meta.from_name && meta.to_name)) {
        return `${meta.from_name || meta.old_name || '?'} → ${meta.to_name || meta.new_name || '?'}`;
    }
    if (action === 'roster.bulk_update' || action === 'roster.generate' || action === 'request.approved' || action === 'request.review') {
        const up = num(meta.upserted ?? meta.rows ?? meta.count);
        const del = num(meta.deleted);
        if (up !== null) parts.push(`upserted ${up}`);
        if (del !== null) parts.push(`deleted ${del}`);
        if (Array.isArray(meta.skipped) && meta.skipped.length) parts.push(`skipped ${meta.skipped.length}`);
        if (meta.decision) parts.unshift(String(meta.decision));
        if (meta.month && meta.year) parts.push(`${meta.month}/${meta.year}`);
        if (parts.length) return parts.join(', ');
    }
    if (action === 'roster.delete_month' || action === 'team.purge') {
        const del = num(meta.deleted ?? meta.rows);
        if (meta.month && meta.year) parts.push(`${meta.month}/${meta.year}`);
        if (del !== null) parts.push(`${del} ${del === 1 ? 'row' : 'rows'} deleted`);
        if (parts.length) return parts.join(' · ');
    }
    if (action === 'team.add_member' || action === 'team.remove_member') {
        const exited = num(meta.exitedRows ?? meta.exited_rows);
        if (entry.name) parts.push(entry.name);
        if (meta.email) parts.push(meta.email);
        if (exited !== null) parts.push(`${exited} future ${exited === 1 ? 'row' : 'rows'} marked Exit`);
        if (parts.length) return parts.join(' · ');
    }
    if (action.startsWith('member.')) {
        const count = num(meta.count ?? (Array.isArray(meta.names) ? meta.names.length : null));
        if (count !== null) return `${count} ${count === 1 ? 'member' : 'members'} saved`;
    }
    if (action.startsWith('admin.') && (meta.email || entry.name)) return String(meta.email || entry.name);
    if (action === 'freshdesk.toggle') return [meta.email, meta.action || entry.new_status].filter(Boolean).join(' → ');
    if (entry.old_status || entry.new_status) return null; // render chips
    if (meta.message) return String(meta.message);
    const keys = Object.keys(meta);
    if (keys.length) return keys.slice(0, 3).map((k) => `${k}: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : meta[k]}`).join(', ');
    return '';
}

/** "5 min ago", "3 h ago", "2 d ago" — coarse relative time for the muted line under the timestamp. */
export function relativeTime(iso, now = Date.now()) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    if (d < 30) return `${d} d ago`;
    return `${Math.round(d / 30)} mo ago`;
}

export function toCsv(entries) {
    const headers = ['at', 'actor', 'action', 'label', 'team', 'name', 'date', 'old_status', 'new_status', 'summary', 'meta'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = entries.map((e) => [e.at, e.actor, e.action, labelFor(e.action), e.team, e.name, e.date, e.old_status, e.new_status, summarize(e) ?? '', e.meta ? JSON.stringify(e.meta) : '']);
    return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
