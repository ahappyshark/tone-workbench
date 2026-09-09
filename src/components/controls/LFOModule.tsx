import Knob from './Knob'
import Selector from './Selector'
import TriggerTabs from './TriggerTabs'
import type { InstrumentStore } from '../../state/instrumentStore'
import { DIVISIONS, LFO_RATE, WAVES } from '../../audio/patchTypes'

interface LFOModuleProps {
  store: InstrumentStore
  id: string
  /** Shown so an unrouted LFO doesn't look broken. */
  routeCount: number
}

/**
 * An LFO is now purely a modulation *source* — where it goes is the mod
 * matrix's business. Output is normalised to -1..1 like every other source.
 */
function LFOModule({ store, id, routeCount }: LFOModuleProps) {
  const state = store.useLFOState(id)
  if (!state) return null

  return (
    <div style={{
      border: '1px solid #444',
      borderRadius: 8,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      minWidth: 210,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, opacity: 0.5 }}>LFO</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => store.updateLFO(id, { running: !state.running })}
            style={{ fontSize: 10, color: state.running ? '#00ff88' : '#888' }}
          >
            {state.running ? '■ stop' : '▶ run'}
          </button>
          <button onClick={() => store.removeLFO(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
        </div>
      </div>

      <Selector options={WAVES} value={state.waveform} onChange={w => store.updateLFO(id, { waveform: w })} />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <TriggerTabs
          value={state.trigger}
          onChange={t => store.updateLFO(id, { trigger: t })}
          titles={{
            free: 'Runs continuously — wherever it happens to be when you play',
            key: 'Phase restarts on every note-on, so the attack is repeatable',
            sync: 'Rate locked to transport tempo; advances only while it runs',
          }}
        />
        {store.perVoiceLFOs && (
          <button
            onClick={() => store.updateLFO(id, { perVoice: !state.perVoice })}
            style={tab(state.perVoice, '#aa44ff')}
            title="One LFO per voice, so notes drift independently"
          >per-voice</button>
        )}
      </div>

      {state.trigger === 'sync'
        ? <>
            <Selector options={DIVISIONS} value={state.division}
              onChange={d => store.updateLFO(id, { division: d })} color="#00aaff" />
            <span style={{ fontSize: 9, opacity: 0.4 }}>runs only while the transport does</span>
          </>
        : <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Knob label="Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={state.rate}
              defaultValue={1} onChange={v => store.updateLFO(id, { rate: v })} size={48} color="#00ff88" />
          </div>}

      {state.trigger === 'key' && !state.perVoice && (
        <span style={{ fontSize: 9, opacity: 0.4, textAlign: 'center' }}>
          shared — every note resets it for all of them
        </span>
      )}

      <span style={{ fontSize: 9, opacity: 0.4, textAlign: 'center' }}>
        {routeCount === 0
          ? 'not routed — add a route below'
          : `${routeCount} route${routeCount === 1 ? '' : 's'}`}
      </span>
    </div>
  )
}

function tab(active: boolean, color: string): React.CSSProperties {
  return {
    fontSize: 9,
    padding: '2px 6px',
    background: active ? color : '#333',
    color: active ? '#000' : '#fff',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
  }
}

export default LFOModule
