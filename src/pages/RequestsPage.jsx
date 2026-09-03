import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, FileText, Loader2, Plus, X } from 'lucide-react';
import { createLeaveRequest, getMyRequests } from '../lib/api';
import { formatISO, isValidISODate } from '../lib/dates';
import { CardSkeleton } from '../components/Skeleton';
import { useToast } from '../hooks/useToast';
import { cx } from '../lib/utils';

const TYPES = [
    { value: 'PL', label: 'PL — Planned leave' },
    { value: 'WL', label: 'WL — Wellness leave' },
    { value: 'WFH', label: 'WFH — Work from home' },
];

export default function RequestsPage({ me }) {
    const toast = useToast();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [type, setType] = useState('PL');
    const [dates, setDates] = useState([]);
    const [dateInput, setDateInput] = useState('');
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        try {
            setRequests(await getMyRequests());
        } catch (err) {
            toast.error(err.message || 'Failed to load requests');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const addDate = () => {
        if (!isValidISODate(dateInput)) return;
        setDates((prev) => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
        setDateInput('');
    };

    const submit = async (e) => {
        e.preventDefault();
        if (dates.length === 0) return;
        setSubmitting(true);
        try {
            await createLeaveRequest({ request_type: type, dates, reason: reason.trim() || undefined });
            toast.success('Request submitted');
            setDates([]); setReason('');
            await load();
        } catch (err) {
            toast.error(err.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="page page-requests">
            <div className="page-head"><h1 className="page-title"><FileText size={20} aria-hidden="true" /> Raise a request</h1></div>

            {!me?.name ? (
                <div className="card empty-state-large">
                    <AlertCircle size={28} aria-hidden="true" />
                    <p>Your e-mail isn't mapped to a team member yet. Ask an admin to add <strong>{me?.email}</strong> under Auto Bucket Mgmt.</p>
                </div>
            ) : (
                <>
                    <form className="card form-card" onSubmit={submit}>
                        <label className="field field-narrow">
                            <span className="field-label">Request type</span>
                            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </label>
                        <div className="field">
                            <span className="field-label">Dates</span>
                            <div className="inline-form">
                                <input type="date" className="input input-date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} aria-label="Pick a date" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }} />
                                <button type="button" className="btn btn-secondary" onClick={addDate} disabled={!dateInput}><Plus size={14} aria-hidden="true" /> Add date</button>
                            </div>
                            {dates.length > 0 ? (
                                <div className="chip-row">
                                    {dates.map((d) => (
                                        <span key={d} className="chip chip-accent">
                                            <CalendarDays size={12} aria-hidden="true" /> {formatISO(d)}
                                            <button type="button" className="chip-remove" onClick={() => setDates((p) => p.filter((x) => x !== d))} aria-label={`Remove ${d}`}><X size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                            ) : <div className="muted small">Pick one or more dates</div>}
                        </div>
                        <label className="field">
                            <span className="field-label">Reason <span className="muted">(optional)</span></span>
                            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Family function, doctor appointment…" maxLength={200} />
                        </label>
                        <div>
                            <button type="submit" className="btn btn-primary" disabled={submitting || dates.length === 0}>
                                {submitting ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Submit request
                            </button>
                        </div>
                    </form>

                    <h3 className="section-title">My requests</h3>
                    {loading ? <CardSkeleton lines={3} /> : requests.length === 0 ? (
                        <div className="card empty-state">No requests yet</div>
                    ) : (
                        <ul className="list list-cards">
                            {requests.map((r) => (
                                <li key={r.id} className="card list-row">
                                    <div className="list-row-main">
                                        <span className="strong text-accent">{r.request_type}</span>
                                        <span>{(r.dates || []).map((d) => formatISO(d, 'short')).join(', ')}</span>
                                        {r.reason && <span className="muted">— {r.reason}</span>}
                                    </div>
                                    <div className="list-row-side">
                                        <span className={cx('badge', `badge-${r.status}`)}>{r.status}</span>
                                        {r.reviewed_by && <span className="muted small">by {r.reviewed_by}</span>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
