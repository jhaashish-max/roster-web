import { useCallback, useState } from 'react';

/** useState persisted to localStorage (JSON). Safe when storage is unavailable. */
export function useLocalStorage(key, initialValue) {
    const [value, setValue] = useState(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return typeof initialValue === 'function' ? initialValue() : initialValue;
            return JSON.parse(raw);
        } catch {
            return typeof initialValue === 'function' ? initialValue() : initialValue;
        }
    });

    const set = useCallback((next) => {
        setValue((prev) => {
            const resolved = typeof next === 'function' ? next(prev) : next;
            try { localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* quota / private mode */ }
            return resolved;
        });
    }, [key]);

    return [value, set];
}
