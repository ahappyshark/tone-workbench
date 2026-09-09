import { TRIGGER_MODES, type TriggerMode } from '../../audio/patchTypes'

interface TriggerTabsProps {
    value: TriggerMode
    onChange: (value: TriggerMode) => void
    /** what each mode means for *this* module — they differ per source */
    titles?: Partial<Record<TriggerMode, string>>
}

const COLORS: Record<TriggerMode, string> = {
    free: '#00ff88',
    key: '#ffff00',
    sync: '#00aaff',
}

/**
 * Where a modulation source gets its phase: free-running, restarted by the
 * keyboard, or locked to the transport.
 *
 * Shared by the LFOs, the random source and the mod envelope so the three
 * can't drift into having three different words for the same idea.
 */
function TriggerTabs({ value, onChange, titles }: TriggerTabsProps) {
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {TRIGGER_MODES.map(mode => (
                <button
                    key={mode}
                    onClick={() => onChange(mode)}
                    title={titles?.[mode]}
                    style={{
                        fontSize: 9,
                        padding: '2px 6px',
                        background: value === mode ? COLORS[mode] : '#333',
                        color: value === mode ? '#000' : '#fff',
                        border: 'none',
                        borderRadius: 3,
                        cursor: 'pointer',
                    }}
                >
                    {mode}
                </button>
            ))}
        </div>
    )
}

export default TriggerTabs
