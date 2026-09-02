import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/api', () => ({ getAudit: vi.fn() }));
import { getAudit } from '../../lib/api';
import AuditPage from '../../pages/AuditPage';

const entry = (id, extra = {}) => ({
    id, at: '2026-09-02T09:55:00Z', actor: 'jha.ashish@razorpay.com', action: 'roster.update', team: 'ACE', name: `Person ${id}`, date: '2026-09-02', old_status: 'WO', new_status: 'PL', meta: { source: 'test' }, ...extra,
});

describe('AuditPage', () => {
    beforeEach(() => {
        localStorage.clear();
        getAudit.mockReset();
        getAudit.mockImplementation(async ({ offset = 0, limit = 50 }) => ({
            entries: offset === 0 ? [entry(1), entry(2, { actor: 'service', action: 'team.move_member', meta: { to: 'TS - POS', rowsMoved: 3 }, old_status: null, new_status: null })] : [entry(51)],
            total: 51, limit, offset, hasMore: offset === 0, actions: ['roster.update', 'team.move_member'],
        }));
    });

    it('renders rows, labels, summaries and pages through results', async () => {
        render(<AuditPage teams={[{ id: '1', name: 'ACE', members: [] }]} />);
        await waitFor(() => expect(screen.getByText('Person 1')).toBeInTheDocument());
        expect(screen.getAllByText('Cell updated').length).toBeGreaterThan(0);
        expect(screen.getByText('Member moved', { selector: 'span' })).toBeInTheDocument(); // the action <select> lists the same label
        expect(screen.getByText('API key')).toBeInTheDocument();
        expect(screen.getByText('from ACE to TS - POS · 3 rows')).toBeInTheDocument();
        expect(screen.getByText('Showing 1–2 of 51')).toBeInTheDocument();
        expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, limit: 50, team: '', action: '' }));

        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => expect(screen.getByText('Person 51')).toBeInTheDocument());
        expect(screen.getByText('Showing 51–51 of 51')).toBeInTheDocument();
        expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }));
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('resets to the first page when a filter changes', async () => {
        render(<AuditPage teams={[{ id: '1', name: 'ACE', members: [] }]} />);
        await waitFor(() => expect(screen.getByText('Person 1')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        await waitFor(() => expect(screen.getByText('Person 51')).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Team'), { target: { value: 'ACE' } });
        await waitFor(() => expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ team: 'ACE', offset: 0 })));
    });
});
