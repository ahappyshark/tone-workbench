import { useEffect, useRef, useState, useCallback } from 'react'
import * as Tone from 'tone'
import { useParamRegistry } from '../../context/ParamRegistry'
import Knob from './Knob'

type WaveformType = 'sine' | 'triangle' | 'sawtooth' | 'square'

interface LFOModuleProps {
  id: string
  onRemove: (id: string) => void
}

function LFOModule({ id, onRemove }: LFOModuleProps) {
  const lfoRef = useRef<Tone.LFO | null>(null)
  const currentTargetRef = useRef<string | null>(null)
  const { getAll } = useParamRegistry()

  const [waveform, setWaveform] = useState<WaveformType>('sine')
  const [rate, setRate] = useState(1)
  const [min, setMin] = useState(0)
  const [max, setMax] = useState(1)
  const [target, setTarget] = useState<string>('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const lfo = new Tone.LFO({
      type: waveform,
      frequency: rate,
      min,
      max
    }).start()

    lfoRef.current = lfo

    return () => lfo.dispose()
  }, [])

  const handleWaveform = (w: WaveformType) => {
    setWaveform(w)
    if (lfoRef.current) lfoRef.current.type = w
  }

  const handleRate = useCallback((v: number) => {
    setRate(v)
    if (lfoRef.current) lfoRef.current.frequency.rampTo(v, 0.1)
  }, [])

  const handleMin = useCallback((v: number) => {
    setMin(v)
    if (lfoRef.current) lfoRef.current.min = v
  }, [])

  const handleMax = useCallback((v: number) => {
    setMax(v)
    if (lfoRef.current) lfoRef.current.max = v
  }, [])

  const handleTarget = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTarget = e.target.value
    const lfo = lfoRef.current
    if (!lfo) return

    // disconnect from old target
    if (currentTargetRef.current) {
      const old = getAll().get(currentTargetRef.current)
      if (old) {
        try { lfo.disconnect(old.signal as any) } catch {}
      }
    }

    // connect to new target
    if (newTarget) {
      const entry = getAll().get(newTarget)
      if (entry) {
        lfo.connect(entry.signal as any)
        currentTargetRef.current = newTarget
      }
    } else {
      currentTargetRef.current = null
    }

    setTarget(newTarget)
  }

  const toggleRunning = () => {
    const lfo = lfoRef.current
    if (!lfo) return
    if (running) {
      lfo.stop()
    } else {
      lfo.start()
    }
    setRunning(!running)
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
            onClick={toggleRunning}
            style={{ fontSize: 10, color: running ? '#00ff88' : '#888' }}
          >
            {running ? '■ stop' : '▶ run'}
          </button>
          <button
            onClick={() => onRemove(id)}
            style={{ fontSize: 10, color: '#ff4444' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* waveform selector */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['sine', 'triangle', 'sawtooth', 'square'] as WaveformType[]).map(w => (
          <button
            key={w}
            onClick={() => handleWaveform(w)}
            style={{
              fontSize: 9,
              padding: '2px 6px',
              background: waveform === w ? '#00ff88' : '#333',
              color: waveform === w ? '#000' : '#fff',
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
          min={0.01}
          max={20}
          value={rate}
          defaultValue={1}
          onChange={handleRate}
          size={48}
          color="#00ff88"
        />
        <Knob
          label="Min"
          min={-10000}
          max={10000}
          value={min}
          defaultValue={0}
          onChange={handleMin}
          size={48}
          color="#ff8800"
        />
        <Knob
          label="Max"
          min={-10000}
          max={10000}
          value={max}
          defaultValue={1}
          onChange={handleMax}
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
          {params.map(([id, entry]) => (
            <option key={id} value={id}>{entry.label}</option>
          ))}
        </select>
      </div>

      {target && (
        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'center' }}>
          {min.toFixed(1)} → {max.toFixed(1)} @ {rate.toFixed(2)}hz
        </div>
      )}
    </div>
  )
}

export default LFOModule
