import { useState } from 'react'
import * as Tone from 'tone'
import TransportControls from './components/TransportControls'
import Visualizer from './components/Visualizer'
import SynthPanel from './components/SynthPanel'
import GrainPanel from './components/grain/GrainPanel'
import LFORack from './components/LFORack'
import FXRack from './components/FXRack'
import ModMatrix from './components/ModMatrix'
import PresetBar from './components/PresetBar'
import { useSynthEngine } from './hooks/useSynthEngine'
import { useGrainEngine } from './hooks/useGrainEngine'
import { useNoteInput } from './hooks/useNoteInput'
import { noteBus, type InstrumentId } from './audio/noteBus'
import { sharkStore } from './state/patchStore'
import { grainStore } from './state/grainStore'

const TARGETS: { label: string, ids: InstrumentId[] }[] = [
  { label: 'Shark', ids: ['shark'] },
  { label: 'Grain', ids: ['grain'] },
  { label: 'Both', ids: ['shark', 'grain'] },
]

/**
 * Both instruments are mounted at once, so both can sound; the tabs only
 * decide which set of controls is on screen. Which one the keys play is a
 * separate choice, because wanting to tweak one while playing the other is
 * the normal case rather than the exception.
 */
function Workbench({ keyboardOctave }: { keyboardOctave: number }) {
  const [tab, setTab] = useState<InstrumentId>('shark')
  const [targetIndex, setTargetIndex] = useState(0)

  const store = tab === 'shark' ? sharkStore : grainStore

  return (
    <>
      <TransportControls />
      <Visualizer />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['shark', 'grain'] as const).map(id => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontSize: 11, padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer',
                background: tab === id ? '#00ff88' : '#333',
                color: tab === id ? '#000' : '#fff',
              }}
            >{id === 'shark' ? 'Shark Synth' : 'Grain Lab'}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, opacity: 0.4 }}>keys play</span>
          {TARGETS.map((target, i) => (
            <button
              key={target.label}
              onClick={() => { setTargetIndex(i); noteBus.setTargets(target.ids) }}
              style={{
                fontSize: 10, padding: '3px 8px', border: 'none', borderRadius: 3, cursor: 'pointer',
                background: targetIndex === i ? '#aa44ff' : '#333',
                color: targetIndex === i ? '#000' : '#fff',
              }}
            >{target.label}</button>
          ))}
        </div>
      </div>

      {tab === 'shark' ? <PresetBar /> : null}
      <div style={{ display: tab === 'shark' ? 'block' : 'none' }}>
        <SynthPanel keyboardOctave={keyboardOctave} />
      </div>
      <div style={{ display: tab === 'grain' ? 'block' : 'none' }}>
        <GrainLab />
      </div>

      <LFORack store={store} />
      <FXRack store={store} />
      <ModMatrix store={store} />
    </>
  )
}

/**
 * Split out so the grain engine's hook runs whichever tab is showing — the
 * instrument stays alive and audible while you edit the other one.
 */
function GrainLab() {
  const handle = useGrainEngine()
  return <GrainPanel handle={handle} />
}

function App() {
  const [started, setStarted] = useState(false)

  const handleStart = async () => {
    await Tone.start()
    setStarted(true)
  }

  return (
    <div>
      {!started && <button onClick={handleStart}>Start Audio</button>}
      {started && <Started />}
    </div>
  )
}

/**
 * Everything below the start gate. The engines and the input listeners live
 * here so they mount exactly once, after the audio context is running.
 */
function Started() {
  useSynthEngine()
  const keyboardOctave = useNoteInput()
  return <Workbench keyboardOctave={keyboardOctave} />
}

export default App
