import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Calendar, Table, PieChart, Settings, Moon, Sun, RefreshCw, FileText, CheckSquare, Clock } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, onNavigate, onAction, darkMode, isAdmin, canReview }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const commands = useMemo(() => {
        const list = [
            { id: 'dashboard', label: 'Go to Overview', icon: Calendar, action: () => onNavigate('dashboard') },
            { id: 'roster', label: 'Go to Roster', icon: Table, action: () => onNavigate('roster') },
            { id: 'summary', label: 'Go to Reports', icon: PieChart, action: () => onNavigate('summary') },
            { id: 'requests', label: 'Go to Requests', icon: FileText, action: () => onNavigate('requests') },
        ];
        if (canReview) list.push({ id: 'review', label: 'Go to Approvals', icon: CheckSquare, action: () => onNavigate('review') });
        if (isAdmin) {
            list.push({ id: 'auto-enablement', label: 'Go to Auto Bucket Mgmt', icon: Clock, action: () => onNavigate('auto-enablement') });
            list.push({ id: 'team-settings', label: 'Go to Team Settings', icon: Settings, action: () => onNavigate('team-settings') });
        }
        list.push({ id: 'theme', label: darkMode ? 'Switch to light mode' : 'Switch to dark mode', icon: darkMode ? Sun : Moon, action: () => onAction('toggle-theme') });
        list.push({ id: 'refresh', label: 'Refresh data', icon: RefreshCw, action: () => onAction('refresh') });
        return list;
    }, [onNavigate, onAction, darkMode, isAdmin, canReview]);

    const filtered = useMemo(() => {
        const qy = query.trim().toLowerCase();
        return qy ? commands.filter((c) => c.label.toLowerCase().includes(qy)) : commands;
    }, [query, commands]);

    useEffect(() => {
        if (isOpen) {
            const raf = requestAnimationFrame(() => inputRef.current?.focus());
            return () => cancelAnimationFrame(raf);
        }
        return undefined;
    }, [isOpen]);

    useEffect(() => {
        const activeEl = listRef.current?.querySelector('.command-item.active');
        activeEl?.scrollIntoView?.({ block: 'nearest' });
    }, [activeIndex]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0)); }
            else if (e.key === 'Enter' && filtered.length > 0) { filtered[Math.min(activeIndex, filtered.length - 1)]?.action(); onClose(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filtered, activeIndex, onClose]);

    if (!isOpen) return null;
    const current = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

    return (
        <div className="command-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
                <div className="command-input-wrapper">
                    <Search size={18} className="muted" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="command-input"
                        placeholder="Type a command…"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                        aria-label="Search commands"
                    />
                    <kbd className="kbd">ESC</kbd>
                </div>
                <div className="command-list" ref={listRef} role="listbox">
                    {filtered.length === 0 ? (
                        <div className="command-empty">No commands found</div>
                    ) : filtered.map((cmd, i) => (
                        <button
                            key={cmd.id}
                            type="button"
                            role="option"
                            aria-selected={i === current}
                            className={`command-item${i === current ? ' active' : ''}`}
                            onMouseEnter={() => setActiveIndex(i)}
                            onClick={() => { cmd.action(); onClose(); }}
                        >
                            <cmd.icon size={16} aria-hidden="true" />
                            <span>{cmd.label}</span>
                        </button>
                    ))}
                </div>
                <div className="command-footer">
                    <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navigate</span>
                    <span><kbd className="kbd">↵</kbd> select</span>
                    <span><kbd className="kbd">esc</kbd> close</span>
                </div>
            </div>
        </div>
    );
}
