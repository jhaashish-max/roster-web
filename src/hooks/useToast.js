import { useContext } from 'react';
import { ToastContext } from '../components/toast/context';

const noop = () => 0;
const fallback = { toast: noop, success: noop, error: noop, info: noop, loading: noop, dismiss: noop, promise: (job) => job() };

export function useToast() {
    return useContext(ToastContext) || fallback;
}
