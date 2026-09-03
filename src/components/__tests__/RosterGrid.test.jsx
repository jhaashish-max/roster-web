import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RosterGrid from '../RosterGrid';
import { buildGroups } from '../../lib/groups';

const days = [
    { iso: '2026-09-01', day: 1, weekday: 'Tue', weekend: false },
    { iso: '2026-09-02', day: 2, weekday: 'Wed', weekend: false },
];

describe('RosterGrid', () => {
    it('passes the group team to onCellUpdate, even for a "Not set" member and for a name present in two teams', () => {
        const rows = [
            { Date: '2026-09-01', Name: 'Ayush', Status: '09:00 - 18:00', Team: 'TS - Mission' },
            { Date: '2026-09-01', Name: 'Ayush', Status: 'WO', Team: 'TS - POS' },
        ];
        const teams = [
            { id: '1', name: 'TS - Mission', members: ['Ayush'] },
            { id: '2', name: 'TS - POS', members: ['Ayush', 'Newbie'] },
        ];
        const groups = buildGroups(rows, teams);
        const onCellUpdate = vi.fn();
        render(<RosterGrid groups={groups} days={days} isAdmin onCellUpdate={onCellUpdate} />);

        const grid = screen.getByRole('grid');
        // Select Newbie (unrostered, only in TS - POS) on Sept 2 and clear it with Delete.
        const posSection = screen.getByText('TS - POS').closest('section');
        const newbieRow = posSection.querySelector('tbody tr:nth-child(2)');
        expect(newbieRow.textContent).toContain('Newbie');
        const newbieCell = newbieRow.querySelector('td[data-date="2026-09-02"]');
        fireEvent.click(newbieCell);
        // a click opens the picker for admins; cancel it, then clear with Delete
        fireEvent.keyDown(screen.getByLabelText('Cell status'), { key: 'Escape' });
        fireEvent.keyDown(grid, { key: 'Delete' });
        expect(onCellUpdate).toHaveBeenLastCalledWith('2026-09-02', 'Newbie', '', 'TS - POS');

        // Ayush exists in both teams: editing the POS row must target TS - POS, not the first match.
        const ayushPosCell = posSection.querySelector('tbody tr:nth-child(1) td[data-date="2026-09-01"]');
        fireEvent.click(ayushPosCell);
        fireEvent.keyDown(screen.getByLabelText('Cell status'), { key: 'Escape' });
        fireEvent.keyDown(grid, { key: 'Delete' });
        expect(onCellUpdate).toHaveBeenLastCalledWith('2026-09-01', 'Ayush', '', 'TS - POS');
    });

    it('renders cells with the pastel kind classes', () => {
        const rows = [{ Date: '2026-09-01', Name: 'A', Status: '18:00 - 03:00', Team: 'X' }];
        const groups = buildGroups(rows, [{ id: 'x', name: 'X', members: ['A'] }]);
        render(<RosterGrid groups={groups} days={days} onCellUpdate={() => {}} />);
        const cell = document.querySelector('td[data-date="2026-09-01"]');
        expect(cell.className).toContain('kind-shift');
        expect(cell.className).toContain('period-night');
    });
});
