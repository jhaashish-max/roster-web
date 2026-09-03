import { AlertTriangle, Info, X } from 'lucide-react';
import { cx } from '../lib/utils';

export default function Banner({ tone = 'info', children, onClose, className }) {
    const Icon = tone === 'warning' ? AlertTriangle : Info;
    return (
        <div className={cx('banner', `banner-${tone}`, className)} role="status">
            <Icon size={16} aria-hidden="true" />
            <div className="banner-text">{children}</div>
            {onClose && (
                <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Dismiss">
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
