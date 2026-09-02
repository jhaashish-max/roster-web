import { describe, expect, it } from 'vitest';
import { parseMemberLine, parseMemberLines, splitNameAndEmail, isValidMemberName } from '../members';

describe('parseMemberLines', () => {
    it('never leaves an e-mail inside a name (the four production spellings)', () => {
        const text = [
            'Preeti Gusain preeti.gusain@razorpay.com',
            'Swati Kothawale, swati.kothawale@razorpay.com',
            'Vismaya PN <vismaya.pn@razorpay.com>',
            'Yogesh S — yogesh.s@razorpay.com',
        ].join('\n');
        expect(parseMemberLines(text)).toEqual([
            { name: 'Preeti Gusain', email: 'preeti.gusain@razorpay.com' },
            { name: 'Swati Kothawale', email: 'swati.kothawale@razorpay.com' },
            { name: 'Vismaya PN', email: 'vismaya.pn@razorpay.com' },
            { name: 'Yogesh S', email: 'yogesh.s@razorpay.com' },
        ]);
    });

    it('handles tabs, names only, e-mails only, blank lines and duplicates', () => {
        const rows = parseMemberLines('Jane Doe\tjane@razorpay.com\nJohn Roe\n\njohn.roe@razorpay.com\njane doe, other@razorpay.com\n');
        expect(rows).toEqual([
            { name: 'Jane Doe', email: 'jane@razorpay.com' }, // duplicate "jane doe" merged, first e-mail wins
            { name: 'John Roe', email: 'john.roe@razorpay.com' }, // name derived from the e-mail merges into the existing row
        ]);
    });

    it('flags invalid names', () => {
        expect(parseMemberLine('x')).toMatchObject({ error: expect.any(String) });
        expect(isValidMemberName('someone@razorpay.com')).toBe(false);
        expect(isValidMemberName('Ashish Jha')).toBe(true);
    });

    it('splits the Auto Bucket single input', () => {
        expect(splitNameAndEmail('Ayush S, ayush.s@razorpay.com')).toEqual({ name: 'Ayush S', email: 'ayush.s@razorpay.com' });
        expect(splitNameAndEmail('Ayush S')).toEqual({ name: 'Ayush S', email: '' });
    });
});
