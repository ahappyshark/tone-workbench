import LFOModule from './controls/LFOModule'
import { addLFO, useLFOIds, useSyncedRoutes } from '../state/patchStore'

function LFORack() {
  // Ids only, so turning a knob inside one module doesn't re-render the rack.
  const lfoIds = useLFOIds()
  const routes = useSyncedRoutes()

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>LFO Rack</h3>
        <button onClick={() => addLFO()}>+ Add LFO</button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {lfoIds.map(id => (
          <LFOModule key={id} id={id} routeCount={routes.filter(r => r.source === `lfo:${id}`).length} />
        ))}
        {lfoIds.length === 0 && (
          <span style={{ fontSize: 11, opacity: 0.4 }}>No LFOs yet — add one above</span>
        )}
      </div>
    </div>
  )
}

export default LFORack
