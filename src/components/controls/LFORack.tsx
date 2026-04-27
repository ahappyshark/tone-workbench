import { useState, useCallback } from 'react'
import LFOModule from './controls/LFOModule'

let counter = 0

function LFORack() {
  const [lfoIds, setLfoIds] = useState<string[]>([])

  const addLfo = () => {
    setLfoIds(prev => [...prev, `lfo-${counter++}`])
  }

  const removeLfo = useCallback((id: string) => {
    setLfoIds(prev => prev.filter(l => l !== id))
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>LFO Rack</h3>
        <button onClick={addLfo}>+ Add LFO</button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {lfoIds.map(id => (
          <LFOModule key={id} id={id} onRemove={removeLfo} />
        ))}
        {lfoIds.length === 0 && (
          <span style={{ fontSize: 11, opacity: 0.4 }}>No LFOs yet — add one above</span>
        )}
      </div>
    </div>
  )
}

export default LFORack
