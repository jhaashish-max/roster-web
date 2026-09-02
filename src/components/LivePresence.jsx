import { useEffect, useState } from 'react';
import Pusher from 'pusher-js';
import { API_BASE, getToken, postPresenceActivity } from '../lib/api';
import { getAvatarColor, initials } from '../lib/utils';

const PUSHER_KEY = 'e517a00f27b50205b1e7';
const PUSHER_CLUSTER = 'us2';
const IDLE_TIMEOUT_MS = 60_000;
const MAX_AVATARS = 4;

/** Who else has the app open right now (Pusher presence channel, authenticated through the worker). */
export default function LivePresence({ currentUser, showCount = true }) {
    const [activeUsers, setActiveUsers] = useState([]);
    const [now, setNow] = useState(() => Date.now());
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        if (!currentUser) return undefined;
        const pusher = new Pusher(PUSHER_KEY, {
            cluster: PUSHER_CLUSTER,
            channelAuthorization: {
                endpoint: `${API_BASE}/api/pusher/auth`,
                transport: 'ajax',
                headers: { Authorization: `Bearer ${getToken() || ''}` },
                params: { user_id: currentUser, user_info: JSON.stringify({ name: currentUser }) },
            },
        });
        const channel = pusher.subscribe('presence-dashboard');

        channel.bind('pusher:subscription_succeeded', (members) => {
            const list = [];
            const at = Date.now();
            members.each((member) => list.push({ id: member.id, name: member.info?.name || member.id, lastActive: at }));
            setActiveUsers(list);
        });
        channel.bind('pusher:member_added', (member) => {
            setActiveUsers((prev) => (prev.some((u) => u.id === member.id) ? prev : [...prev, { id: member.id, name: member.info?.name || member.id, lastActive: Date.now() }]));
        });
        channel.bind('pusher:member_removed', (member) => {
            setActiveUsers((prev) => prev.filter((u) => u.id !== member.id));
        });
        channel.bind('user-activity', (data) => {
            setActiveUsers((prev) => prev.map((u) => (u.name === data.name ? { ...u, lastActive: Date.now() } : u)));
        });

        let lastBroadcast = 0;
        const handleActivity = () => {
            const at = Date.now();
            if (at - lastBroadcast < 5000) return;
            lastBroadcast = at;
            setActiveUsers((prev) => prev.map((u) => (u.name === currentUser ? { ...u, lastActive: at } : u)));
            postPresenceActivity(currentUser).catch(() => { /* presence is best-effort */ });
        };
        const events = ['mousemove', 'keydown', 'click', 'scroll'];
        events.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
        const tick = setInterval(() => setNow(Date.now()), 10_000);

        return () => {
            events.forEach((ev) => window.removeEventListener(ev, handleActivity));
            clearInterval(tick);
            channel.unbind_all();
            channel.unsubscribe();
            pusher.disconnect();
        };
    }, [currentUser]);

    const isIdle = (u) => now - (u.lastActive || now) > IDLE_TIMEOUT_MS;
    const visible = activeUsers.slice(0, MAX_AVATARS);
    const extra = activeUsers.slice(MAX_AVATARS);

    return (
        <div className="presence" onMouseLeave={() => setShowAll(false)}>
            {showCount && (
                <div className="presence-count">
                    <span className="presence-dot" aria-hidden="true" />
                    <span>{activeUsers.length} online</span>
                </div>
            )}
            <div className="presence-avatars">
                {visible.map((u, i) => (
                    <span
                        key={u.id}
                        className={`avatar avatar-sm presence-avatar${isIdle(u) ? ' is-idle' : ''}`}
                        style={{ background: getAvatarColor(u.name), zIndex: 10 - i }}
                        title={`${u.name}${isIdle(u) ? ' (away)' : ''}`}
                        aria-label={`${u.name}${isIdle(u) ? ', away' : ', online'}`}
                    >
                        {initials(u.name)}
                    </span>
                ))}
                {extra.length > 0 && (
                    <button type="button" className="avatar avatar-sm presence-more" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll} aria-label={`${extra.length} more online`}>
                        +{extra.length}
                    </button>
                )}
                {showAll && extra.length > 0 && (
                    <div className="presence-popover">
                        <div className="presence-popover-title">Online</div>
                        {extra.map((u) => (
                            <div key={u.id} className={`presence-row${isIdle(u) ? ' is-idle' : ''}`}>
                                <span className="avatar avatar-xs" style={{ background: getAvatarColor(u.name) }}>{initials(u.name)}</span>
                                <span>{u.name}{isIdle(u) && <span className="muted"> (away)</span>}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
