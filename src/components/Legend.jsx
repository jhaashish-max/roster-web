const ITEMS = [
    { cls: 'kind-shift period-morning', label: 'Morning' },
    { cls: 'kind-shift period-afternoon', label: 'Afternoon' },
    { cls: 'kind-shift period-night', label: 'Night' },
    { cls: 'kind-oncall', label: 'On call' },
    { cls: 'kind-wo', label: 'WO' },
    { cls: 'kind-pl', label: 'PL' },
    { cls: 'kind-sl', label: 'SL' },
    { cls: 'kind-wl', label: 'WL' },
    { cls: 'kind-wfh', label: 'WFH' },
    { cls: 'kind-oh', label: 'OH' },
    { cls: 'kind-holiday', label: 'Holiday' },
    { cls: 'kind-exit', label: 'Exit' },
];

export default function Legend({ compact = false }) {
    return (
        <div className={compact ? 'legend legend-compact' : 'legend'} aria-label="Shift legend">
            {ITEMS.map((it) => (
                <span key={it.label} className={`status-chip legend-chip ${it.cls}`}>{it.label}</span>
            ))}
        </div>
    );
}
