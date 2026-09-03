import { describe, expect, it } from 'vitest';
import { computeDailyHeadcount, computeTeamHeadcount, shrinkageTier } from '../headcount';

const MEMBERS = ['Rajashree T', 'Panthi Kishorbhai Patel', 'Jayant Monga', 'M Danish', 'Vansh', 'Jai', 'Bhavya', 'Ayush Singh', 'Swati Kothawale', 'Yogesh S', 'Vismaya PN', 'Manoj', 'Rakshitha', 'Karthik'];

// The real 2026-08-31 rows for TS - Payments: 14 members + one exited person still on the sheet.
const AUG31 = [
    ['Ayush Singh', '09:00 - 18:00'], ['Bhavya', 'WO'], ['Jai', '11:00 - 20:00'], ['Jayant Monga', '09:00 - 18:00'],
    ['Karthik', '11:00 - 20:00'], ['M Danish', 'WO'], ['Manoj', '18:00 - 03:00'], ['Panthi Kishorbhai Patel', '11:00 - 20:00'],
    ['Rajashree T', '11:00 - 20:00'], ['Rakshitha', '11:00 - 20:00'], ['Ranvir Singh Bhatti', 'Exit'], ['Swati Kothawale', '11:00 - 20:00'],
    ['Vansh', '09:00 - 18:00'], ['Vismaya PN', 'WL'], ['Yogesh S', '11:00 - 20:00'],
].map(([Name, Status]) => ({ Date: '2026-08-31', Name, Status, Team: 'TS - Payments' }));

describe('computeDailyHeadcount', () => {
    it('never lets Rostered HC exceed Total HC (Aug 31 regression)', () => {
        const d = computeDailyHeadcount({ members: MEMBERS, rows: AUG31, dateStr: '2026-08-31' });
        expect(d.totalHC).toBe(14);
        expect(d.rosteredHC).toBe(14);
        expect(d.rosteredHC).toBeLessThanOrEqual(d.totalHC);
        expect(d.presentHC).toBe(11);
        expect(d.woff).toBe(2);
        expect(d.wl).toBe(1);
        expect(d.shrinkagePlanned).toBeCloseTo((2 / 14) * 100, 5);
        expect(d.shrinkageUnplanned).toBeCloseTo((1 / 14) * 100, 5);
    });

    it('counts a member without a row in Total but not in Rostered', () => {
        const rows = AUG31.filter((r) => r.Name !== 'Karthik');
        const d = computeDailyHeadcount({ members: MEMBERS, rows, dateStr: '2026-08-31' });
        expect(d.totalHC).toBe(14);
        expect(d.rosteredHC).toBe(13);
    });

    it('treats "-" cells as no row and ignores names that only have Exit/NA', () => {
        const rows = [
            { Name: 'A', Status: '-' }, { Name: 'B', Status: 'NA' }, { Name: 'C', Status: '09:00 - 18:00' },
        ];
        const d = computeDailyHeadcount({ members: ['A', 'C'], rows, dateStr: '2026-09-02' });
        expect(d.totalHC).toBe(2);
        expect(d.rosteredHC).toBe(1);
        expect(d.presentHC).toBe(1);
    });

    it('computes per-team daily series and the card total', () => {
        const dates = [{ iso: '2026-08-31', date: new Date(2026, 7, 31) }, { iso: '2026-09-01', date: new Date(2026, 8, 1) }];
        const { totalHC, dailyData } = computeTeamHeadcount({ team: { name: 'TS - Payments', members: MEMBERS }, rows: AUG31, dates });
        expect(dailyData).toHaveLength(2);
        expect(dailyData[0].rosteredHC).toBe(14);
        expect(dailyData[1].rosteredHC).toBe(0);
        expect(totalHC).toBe(14);
    });

    it('maps shrinkage tiers', () => {
        expect(shrinkageTier(0)).toBe('zero');
        expect(shrinkageTier(7.14)).toBe('low');
        expect(shrinkageTier(21.4)).toBe('mid');
        expect(shrinkageTier(40)).toBe('high');
    });
});
