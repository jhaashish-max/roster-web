import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Info, Loader2, X } from 'lucide-react';
import { ToastContext } from './context';

const AUTO_DISMISS_MS = { success: 4000, error: 7000, info: 5000, loading: 0 };
const ICONS = { success: CheckCircle, error: AlertCircle, info: Info, loading: Loader2 };

export default function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const counter = useRef(0);
    const timers = useRef(new Map());

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timers.current.get(id);
        if (timer) { clearTimeout(timer); timers.current.delete(id); }
    }, []);

    const push = useCallback((message, type = 'info', opts = {}) => {
        const id = opts.id ?? ++counter.current;
        setToasts((prev) => {
            const without = prev.filter((t) => t.id !== id);
            return [...without.slice(-3), { id, message, type }];
        });
        const existing = timers.current.get(id);
        if (existing) { clearTimeout(existing); timers.current.delete(id); }
        const ttl = opts.duration ?? AUTO_DISMISS_MS[type] ?? 4000;
        if (ttl > 0) timers.current.set(id, setTimeout(() => dismiss(id), ttl));
        return id;
    }, [dismiss]);

    const api = useMemo(() => ({
        toast: push,
        success: (m, o) => push(m, 'success', o),
        error: (m, o) => push(m, 'error', o),
        info: (m, o) => push(m, 'info', o),
        loading: (m, o) => push(m, 'loading', o),
        dismiss,
        /** Runs an async job with a loading toast that resolves into success / error. */
        promise: async (job, { loading = 'Working…', success = 'Done', error: errMsg } = {}) => {
            const id = push(loading, 'loading');
            try {
                const result = await job();
                push(typeof success === 'function' ? success(result) : success, 'success', { id });
                return result;
            } catch (err) {
                push(errMsg ? (typeof errMsg === 'function' ? errMsg(err) : errMsg) : (err?.message || 'Something went wrong'), 'error', { id });
                throw err;
            }
        },
    }), [push, dismiss]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
                {toasts.map((t) => {
                    const Icon = ICONS[t.type] || Info;
                    return (
                        <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
                            <Icon size={18} className={t.type === 'loading' ? 'spin' : undefined} aria-hidden="true" />
                            <span className="toast-message">{t.message}</span>
                            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
