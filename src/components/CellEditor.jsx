import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMMON_SHIFTS, QUICK_STATUSES, normalizeStatus } from '../lib/status';
import { cx } from '../lib/utils';

const PANEL_WIDTH = 250;
const PANEL_MAX_HEIGHT = 420;

/**
 * Inline editor for one roster cell. Renders only for the cell being edited.
 * The panel is portalled to <body> and positioned next to the cell so the table's
 * scroll container never clips it. Type freely (the preview shows what will be
 * stored) or pick an option. Enter / click option = save, Esc = cancel. Empty = clear.
 */
export default function CellEditor({ value, teamShifts = [], weekend = false, onCommit, onCancel }) {
    const [text, setText] = useState(value === '-' ? '' : (value || ''));
    const [hover, setHover] = useState(-1);
    const [typed, setTyped] = useState(false); // show every option until the user starts typing
    const [pos, setPos] = useState(null);
    const anchorRef = useRef(null);
    const inputRef = useRef(null);
    const committed = useRef(false);

    // Position the floating panel next to the cell; flip above when there is no room below.
    useLayoutEffect(() => {
        const place = () => {
            const cell = anchorRef.current?.closest('td') || anchorRef.current;
            if (!cell) return;
            const r = cell.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const left = Math.max(8, Math.min(r.left, vw - PANEL_WIDTH - 8));
            const spaceBelow = vh - r.bottom;
            const openUp = spaceBelow < Math.min(PANEL_MAX_HEIGHT, 320) && r.top > spaceBelow;
            setPos({
                left,
                top: openUp ? undefined : r.bottom + 2,
                bottom: openUp ? vh - r.top + 2 : undefined,
                maxHeight: Math.min(PANEL_MAX_HEIGHT, Math.max(180, (openUp ? r.top : spaceBelow) - 16)),
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, []);

    const placed = pos !== null;
    useEffect(() => {
        if (!placed) return undefined;
        const raf = requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
        return () => cancelAnimationFrame(raf);
    }, [placed]);

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
        if (!typed || !qy) return options;
        return options.filter((o) => o.value.toLowerCase().includes(qy) || o.label.toLowerCase().includes(qy));
    }, [options, text, typed]);

    const preview = normalizeStatus(text, { weekend });
    const dirty = text.trim() !== (value === '-' ? '' : (value || '')).trim();

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
    const previewText = preview.kind === 'empty'
        ? (dirty ? 'Will clear the cell' : 'Type a shift or pick one below')
        : preview.value === text.trim() ? `Saves as ${preview.value}` : `Will save as ${preview.value}`;

    const panel = pos && (
        <div
            className="cell-editor"
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: PANEL_WIDTH, zIndex: 400 }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <input
                ref={inputRef}
                className="cell-editor-input"
                value={text}
                onChange={(e) => { setText(e.target.value); setTyped(true); setHover(-1); }}
                onKeyDown={onKeyDown}
                onBlur={() => { setTimeout(() => { if (!committed.current) commit(text); }, 120); }}
                placeholder="Type or pick…"
                aria-label="Cell status"
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
            />
            <div className={cx('cell-editor-preview', `kind-${preview.kind}`, !dirty && preview.kind === 'empty' && 'is-hint')}>{previewText}</div>
            <ul className="cell-editor-list" role="listbox" style={{ maxHeight: pos.maxHeight - 84 }}>
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

    return (
        <>
            <span ref={anchorRef} className="cell-editor-anchor" aria-hidden="true" />
            {panel && createPortal(panel, document.body)}
        </>
    );
}
