import { useEffect, useMemo, useRef, useState } from 'react';
import { COMMON_SHIFTS, QUICK_STATUSES, normalizeStatus } from '../lib/status';
import { cx } from '../lib/utils';

/**
 * Inline editor for one roster cell. Renders only for the cell being edited.
 * Type freely (the preview shows what will be stored) or pick an option.
 * Enter / click option = save, Esc = cancel. Empty value = clear the cell.
 */
export default function CellEditor({ value, teamShifts = [], weekend = false, onCommit, onCancel }) {
    const [text, setText] = useState(value === '-' ? '' : (value || ''));
    const [hover, setHover] = useState(-1);
    const inputRef = useRef(null);
    const committed = useRef(false);

    useEffect(() => {
        const raf = requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
        return () => cancelAnimationFrame(raf);
    }, []);

    const options = useMemo(() => {
        const seen = new Set();
        const out = [];
        const add = (v, label, group) => {
            const key = v.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ value: v, label: label || v, group });
        };
        teamShifts.forEach((s) => add(s, s, 'Team shifts'));
        COMMON_SHIFTS.forEach((s) => add(s, s, 'Shifts'));
        QUICK_STATUSES.forEach((s) => add(s.value, s.label, 'Codes'));
        add('', 'Clear cell', 'Codes');
        return out;
    }, [teamShifts]);

    const filtered = useMemo(() => {
        const qy = text.trim().toLowerCase();
        if (!qy) return options;
        return options.filter((o) => o.value.toLowerCase().includes(qy) || o.label.toLowerCase().includes(qy));
    }, [options, text]);

    const preview = normalizeStatus(text, { weekend });

    const commit = (val) => {
        if (committed.current) return;
        committed.current = true;
        onCommit(normalizeStatus(val, { weekend }).value);
    };

    const onKeyDown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            if (hover >= 0 && filtered[hover]) commit(filtered[hover].value);
            else commit(text);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            committed.current = true;
            onCancel();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHover((h) => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHover((h) => Math.max(h - 1, -1));
        } else if (e.key === 'Tab') {
            commit(text);
        }
    };

    let lastGroup = null;

    return (
        <div className="cell-editor" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <input
                ref={inputRef}
                className="cell-editor-input"
                value={text}
                onChange={(e) => { setText(e.target.value); setHover(-1); }}
                onKeyDown={onKeyDown}
                onBlur={() => { setTimeout(() => { if (!committed.current) commit(text); }, 120); }}
                placeholder="Type or pick…"
                aria-label="Cell status"
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
            />
            <div className={cx('cell-editor-preview', `kind-${preview.kind}`)}>
                {preview.kind === 'empty' ? 'Will clear the cell' : preview.value === text.trim() ? `Saves as ${preview.value}` : `Will save as ${preview.value}`}
            </div>
            <ul className="cell-editor-list" role="listbox">
                {filtered.map((o, i) => {
                    const showGroup = o.group !== lastGroup;
                    lastGroup = o.group;
                    const n = normalizeStatus(o.value, { weekend });
                    return (
                        <li key={o.value || '__clear'} role="option" aria-selected={i === hover}>
                            {showGroup && <div className="cell-editor-group">{o.group}</div>}
                            <button
                                type="button"
                                className={cx('cell-editor-option', i === hover && 'is-hover')}
                                onMouseEnter={() => setHover(i)}
                                onMouseDown={(e) => { e.preventDefault(); commit(o.value); }}
                            >
                                <span className={cx('status-dot', `kind-${n.kind}`, n.period && `period-${n.period}`)} aria-hidden="true" />
                                {o.label}
                            </button>
                        </li>
                    );
                })}
                {filtered.length === 0 && <li className="cell-editor-empty">Press Enter to save “{text.trim()}”</li>}
            </ul>
        </div>
    );
}
