import Knob from './controls/Knob'
import Selector from './controls/Selector'
import type { InstrumentStore } from '../state/instrumentStore'
import {
    FX_LABELS,
    FX_MOD_PARAMS,
    FX_PARAM_LABELS,
    FX_RANGES,
    FX_TYPES,
    FX_TYPE_PARAMS,
    defaultFxParams,
    type FxParams,
} from '../audio/patchTypes'

/** Distinct colours per knob so a chorus doesn't look like a delay. */
const PARAM_COLORS: Record<keyof FxParams, string> = {
    drive: '#ff4488',
    rate: '#00ff88',
    depth: '#aa44ff',
    spread: '#00aaff',
    time: '#00aaff',
    feedback: '#ff8800',
    decay: '#aa44ff',
    preDelay: '#ffff00',
}

/** Two decimals is noise on a spread of 180 degrees. */
const PARAM_PRECISION: Partial<Record<keyof FxParams, number>> = {
    spread: 0,
    time: 3,
    preDelay: 3,
}

function FxSlotPanel({ store, id, index, count, modCount }: {
    store: InstrumentStore
    id: string
    index: number
    count: number
    modCount: number
}) {
    const slot = store.useFxSlot(id)
    if (!slot) return null

    const defaults = defaultFxParams()
    const modulatable = FX_MOD_PARAMS[slot.type]

    return (
        <div style={{
            border: '1px solid #444',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 230,
            // A bypassed slot stays visible and keeps its settings — it just
            // steps out of the signal path.
            opacity: slot.enabled ? 1 : 0.45,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, opacity: 0.5, letterSpacing: 1 }}>
                    {index + 1} · {FX_LABELS[slot.type].toUpperCase()}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        onClick={() => store.moveFx(id, -1)}
                        disabled={index === 0}
                        title="earlier in the chain"
                        style={{ fontSize: 10, opacity: index === 0 ? 0.3 : 1 }}
                    >↑</button>
                    <button
                        onClick={() => store.moveFx(id, 1)}
                        disabled={index === count - 1}
                        title="later in the chain"
                        style={{ fontSize: 10, opacity: index === count - 1 ? 0.3 : 1 }}
                    >↓</button>
                    <button
                        onClick={() => store.updateFx(id, { enabled: !slot.enabled })}
                        style={{ fontSize: 10, color: slot.enabled ? '#00ff88' : '#888' }}
                    >{slot.enabled ? 'on' : 'byp'}</button>
                    <button onClick={() => store.removeFx(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
                </div>
            </div>

            <Selector options={FX_TYPES} value={slot.type} onChange={t => store.updateFx(id, { type: t })} />

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Knob
                    label="Wet"
                    min={FX_RANGES.wet.min}
                    max={FX_RANGES.wet.max}
                    value={slot.wet}
                    defaultValue={0.3}
                    onChange={v => store.updateFx(id, { wet: v })}
                    size={48}
                />
                {/* Only the params this effect actually has. The patch keeps
                    the rest, so switching type and back doesn't lose them. */}
                {FX_TYPE_PARAMS[slot.type].map(param => (
                    <Knob
                        key={param}
                        label={FX_PARAM_LABELS[param]}
                        min={FX_RANGES[param].min}
                        max={FX_RANGES[param].max}
                        value={slot.params[param]}
                        defaultValue={defaults[param]}
                        onChange={v => store.setFxParam(id, param, v)}
                        size={48}
                        color={PARAM_COLORS[param]}
                        precision={PARAM_PRECISION[param]}
                    />
                ))}
            </div>

            <span style={{ fontSize: 9, opacity: 0.4 }}>
                {modCount > 0
                    ? `${modCount} route${modCount === 1 ? '' : 's'} in`
                    : `modulate: ${modulatable.map(p => FX_PARAM_LABELS[p]).join(', ')}`}
            </span>
        </div>
    )
}

function FXRack({ store }: { store: InstrumentStore }) {
    const fxIds = store.useFxIds()
    const routes = store.useRoutes()

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>FX Chain</h3>
                <button onClick={() => store.addFx()}>+ Add FX</button>
                <span style={{ fontSize: 9, opacity: 0.35 }}>
                    left to right is the signal path · one chain, after the voices are summed
                </span>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {fxIds.map((id, i) => (
                    <FxSlotPanel
                        key={id}
                        store={store}
                        id={id}
                        index={i}
                        count={fxIds.length}
                        modCount={routes.filter(r => r.destination.startsWith(`fx:${id}:`)).length}
                    />
                ))}
                {fxIds.length === 0 && (
                    <span style={{ fontSize: 11, opacity: 0.4 }}>No effects — add one above</span>
                )}
            </div>
        </div>
    )
}

export default FXRack
