/**
 * Parsing of pasted member lists. Accepts, per line:
 *   "Jane Doe, jane@razorpay.com"   "Jane Doe jane@razorpay.com"   "Jane Doe <jane@razorpay.com>"
 *   "Jane Doe — jane@razorpay.com"  "Jane Doe\tjane@razorpay.com"  "jane@razorpay.com"   "Jane Doe"
 * and never lets an e-mail address end up inside a name.
 */

export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export function isValidEmail(email) {
    return typeof email === 'string' && new RegExp(`^${EMAIL_RE.source}$`).test(email.trim());
}

export function isValidMemberName(name) {
    if (typeof name !== 'string') return false;
    const n = name.trim();
    return n.length >= 2 && n.length <= 80 && !n.includes('@') && !/[<>]/.test(n);
}

/** Parse ONE line into { name, email, error? }. */
export function parseMemberLine(line) {
    const raw = String(line || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const emailMatch = raw.match(EMAIL_RE);
    const email = emailMatch ? emailMatch[0].toLowerCase() : '';
    let name = emailMatch ? raw.replace(emailMatch[0], ' ') : raw;
    name = name
        .replace(/[<>()[\]{}]/g, ' ')
        .replace(/[,;|\t]/g, ' ')
        .replace(/\s+[-–—]+\s*$/g, ' ')
        .replace(/^\s*[-–—]+\s+/g, ' ')
        .replace(/\s+[-–—]+\s+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!name && email) {
        // Derive a display name from the e-mail local part: "jane.doe" → "Jane Doe"
        name = email.split('@')[0].split(/[._-]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    const result = { name, email };
    if (!isValidMemberName(name)) result.error = 'Name must be 2–80 characters and cannot contain @ or angle brackets';
    else if (email && !isValidEmail(email)) result.error = 'Invalid e-mail address';
    return result;
}

/** Parse a multi-line paste into members. Duplicate names (case-insensitive) are merged, first e-mail wins. */
export function parseMemberLines(text) {
    const seen = new Map();
    String(text || '').split(/\r?\n/).forEach((line) => {
        const m = parseMemberLine(line);
        if (!m) return;
        const key = m.name.toLowerCase();
        if (seen.has(key)) {
            const prev = seen.get(key);
            if (!prev.email && m.email) prev.email = m.email;
            return;
        }
        seen.set(key, m);
    });
    return Array.from(seen.values());
}

/** Split a legacy "Name, email" / "Name email" single input into parts. */
export function splitNameAndEmail(input) {
    const m = parseMemberLine(input);
    return m ? { name: m.name, email: m.email } : { name: '', email: '' };
}
