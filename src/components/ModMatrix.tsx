import Knob from './controls/Knob'
import {
    addRoute,
    removeRoute,
    updateRoute,
    useLFOs,
    useRoute,
    useRouteIds,
    useSection,
    setParam,
} from '../state/patchStore'
import Selector from './controls/Selector'
import {
    DIVISIONS,
    LFO_RATE,
    MOD_DEPTH,
    MOD_DESTINATIONS,
    MOD_SOURCE_IDS,
    MOD_SOURCE_META,
    type LFOState,
} from '../audio/patchTypes'

const select: React.CSSProperties = {
    background: '#222',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: 4,
    padding: '4px 6px',
    fontSize: 11,
}

function sourceLabel(id: string, lfos: LFOState[]): string {
    if (!id.startsWith('lfo:')) {
        return MOD_SOURCE_META[id as keyof typeof MOD_SOURCE_META]?.label ?? id
    }
    const lfoId = id.slice(4)
    const index = lfos.findIndex(l => l.id === lfoId)
    return index === -1 ? 'missing LFO' : `LFO ${index + 1}`
}

function RouteRow({ id, lfos }: { id: string, lfos: LFOState[] }) {
    const route = useRoute(id)
    if (!route) return null

    const meta = MOD_DESTINATIONS[route.destination]
    // What this depth actually does, in the destination's own units.
    const amount = route.depth * (meta?.scale ?? 1)
    const readout = meta?.unit
        ? `${amount >= 0 ? '+' : ''}${amount.toFixed(0)} ${meta.unit}`
        : `${amount >= 0 ? '+' : ''}${amount.toFixed(2)}`

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '6px 0',
            borderTop: '1px solid #2a2a2a',
        }}>
            <select
                value={route.source}
                onChange={e => updateRoute(id, { source: e.target.value })}
                style={{ ...select, minWidth: 130 }}
            >
                {MOD_SOURCE_IDS.map(s => (
                    <option key={s} value={s}>{MOD_SOURCE_META[s].label}</option>
                ))}
                {lfos.map((l, i) => (
                    <option key={l.id} value={`lfo:${l.id}`}>LFO {i + 1}</option>
                ))}
            </select>

            <span style={{ opacity: 0.35, fontSize: 11 }}>→</span>

            <select
                value={route.destination}
                onChange={e => updateRoute(id, { destination: e.target.value })}
                style={{ ...select, minWidth: 130 }}
            >
                {Object.entries(MOD_DESTINATIONS).map(([key, d]) => (
                    <option key={key} value={key}>{d.label}</option>
                ))}
            </select>

            <Knob
                label="Depth"
                min={MOD_DEPTH.min}
                max={MOD_DEPTH.max}
                value={route.depth}
                defaultValue={0}
                onChange={v => updateRoute(id, { depth: v })}
                size={44}
                color={route.depth < 0 ? '#ff8800' : '#00ff88'}
            />

            <span style={{ fontSize: 10, opacity: 0.45, fontFamily: 'monospace', minWidth: 90 }}>
                {readout}
            </span>

            <span style={{ fontSize: 9, opacity: 0.3 }}>
                {sourceLabel(route.source, lfos)}
            </span>

            <button onClick={() => removeRoute(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
        </div>
    )
}

function ModMatrix() {
    const routeIds = useRouteIds()
    const lfos = useLFOs()
    const random = useSection('random')

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Mod Matrix</h3>
                <button onClick={() => addRoute()}>+ Add Route</button>
                <span style={{ fontSize: 9, opacity: 0.35 }}>
                    depth is signed — negative inverts the source
                </span>
            </div>

            <div style={{ border: '1px solid #444', borderRadius: 8, padding: '4px 12px 12px' }}>
                {routeIds.map(id => <RouteRow key={id} id={id} lfos={lfos} />)}
                {routeIds.length === 0 && (
                    <span style={{ fontSize: 11, opacity: 0.4 }}>
                        No routes — add one to connect a source to a destination
                    </span>
                )}
            </div>

            {/* Random is a source with a rate of its own and no module to live in. */}
            <div style={{
                border: '1px solid #444', borderRadius: 8, padding: 12, marginTop: 12,
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>RANDOM S&amp;H</span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setParam('random', 'sync', false)}
                        style={tab(!random.sync)}>free</button>
                    <button onClick={() => setParam('random', 'sync', true)}
                        style={tab(random.sync)}>sync</button>
                </div>
                {random.sync
                    ? <Selector options={DIVISIONS} value={random.division}
                        onChange={d => setParam('random', 'division', d)} color="#00aaff" />
                    : <Knob label="Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={random.rate}
                        defaultValue={4} onChange={v => setParam('random', 'rate', v)} size={44} color="#ffff00" />}
            </div>
        </div>
    )
}

function tab(active: boolean): React.CSSProperties {
    return {
        fontSize: 9, padding: '2px 6px',
        background: active ? '#00ff88' : '#333',
        color: active ? '#000' : '#fff',
        border: 'none', borderRadius: 3, cursor: 'pointer',
    }
}

export default ModMatrix
