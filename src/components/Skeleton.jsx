import { cx } from '../lib/utils';

export function Skeleton({ width, height = 14, className, style }) {
    return <span className={cx('skeleton', className)} style={{ width, height, ...style }} aria-hidden="true" />;
}

/** Placeholder for the roster grid while rows load. */
export function GridSkeleton({ rows = 6, cols = 14 }) {
    return (
        <div className="card skeleton-grid" aria-busy="true" aria-label="Loading roster">
            <div className="skeleton-grid-row skeleton-grid-head">
                <Skeleton width={160} />
                {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} width={44} />)}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="skeleton-grid-row">
                    <Skeleton width={140} />
                    {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} width={64} height={22} />)}
                </div>
            ))}
        </div>
    );
}

export function CardSkeleton({ lines = 3 }) {
    return (
        <div className="card skeleton-card" aria-busy="true">
            <Skeleton width="40%" height={16} />
            {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} width={`${90 - i * 12}%`} />)}
        </div>
    );
}

export function StatSkeleton({ count = 6 }) {
    return (
        <div className="stats-grid" aria-busy="true">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="stat-card stat-skeleton">
                    <Skeleton width={28} height={28} />
                    <Skeleton width="60%" />
                    <Skeleton width="30%" height={28} />
                </div>
            ))}
        </div>
    );
}
