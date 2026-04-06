import React, {useEffect, useRef, useState} from 'react';

export function CustomSelect({className = '', value, onChange, options}) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', handleOutsideClick);
        return () => document.removeEventListener('pointerdown', handleOutsideClick);
    }, []);

    const selected = options.find((option) => option.value === value);

    return (
        <div ref={rootRef} className={`custom-select ${className}`}>
            <button type="button" className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                    onClick={() => setIsOpen((prev) => !prev)}>
                <span>{selected?.label || 'Выберите значение'}</span>
                <span className="custom-select-chevron" aria-hidden="true">expand_more</span>
            </button>
            {isOpen && <div className="custom-select-menu">
                {options.map((option) => (
                    <button key={option.value} type="button"
                            className={`custom-select-option ${option.value === value ? 'active' : ''}`}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}>
                        {option.label}
                    </button>
                ))}
            </div>}
        </div>
    );
}
