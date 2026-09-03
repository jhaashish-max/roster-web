import { describe, expect, it } from 'vitest';
import { groupFor, labelFor, relativeTime, summarize, toCsv } from '../auditFormat';

describe('auditFormat', () => {
    it('labels known and unknown actions readably', () => {
        expect(labelFor('roster.update')).toBe('Cell updated');
        expect(labelFor('team.move_member')).toBe('Member moved');
        expect(labelFor('admin.remove')).toBe('Admin removed');
        expect(labelFor('freshdesk.sync_agent')).toBe('Freshdesk sync agent');
        expect(labelFor('team.toggle_flag')).toBe('Flag toggled');
        expect(labelFor('')).toBe('Unknown');
        expect(groupFor('member.emails').label).toBe('Members');
        expect(groupFor('weird').label).toBe('Other');
    });

    it('summarises bulk, move and month actions from meta and falls back to chips', () => {
        expect(summarize({ action: 'roster.bulk_update', meta: { upserted: 420, deleted: 0 } })).toBe('upserted 420, deleted 0');
        expect(summarize({ action: 'team.move_member', team: 'ACE', meta: { to: 'TS - Payments', rowsMoved: 12 } })).toBe('from ACE to TS - Payments · 12 rows');
        expect(summarize({ action: 'roster.delete_month', meta: { month: 9, year: 2026, deleted: 310 } })).toBe('9/2026 · 310 rows deleted');
        expect(summarize({ action: 'roster.update', old_status: 'WO', new_status: 'PL', meta: null })).toBeNull();
        expect(summarize({ action: 'team.remove_member', name: 'Ayush', meta: { exitedRows: 1 } })).toBe('Ayush · 1 future row marked Exit');
    });

    it('formats relative time and CSV', () => {
        const now = Date.parse('2026-09-02T10:00:00Z');
        expect(relativeTime('2026-09-02T09:55:00Z', now)).toBe('5 min ago');
        expect(relativeTime('2026-09-02T07:00:00Z', now)).toBe('3 h ago');
        expect(relativeTime('2026-08-31T10:00:00Z', now)).toBe('2 d ago');
        const csv = toCsv([{ id: 1, at: '2026-09-02T09:55:00Z', actor: 'a@razorpay.com', action: 'roster.update', team: 'ACE', name: 'A "B"', date: '2026-09-02', old_status: 'WO', new_status: 'PL', meta: { x: 1 } }]);
        expect(csv.split('\n')).toHaveLength(2);
        expect(csv).toContain('"A ""B"""');
        expect(csv).toContain('"Cell updated"');
    });
});
