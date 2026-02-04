import React, { useState, useEffect, useRef } from 'react';

const CellEditor = ({ value, onChange, onFinish }) => {
    const [mode, setMode] = useState('select'); // 'select' | 'input'
    const [currentValue, setCurrentValue] = useState(value);
    const inputRef = useRef(null);

    // Predefined options
    const OPTIONS = [
        { value: 'PL', label: 'PL (Planned Leave)' },
        { value: 'WO', label: 'WO (Week Off)' },
        { value: '10:00 - 19:00', label: '10:00 - 19:00' },
        { value: '18:00 - 03:00', label: '18:00 - 03:00' },
        { value: '09:00 - 18:00', label: '09:00 - 18:00' },
        { value: '11:00 - 20:00', label: '11:00 - 20:00' },
        { value: 'WFH', label: 'WFH' },
        { value: 'WL', label: 'WL (Work Leave)' },
        { value: 'OH', label: 'OH (Optional Holiday)' }
    ];

    useEffect(() => {
        // If initial value is not in options, switch to input mode
        const isKnown = OPTIONS.some(opt => opt.value === value);
        if (!isKnown && value) {
            setMode('input');
        }
    }, []);

    const handleSelectChange = (e) => {
        const val = e.target.value;
        if (val === 'custom') {
            setMode('input');
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            onChange(val); // Update immediately logic or wait for blur? 
            // Usually immediate update is better for select
            if (onFinish) onFinish(val);
        }
    };

    const handleInputBlur = () => {
        if (onFinish) onFinish(currentValue);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            inputRef.current?.blur();
        }
        if (e.key === 'Escape') {
            // Revert? Or just blur?
            if (onFinish) onFinish(currentValue);
        }
    };

    if (mode === 'input') {
        return (
            <div className="cell-editor-input-wrapper">
                <input
                    ref={inputRef}
                    type="text"
                    className="cell-input"
                    value={currentValue}
                    onChange={(e) => {
                        setCurrentValue(e.target.value);
                        onChange(e.target.value);
                    }}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
                <button
                    className="cell-editor-back-btn"
                    onMouseDown={(e) => { e.preventDefault(); setMode('select'); }}
                    title="Back to dropdown"
                >
                    ▼
                </button>
            </div>
        );
    }

    return (
        <select
            className="cell-select"
            value={OPTIONS.some(o => o.value === currentValue) ? currentValue : 'custom'}
            onChange={handleSelectChange}
            autoFocus
        >
            <option value="" disabled>Select Status</option>
            {OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            <option value="custom" style={{ fontStyle: 'italic', color: 'var(--accent-primary)' }}>+ Custom / Edit Text</option>
        </select>
    );
};

export default CellEditor;
