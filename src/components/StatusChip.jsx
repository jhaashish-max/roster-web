import { normalizeStatus } from '../lib/status';
import { cx } from '../lib/utils';

/** Small pill showing a roster status in its pastel colour. */
export default function StatusChip({ status, weekend = false, className, title }) {
    const n = normalizeStatus(status, { weekend });
    const label = n.kind === 'empty' ? '–' : n.value;
    return (
        <span className={cx('status-chip', `kind-${n.kind}`, n.period && `period-${n.period}`, className)} title={title || (status !== n.value ? `Stored as "${status}"` : undefined)}>
            {label}
        </span>
    );
}
