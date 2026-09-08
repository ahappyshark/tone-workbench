import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { useParamRegistry, useParamRegistryVersion } from '../../hooks/useParamRegistry'
import Knob from './Knob'
import { removeLFO, updateLFO, useLFOState } from '../../state/patchStore'
import { OSC_TYPES, LFO_RATE, LFO_DEPTH, type OscType } from '../../audio/patchTypes'

interface LFOModuleProps {
  id: string
}

function LFOModule({ id }: LFOModuleProps) {
  const lfoRef = useRef<Tone.LFO | null>(null)
  const { getAll } = useParamRegistry()
  // Re-render when params appear/disappear so the dropdown and the routing
  // effect below both see the current registry.
  const registryVersion = useParamRegistryVersion()

  const state = useLFOState(id)

  useEffect(() => {
    const lfo = new Tone.LFO()
    lfoRef.current = lfo
    return () => {
      lfo.dispose()
      lfoRef.current = null
    }
  }, [])

  // Destructured to primitives so each effect below depends only on the one
  // value it applies, not on the whole LFO object.
  const waveform = state?.waveform
  const rate = state?.rate
  const depthLow = state?.min
  const depthHigh = state?.max
  const running = state?.running
  const target = state?.target ?? ''

  // Each effect drives one facet of the node from patch state, so loading a
  // preset and turning a knob go through exactly the same code path.
  useEffect(() => {
    if (waveform) lfoRef.current!.type = waveform
  }, [waveform])

  useEffect(() => {
    if (rate !== undefined) lfoRef.current!.frequency.rampTo(rate, 0.1)
  }, [rate])

  useEffect(() => {
    if (depthLow === undefined || depthHigh === undefined) return
    lfoRef.current!.min = depthLow
    lfoRef.current!.max = depthHigh
  }, [depthLow, depthHigh])

  useEffect(() => {
    if (running === undefined) return
    if (running) lfoRef.current!.start()
    else lfoRef.current!.stop()
  }, [running])

  // Routing lives in an effect (not the change handler) so a target restored
  // from a preset connects too — including when the target param registers
  // after this module mounted, which the registryVersion dep covers.
  useEffect(() => {
    const lfo = lfoRef.current
    if (!lfo || !target) return
    const entry = getAll().get(target)
    if (!entry) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lfo.connect(entry.signal as any)
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { lfo.disconnect(entry.signal as any) } catch { /* already gone */ }
    }
  }, [target, registryVersion, getAll])

  if (!state) return null

  const targetEntry = target ? getAll().get(target) : undefined
  const depthMin = targetEntry?.min ?? LFO_DEPTH.min
  const depthMax = targetEntry?.max ?? LFO_DEPTH.max

  const handleTarget = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value
    const entry = next ? getAll().get(next) : undefined
    // Snap the depth knobs to the new param's range. Only on an explicit
    // pick — a preset load must keep the depths it was saved with.
    if (entry && entry.min !== undefined && entry.max !== undefined) {
      updateLFO(id, { target: next, min: entry.min, max: entry.max })
    } else {
      updateLFO(id, { target: next })
    }
  }

  const params = [...getAll().entries()]

  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: 8,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minWidth: 200
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, opacity: 0.5 }}>LFO</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => updateLFO(id, { running: !state.running })}
            style={{ fontSize: 10, color: state.running ? '#00ff88' : '#888' }}
          >
            {state.running ? '■ stop' : '▶ run'}
          </button>
          <button
            onClick={() => removeLFO(id)}
            style={{ fontSize: 10, color: '#ff4444' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* waveform selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {OSC_TYPES.map(w => (
          <button
            key={w}
            onClick={() => updateLFO(id, { waveform: w as OscType })}
            style={{
              fontSize: 9,
              padding: '2px 6px',
              background: state.waveform === w ? '#00ff88' : '#333',
              color: state.waveform === w ? '#000' : '#fff',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer'
            }}
          >
            {w}
          </button>
        ))}
      </div>

      {/* knobs */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Knob
          label="Rate"
          min={LFO_RATE.min}
          max={LFO_RATE.max}
          value={state.rate}
          defaultValue={1}
          onChange={v => updateLFO(id, { rate: v })}
          size={48}
          color="#00ff88"
        />
        <Knob
          label="Min"
          min={depthMin}
          max={depthMax}
          value={state.min}
          defaultValue={0}
          onChange={v => updateLFO(id, { min: v })}
          size={48}
          color="#ff8800"
        />
        <Knob
          label="Max"
          min={depthMin}
          max={depthMax}
          value={state.max}
          defaultValue={1}
          onChange={v => updateLFO(id, { max: v })}
          size={48}
          color="#aa44ff"
        />
      </div>

      {/* target selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, opacity: 0.5 }}>Target</span>
        <select
          value={target}
          onChange={handleTarget}
          style={{
            background: '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11
          }}
        >
          <option value="">— none —</option>
          {/* A preset can name a param no patch has registered yet; keep it
              selectable rather than silently resetting the routing. */}
          {target && !targetEntry && <option value={target}>{target} (missing)</option>}
          {params.map(([paramId, entry]) => (
            <option key={paramId} value={paramId}>{entry.label}</option>
          ))}
        </select>
      </div>

      {target && (
        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center' }}>
          {state.min.toFixed(1)} → {state.max.toFixed(1)} @ {state.rate.toFixed(2)}hz
        </div>
      )}
    </div>
  )
}

export default LFOModule
