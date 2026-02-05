import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Calendar, Table, PieChart, Settings, Moon, Sun, RefreshCw } from 'lucide-react';

const CommandPalette = ({ isOpen, onClose, onNavigate, onAction, darkMode }) => {
    const [query, setQuery] = useState('');
    const inputRef = useRef(null);

    const commands = useMemo(() => [
        { id: 'dashboard', label: 'Go to Dashboard', icon: Calendar, action: () => onNavigate('dashboard') },
        { id: 'roster', label: 'Go to Roster View', icon: Table, action: () => onNavigate('roster') },
        { id: 'summary', label: 'Go to Summary', icon: PieChart, action: () => onNavigate('summary') },
        { id: 'settings', label: 'Go to Settings', icon: Settings, action: () => onNavigate('settings') },
        { id: 'theme', label: darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode', icon: darkMode ? Sun : Moon, action: () => onAction('toggle-theme') },
        { id: 'refresh', label: 'Refresh Data', icon: RefreshCw, action: () => onAction('refresh') },
    ], [onNavigate, onAction, darkMode]);

    const filtered = useMemo(() => {
        if (!query) return commands;
        return commands.filter(c =>
            c.label.toLowerCase().includes(query.toLowerCase())
        );
    }, [query, commands]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setQuery('');
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
            if (e.key === 'Enter' && filtered.length > 0) {
                filtered[0].action();
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, filtered, onClose]);

    if (!isOpen) return null;

    return (
        <div className="command-overlay" onClick={onClose}>
            <div className="command-palette" onClick={(e) => e.stopPropagation()}>
                <div className="command-input-wrapper">
                    <Search size={18} className="command-search-icon" />
                    <input
                        ref={inputRef}
                        type="text"
                        className="command-input"
                        placeholder="Type a command..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd className="command-kbd">ESC</kbd>
                </div>
                <div className="command-list">
                    {filtered.length === 0 ? (
                        <div className="command-empty">No commands found</div>
                    ) : (
                        filtered.map((cmd) => (
                            <button
                                key={cmd.id}
                                className="command-item"
                                onClick={() => {
                                    cmd.action();
                                    onClose();
                                }}
                            >
                                <cmd.icon size={16} />
                                <span>{cmd.label}</span>
                            </button>
                        ))
                    )}
                </div>
                <div className="command-footer">
                    <span><kbd>↵</kbd> to select</span>
                    <span><kbd>esc</kbd> to close</span>
                </div>
            </div>
        </div>
    );
};

export default CommandPalette;
