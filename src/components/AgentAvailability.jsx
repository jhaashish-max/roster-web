import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const AgentAvailability = ({ email }) => {
    const [status, setStatus] = useState('loading'); // 'loading', 'available', 'unavailable', 'error'

    useEffect(() => {
        if (!email) {
            setStatus('error');
            return;
        }

        const fetchStatus = async () => {
            try {
                const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;
                const response = await fetch(`${API_BASE}/api/freshdesk/availability?email=${encodeURIComponent(email)}`);

                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const data = await response.json();

                if (data.available) {
                    setStatus('available');
                } else {
                    setStatus('unavailable');
                }
            } catch (error) {
                console.error("Error fetching agent availability:", error);
                setStatus('error');
            }
        };

        fetchStatus();

        // Polling every 60 seconds to keep it fresh
        const interval = setInterval(fetchStatus, 60000);
        return () => clearInterval(interval);

    }, [email]);

    if (status === 'loading') {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={16} className="lucide-spin" style={{ animation: 'spin 1s linear infinite' }} />
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (status === 'available') {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent-success)' }} title="Agent is Available">
                <CheckCircle size={18} />
            </div>
        );
    }

    if (status === 'unavailable') {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent-danger)' }} title="Agent is Not Available">
                <XCircle size={18} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }} title="No Email or Error">
            <span style={{ fontSize: '1rem', fontWeight: 600 }}>-</span>
        </div>
    );
};

export default AgentAvailability;
