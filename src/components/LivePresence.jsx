import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import Pusher from 'pusher-js';

const getAvatarColor = (name) => {
    const colors = [
        'var(--accent-primary)',
        '#3b82f6', // blue
        '#10b981', // emerald
        '#f59e0b', // amber
        '#ef4444', // red
        '#8b5cf6', // violet
        '#ec4899', // pink
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

const LivePresence = ({ currentUser }) => {
    const [activeUsers, setActiveUsers] = useState([]);
    const [showAllUsers, setShowAllUsers] = useState(false);
    const [clickedUser, setClickedUser] = useState(null);

    useEffect(() => {
        if (!currentUser) return;

        // Connect to Pusher and route auth through your Cloudflare Worker
        const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;
        const pusher = new Pusher('e517a00f27b50205b1e7', {
            cluster: 'us2',
            authEndpoint: `${API_BASE}/api/pusher/auth`,
            auth: {
                params: {
                    user_id: currentUser,
                    user_info: JSON.stringify({ name: currentUser })
                }
            }
        });

        // Use a Presence Channel (which automatically tells us who is online)
        const channel = pusher.subscribe('presence-dashboard');

        // When we first connect, we get the full list of who is already here
        channel.bind('pusher:subscription_succeeded', (members) => {
            const initialUsers = [];
            members.each(member => {
                initialUsers.push({ id: member.id, name: member.info.name });
            });
            setActiveUsers(initialUsers);
        });

        // When someone new joins
        channel.bind('pusher:member_added', (member) => {
            setActiveUsers(prev => {
                if (prev.find(u => u.name === member.info.name)) return prev;
                return [...prev, { id: member.id, name: member.info.name }];
            });
        });

        // When someone leaves (closes their tab)
        channel.bind('pusher:member_removed', (member) => {
            setActiveUsers(prev => prev.filter(u => u.id !== member.id));
        });

        return () => {
            channel.unbind_all();
            channel.unsubscribe();
            pusher.disconnect();
        };
    }, [currentUser]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: 'var(--bg-secondary)',
            padding: '0.35rem 0.5rem 0.35rem 0.75rem',
            borderRadius: '20px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '8px', height: '8px', background: 'var(--accent-success)', borderRadius: '50%' }} />
                    <div style={{ width: '8px', height: '8px', background: 'var(--accent-success)', borderRadius: '50%', position: 'absolute', opacity: 0.5, animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {activeUsers.length} Online
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '0.5rem', borderLeft: '1px solid var(--border-color)' }}>
                <div
                    style={{ display: 'flex', flexDirection: 'row', paddingRight: '0.25rem', position: 'relative' }}
                    onMouseLeave={() => { setShowAllUsers(false); setClickedUser(null); }}
                >
                    {activeUsers.slice(0, 4).map((user, i) => (
                        <div
                            key={user.id}
                            title={user.name}
                            onClick={(e) => {
                                e.stopPropagation();
                                setClickedUser(clickedUser === user.id ? null : user.id);
                                setShowAllUsers(false);
                            }}
                            style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: getAvatarColor(user.name),
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                border: '2px solid var(--bg-secondary)',
                                marginLeft: i > 0 ? '-10px' : '0',
                                zIndex: 10 - i,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                transition: 'transform 0.2s',
                                cursor: 'pointer',
                                position: 'relative'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            {user.name.charAt(0).toUpperCase()}

                            {clickedUser === user.id && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    marginTop: '0.4rem',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '0.4rem 0.6rem',
                                    boxShadow: 'var(--shadow-md)',
                                    zIndex: 100,
                                    whiteSpace: 'nowrap',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    animation: 'fadeIn 0.2s ease-out',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.4rem'
                                }}>
                                    <div style={{ width: '6px', height: '6px', background: 'var(--accent-success)', borderRadius: '50%' }} />
                                    {user.name}
                                </div>
                            )}
                        </div>
                    ))}
                    {activeUsers.length > 4 && (
                        <div
                            onClick={() => { setShowAllUsers(!showAllUsers); setClickedUser(null); }}
                            style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: 'var(--bg-hover)',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                border: '2px solid var(--bg-secondary)',
                                marginLeft: '-10px',
                                zIndex: 0,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.transform = 'translateY(0)' }}
                        >
                            +{activeUsers.length - 4}
                        </div>
                    )}

                    {/* Popover for extra users */}
                    {showAllUsers && activeUsers.length > 4 && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '0.4rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            boxShadow: 'var(--shadow-md)',
                            zIndex: 100,
                            minWidth: '160px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            animation: 'fadeIn 0.2s ease-out'
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: '0.3rem', borderBottom: '1px solid var(--border-color)' }}>
                                Online Users
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {activeUsers.slice(4).map(u => (
                                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: getAvatarColor(u.name), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 600 }}>
                                            {u.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span style={{ fontWeight: 500 }}>{u.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
@keyframes ping {
    75%, 100% {
        transform: scale(2.5);
        opacity: 0;
    }
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
`}</style>
        </div>
    );
};

export default LivePresence;
