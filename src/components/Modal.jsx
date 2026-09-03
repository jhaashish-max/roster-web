import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/utils';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: role=dialog, aria-modal, labelled by its title, Esc closes,
 * focus moves inside on open and is restored on close, Tab is trapped inside.
 */
export default function Modal({ open, onClose, title, subtitle, icon, children, footer, size = 'md', closeOnOverlay = true, className, busy = false }) {
    const panelRef = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!open) return undefined;
        const previouslyFocused = document.activeElement;
        const panel = panelRef.current;
        const focusFirst = () => {
            const first = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE);
            (first || panel)?.focus();
        };
        const raf = requestAnimationFrame(focusFirst);
        const onKey = (e) => {
            if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose?.(); }
            if (e.key === 'Tab' && panel) {
                const nodes = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
                if (nodes.length === 0) return;
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
        };
    }, [open, onClose, busy]);

    if (!open) return null;

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (closeOnOverlay && !busy && e.target === e.currentTarget) onClose?.(); }}>
            <div
                ref={panelRef}
                className={cx('modal-panel', `modal-${size}`, className)}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                tabIndex={-1}
            >
                {(title || onClose) && (
                    <div className="modal-head">
                        <div className="modal-head-text">
                            {title && (
                                <h2 id={titleId} className="modal-title">
                                    {icon && <span className="modal-icon" aria-hidden="true">{icon}</span>}
                                    {title}
                                </h2>
                            )}
                            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
                        </div>
                        {onClose && (
                            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog" disabled={busy}>
                                <X size={18} />
                            </button>
                        )}
                    </div>
                )}
                <div className="modal-body">{children}</div>
                {footer && <div className="modal-foot">{footer}</div>}
            </div>
        </div>
    );
}
