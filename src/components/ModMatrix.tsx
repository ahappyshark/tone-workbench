import { useMemo } from 'react'
import Knob from './controls/Knob'
import Selector from './controls/Selector'
import TriggerTabs from './controls/TriggerTabs'
import type { InstrumentStore } from '../state/instrumentStore'
import {
    DIVISIONS,
    LFO_RATE,
    MOD_DEPTH,
    MOD_SOURCE_IDS,
    MOD_SOURCE_META,
    type LFOState,
    type ModDestinationMeta,
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

/**
 * Destination groups, derived from the id rather than declared.
 *
 * Effect slots are named `fx:<slot>:<param>` and grain params `grain.*`, so
 * the grouping falls out of the naming and neither instrument has to carry a
 * table of headings the other doesn't use.
 */
function groupOf(id: string): string {
    if (id.startsWith('fx:')) return 'Effects'
    if (id.startsWith('grain.')) return 'Grain'
    return 'Voice'
}

function RouteRow({ store, id, lfos, destinations }: {
    store: InstrumentStore
    id: string
    lfos: LFOState[]
    destinations: Record<string, ModDestinationMeta>
}) {
    const route = store.useRoute(id)
    const warning = store.useRouteWarning(route ?? { id, source: '', destination: '', depth: 0 })
    if (!route) return null

    const meta = destinations[route.destination]
    // What this depth actually does, in the destination's own units.
    const amount = route.depth * (meta?.scale ?? 1)
    const readout = meta?.unit
        ? `${amount >= 0 ? '+' : ''}${amount.toFixed(Math.abs(amount) < 10 ? 2 : 0)} ${meta.unit}`
        : `${amount >= 0 ? '+' : ''}${amount.toFixed(2)}`

    const groups = new Map<string, [string, ModDestinationMeta][]>()
    for (const entry of Object.entries(destinations)) {
        const group = groupOf(entry[0])
        const list = groups.get(group) ?? []
        list.push(entry)
        groups.set(group, list)
    }

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
                onChange={e => store.updateRoute(id, { source: e.target.value })}
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
                onChange={e => store.updateRoute(id, { destination: e.target.value })}
                style={{ ...select, minWidth: 150 }}
            >
                {[...groups].map(([group, entries]) => (
                    <optgroup key={group} label={group}>
                        {entries.map(([key, d]) => <option key={key} value={key}>{d.label}</option>)}
                    </optgroup>
                ))}
            </select>

            <Knob
                label="Depth"
                min={MOD_DEPTH.min}
                max={MOD_DEPTH.max}
                value={route.depth}
                defaultValue={0}
                onChange={v => store.updateRoute(id, { depth: v })}
                size={44}
                color={route.depth < 0 ? '#ff8800' : '#00ff88'}
            />

            <span style={{ fontSize: 10, opacity: 0.45, fontFamily: 'monospace', minWidth: 90 }}>
                {readout}
            </span>

            <span style={{ fontSize: 9, opacity: 0.3 }}>
                {sourceLabel(route.source, lfos)}
            </span>

            {warning && <span style={{ fontSize: 9, color: '#ff8800' }}>{warning}</span>}

            <button onClick={() => store.removeRoute(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
        </div>
    )
}

function ModMatrix({ store }: { store: InstrumentStore }) {
    const routeIds = store.useRouteIds()
    const lfos = store.useLFOs()
    const random = store.useRandom()
    const destinations = store.useDestinations()

    // Whether this instrument has any destination the scheduler reads rather
    // than the audio graph — worth saying out loud, because it changes what a
    // fast LFO into that destination actually does.
    const hasGrainRate = useMemo(
        () => Object.keys(destinations).some(id => id.startsWith('grain.')),
        [destinations],
    )

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Mod Matrix</h3>
                <button onClick={() => store.addRoute()}>+ Add Route</button>
                <span style={{ fontSize: 9, opacity: 0.35 }}>
                    depth is signed — negative inverts the source
                </span>
            </div>

            <div style={{ border: '1px solid #444', borderRadius: 8, padding: '4px 12px 12px' }}>
                {routeIds.map(id => (
                    <RouteRow key={id} store={store} id={id} lfos={lfos} destinations={destinations} />
                ))}
                {routeIds.length === 0 && (
                    <span style={{ fontSize: 11, opacity: 0.4 }}>
                        No routes — add one to connect a source to a destination
                    </span>
                )}
            </div>

            {hasGrainRate && (
                <span style={{ fontSize: 9, opacity: 0.4, display: 'block', marginTop: 6 }}>
                    grain destinations are sampled once per grain, not summed at audio rate —
                    an LFO faster than the grain rate will alias rather than wobble
                </span>
            )}

            {/* Random is a source with a rate of its own and no module to live in. */}
            <div style={{
                border: '1px solid #444', borderRadius: 8, padding: 12, marginTop: 12,
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>RANDOM S&amp;H</span>
                <TriggerTabs
                    value={random.trigger}
                    onChange={t => store.setRandom('trigger', t)}
                    titles={{
                        free: 'A new value on its own clock',
                        key: 'A new value on each note-on, held for the note',
                        sync: 'A new value every division of the transport',
                    }}
                />
                {random.trigger === 'sync' && (
                    <Selector options={DIVISIONS} value={random.division}
                        onChange={d => store.setRandom('division', d)} color="#00aaff" />
                )}
                {random.trigger === 'free' && (
                    <Knob label="Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={random.rate}
                        defaultValue={4} onChange={v => store.setRandom('rate', v)} size={44} color="#ffff00" />
                )}
                {random.trigger === 'key' && (
                    <span style={{ fontSize: 9, opacity: 0.4 }}>one value per note, held</span>
                )}
            </div>
        </div>
    )
}

export default ModMatrix
