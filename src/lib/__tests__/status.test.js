import { describe, expect, it } from 'vitest';
import { normalizeStatus, isWorkingStatus, isHeadcountStatus, parseTimeRange } from '../status';

describe('normalizeStatus', () => {
    it('canonicalises the messy spellings found in production', () => {
        expect(normalizeStatus('09:00-18:00').value).toBe('09:00 - 18:00');
        expect(normalizeStatus('10:00 - 7:00').value).toBe('10:00 - 19:00');
        expect(normalizeStatus('8:00-5:00').value).toBe('08:00 - 17:00');
        expect(normalizeStatus('10:00 - 2100').value).toBe('10:00 - 21:00');
        expect(normalizeStatus('10:00 - 19:00 ').value).toBe('10:00 - 19:00');
        expect(normalizeStatus('18:00 - 03:00')).toMatchObject({ value: '18:00 - 03:00', kind: 'shift', period: 'night' });
    });

    it('maps codes case-insensitively and treats blanks as empty', () => {
        expect(normalizeStatus('pl')).toEqual({ value: 'PL', kind: 'pl' });
        expect(normalizeStatus('EXIT')).toEqual({ value: 'Exit', kind: 'exit' });
        expect(normalizeStatus('HL')).toEqual({ value: 'Holiday', kind: 'holiday' });
        expect(normalizeStatus('-')).toEqual({ value: '', kind: 'empty' });
        expect(normalizeStatus(null)).toEqual({ value: '', kind: 'empty' });
        expect(normalizeStatus('CN')).toEqual({ value: 'CN', kind: 'other' });
    });

    it('applies the legacy on-call conventions', () => {
        expect(normalizeStatus('10:00 - 22:00').kind).toBe('oncall');
        expect(normalizeStatus('07:00 - 16:00', { weekend: true }).kind).toBe('oncall');
        expect(normalizeStatus('07:00 - 16:00', { weekend: false }).kind).toBe('shift');
    });

    it('classifies working and headcount statuses', () => {
        expect(isWorkingStatus('09:00 - 18:00')).toBe(true);
        expect(isWorkingStatus('WFH')).toBe(true);
        expect(isWorkingStatus('WO')).toBe(false);
        expect(isHeadcountStatus('Exit')).toBe(false);
        expect(isHeadcountStatus('PL')).toBe(true);
    });

    it('rejects nonsense time ranges', () => {
        expect(parseTimeRange('25:00 - 30:00')).toBeNull();
        expect(parseTimeRange('hello')).toBeNull();
    });
});
