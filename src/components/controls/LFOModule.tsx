import Knob from './Knob'
import Selector from './Selector'
import { removeLFO, updateLFO, useLFOState } from '../../state/patchStore'
import { DIVISIONS, LFO_RATE, WAVES } from '../../audio/patchTypes'

interface LFOModuleProps {
  id: string
  /** Shown so an unrouted LFO doesn't look broken. */
  routeCount: number
}

/**
 * An LFO is now purely a modulation *source* — where it goes is the mod
 * matrix's business. Output is normalised to -1..1 like every other source.
 */
function LFOModule({ id, routeCount }: LFOModuleProps) {
  const state = useLFOState(id)
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
            onClick={() => updateLFO(id, { running: !state.running })}
            style={{ fontSize: 10, color: state.running ? '#00ff88' : '#888' }}
          >
            {state.running ? '■ stop' : '▶ run'}
          </button>
          <button onClick={() => removeLFO(id)} style={{ fontSize: 10, color: '#ff4444' }}>✕</button>
        </div>
      </div>

      <Selector options={WAVES} value={state.waveform} onChange={w => updateLFO(id, { waveform: w })} />

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => updateLFO(id, { sync: false })}
          style={tab(!state.sync, '#00ff88')}
        >free</button>
        <button
          onClick={() => updateLFO(id, { sync: true })}
          style={tab(state.sync, '#00ff88')}
        >sync</button>
        <button
          onClick={() => updateLFO(id, { perVoice: !state.perVoice })}
          style={tab(state.perVoice, '#aa44ff')}
          title="One LFO per voice, restarted on each note, so notes drift independently"
        >per-voice</button>
      </div>

      {state.sync
        ? <>
            <Selector options={DIVISIONS} value={state.division}
              onChange={d => updateLFO(id, { division: d })} color="#00aaff" />
            <span style={{ fontSize: 9, opacity: 0.4 }}>runs only while the transport does</span>
          </>
        : <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Knob label="Rate" min={LFO_RATE.min} max={LFO_RATE.max} value={state.rate}
              defaultValue={1} onChange={v => updateLFO(id, { rate: v })} size={48} color="#00ff88" />
          </div>}

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
