import Knob from './controls/Knob'
import {
    addRoute,
    removeRoute,
    updateRoute,
    useFx,
    useLFOs,
    useRoute,
    useRouteIds,
    useSection,
    setParam,
} from '../state/patchStore'
import Selector from './controls/Selector'
import TriggerTabs from './controls/TriggerTabs'
import {
    DIVISIONS,
    LFO_RATE,
    MOD_DEPTH,
    MOD_DESTINATIONS,
    MOD_SOURCE_IDS,
    MOD_SOURCE_META,
    isRouteLive,
    modDestinations,
    type FxSlot,
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

function RouteRow({ id, lfos, fx }: { id: string, lfos: LFOState[], fx: FxSlot[] }) {
    const route = useRoute(id)
    if (!route) return null

    const destinations = modDestinations(fx)
    const meta = destinations[route.destination]
    // The one way to build a route that can't do anything: a per-voice source
    // aimed at an effect param, of which there is exactly one.
    const live = isRouteLive(route, fx, lfos)
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
                style={{ ...select, minWidth: 150 }}
            >
                <optgroup label="Voice">
                    {Object.keys(MOD_DESTINATIONS).map(key => (
                        <option key={key} value={key}>{MOD_DESTINATIONS[key].label}</option>
                    ))}
                </optgroup>
                {fx.length > 0 && (
                    <optgroup label="Effects">
                        {Object.entries(destinations)
                            .filter(([, d]) => d.global)
                            .map(([key, d]) => <option key={key} value={key}>{d.label}</option>)}
                    </optgroup>
                )}
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

            {!live && (
                <span style={{ fontSize: 9, color: '#ff8800' }}>
                    inactive — an effect param is global, so it needs a source
                    there is only one of
                </span>
            )}

            <button onClick={() => removeRoute(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
        </div>
    )
}

function ModMatrix() {
    const routeIds = useRouteIds()
    const lfos = useLFOs()
    const fx = useFx()
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
                {routeIds.map(id => <RouteRow key={id} id={id} lfos={lfos} fx={fx} />)}
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
                <TriggerTabs
                    value={random.trigger}
                    onChange={t => setParam('random', 'trigger', t)}
                    titles={{
                        free: 'A new value on its own clock',
                        key: 'A new value on each note-on, held for the note',
                        sync: 'A new value every division of the transport',
                    }}
                />
                {random.trigger === 'sync' && (
                    <Selector options={DIVISIONS} value={random.division}
                        onChange={d => setParam('random', 'division', d)} color="#00aaff" />
                )}
                {random.trigger === 'free' && (
                    <Knob label="Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={random.rate}
                        defaultValue={4} onChange={v => setParam('random', 'rate', v)} size={44} color="#ffff00" />
                )}
                {random.trigger === 'key' && (
                    <span style={{ fontSize: 9, opacity: 0.4 }}>one value per note, held</span>
                )}
            </div>
        </div>
    )
}

export default ModMatrix
