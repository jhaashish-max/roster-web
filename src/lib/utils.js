// Generates a consistent pastel HSL color from a name string (avatars).
export const getAvatarColor = (name) => {
    let hash = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 55%, 58%)`;
};

/** Tiny classnames helper: cx('a', cond && 'b', { c: true }) */
export const cx = (...args) => args
    .flatMap((a) => {
        if (!a) return [];
        if (typeof a === 'string') return [a];
        if (Array.isArray(a)) return a;
        if (typeof a === 'object') return Object.entries(a).filter(([, v]) => v).map(([k]) => k);
        return [];
    })
    .filter(Boolean)
    .join(' ');

export const initials = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

export const pluralize = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
