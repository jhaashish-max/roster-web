import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Multi-select team filter. `selectedTeams = []` means "All teams". */
export default function TeamSelector({ teams, selectedTeams, setSelectedTeams }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', handler);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const allSelected = selectedTeams.length === 0;
    const isChecked = (name) => allSelected || selectedTeams.includes(name);

    const toggleTeam = (name) => {
        if (allSelected) {
            setSelectedTeams(teams.map((t) => t.name).filter((n) => n !== name));
        } else {
            setSelectedTeams((prev) => {
                const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
                return next.length === teams.length || next.length === 0 ? [] : next;
            });
        }
    };

    const label = allSelected ? 'All teams' : selectedTeams.length === 1 ? selectedTeams[0] : `${selectedTeams.length} teams`;

    return (
        <div className="team-selector" ref={ref}>
            <span className="team-selector-label">Team</span>
            <button type="button" className="team-selector-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={selectedTeams.join(', ') || 'All teams'}>
                <span className="team-selector-value">{label}</span>
                <ChevronDown size={14} aria-hidden="true" className={open ? 'rotate-180' : undefined} />
            </button>
            {open && (
                <div className="team-selector-menu" role="listbox" aria-multiselectable="true">
                    <button
                        type="button"
                        className="team-selector-all"
                        onClick={() => setSelectedTeams(allSelected ? (teams.length > 0 ? [teams[0].name] : []) : [])}
                    >
                        {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                    <div className="divider" />
                    {teams.map((t) => (
                        <label key={t.id} className="team-selector-option" role="option" aria-selected={isChecked(t.name)}>
                            <input type="checkbox" checked={isChecked(t.name)} onChange={() => toggleTeam(t.name)} />
                            <span>{t.name}</span>
                            {t.archived && <span className="tag tag-muted">archived</span>}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
