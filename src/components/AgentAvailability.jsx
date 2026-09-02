import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { getFreshdeskAvailability, toggleFreshdeskAvailability } from '../lib/api';

/** Live Freshdesk availability of one agent with a manual toggle (blocked while auto-enable is on). */
export default function AgentAvailability({ email, isAutoEnableOn, onShowToast }) {
    const [status, setStatus] = useState(email ? 'loading' : 'error');

    const fetchStatus = useCallback(async () => {
        if (!email) return;
        try {
            const data = await getFreshdeskAvailability(email);
            setStatus(data.available ? 'available' : 'unavailable');
        } catch {
            setStatus('error');
        }
    }, [email]);

    useEffect(() => {
        if (!email) return undefined;
        const initial = setTimeout(fetchStatus, 0);
        const interval = setInterval(fetchStatus, 60_000);
        return () => { clearTimeout(initial); clearInterval(interval); };
    }, [email, fetchStatus]);

    const handleToggle = async () => {
        if (isAutoEnableOn) {
            onShowToast?.({ message: "Uncheck 'Auto enable' and save first to control availability manually.", type: 'error' });
            return;
        }
        if (status === 'loading' || status === 'toggling' || status === 'error') return;
        const action = status === 'available' ? 'disable' : 'enable';
        setStatus('toggling');
        try {
            await toggleFreshdeskAvailability(email, action);
            setStatus(action === 'enable' ? 'available' : 'unavailable');
        } catch (err) {
            onShowToast?.({ message: `Failed to toggle availability: ${err.message}`, type: 'error' });
            await fetchStatus();
        }
    };

    if (!email || status === 'error') {
        return <span className="muted" title="No e-mail or Freshdesk lookup failed">–</span>;
    }
    if (status === 'loading' || status === 'toggling') {
        return <Loader2 size={16} className="spin muted" aria-label="Loading availability" />;
    }
    const available = status === 'available';
    return (
        <button
            type="button"
            className={`icon-btn availability-btn ${available ? 'is-available' : 'is-unavailable'}`}
            onClick={handleToggle}
            disabled={isAutoEnableOn}
            title={isAutoEnableOn ? 'Auto-enabled (manual toggle disabled)' : available ? 'Available — click to disable' : 'Unavailable — click to enable'}
            aria-label={available ? 'Agent available' : 'Agent unavailable'}
        >
            {available ? <CheckCircle size={18} /> : <XCircle size={18} />}
        </button>
    );
}
