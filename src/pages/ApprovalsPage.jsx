import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle, CheckSquare, Loader2, X } from 'lucide-react';
import { getPendingRequests, reviewRequest } from '../lib/api';
import { formatISO } from '../lib/dates';
import { CardSkeleton } from '../components/Skeleton';
import { useToast } from '../hooks/useToast';

export default function ApprovalsPage({ onRefreshRoster }) {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(null);

    const load = useCallback(async () => {
        try {
            setRequests(await getPendingRequests());
        } catch (err) {
            toast.error(err.message || 'Failed to load pending requests');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const review = async (id, decision) => {
        setProcessing(id);
        try {
            await reviewRequest(id, decision);
            toast.success(`Request ${decision}`);
            await load();
            if (decision === 'approved') onRefreshRoster?.();
        } catch (err) {
            toast.error(err.message || 'Failed to review request');
        } finally {
            setProcessing(null);
        }
    };

    return (
        <div className="page page-approvals">
            <div className="page-head">
                <h1 className="page-title"><CheckSquare size={20} aria-hidden="true" /> Approvals</h1>
                <span className="muted small">{requests.length} pending</span>
            </div>
            {loading ? <CardSkeleton lines={4} /> : requests.length === 0 ? (
                <div className="card empty-state-large"><CheckCircle size={32} aria-hidden="true" /><p>All caught up — no pending requests.</p></div>
            ) : (
                <ul className="list list-cards">
                    {requests.map((r) => (
                        <li key={r.id} className="card request-card">
                            <div className="request-head">
                                <div><span className="strong">{r.requester_name}</span> <span className="muted small">{r.team}</span></div>
                                <span className="badge badge-accent">{r.request_type}</span>
                            </div>
                            <div className="request-dates"><CalendarDays size={14} aria-hidden="true" /> {(r.dates || []).map((d) => formatISO(d)).join(', ')}</div>
                            {r.reason && <div className="muted small request-reason">“{r.reason}”</div>}
                            <div className="request-actions">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => review(r.id, 'approved')} disabled={processing === r.id}>
                                    {processing === r.id ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <CheckCircle size={14} aria-hidden="true" />} Approve
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm text-danger" onClick={() => review(r.id, 'declined')} disabled={processing === r.id}>
                                    <X size={14} aria-hidden="true" /> Decline
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
