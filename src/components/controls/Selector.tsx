interface SelectorProps<T extends string> {
    options: readonly T[]
    value: T
    onChange: (value: T) => void
    color?: string
}

/** A row of small mutually-exclusive buttons — waves, modes, filter types. */
function Selector<T extends string>({ options, value, onChange, color = '#00ff88' }: SelectorProps<T>) {
    return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {options.map(option => (
                <button
                    key={option}
                    onClick={() => onChange(option)}
                    style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        background: value === option ? color : '#333',
                        color: value === option ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                    }}
                >
                    {option}
                </button>
            ))}
        </div>
    )
}

export default Selector
