import { useEffect, useState } from 'react';
import { format } from 'date-fns';

export default function LiveClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <div className="live-clock">
            <div className="clock-date">{format(now, 'EEEE, MMMM d, yyyy')}</div>
            <div className="clock-time" aria-live="off">{format(now, 'HH:mm:ss')}</div>
        </div>
    );
}
