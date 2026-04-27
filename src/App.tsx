import { useState } from 'react'
import * as Tone from 'tone'
import TransportControls from './components/TransportControls'
import Visualizer from './components/Visualizer'
import SynthPatch from './components/patches/SynthPatch'
import SequencerPatch from './components/patches/SequencerPatch'
import PolyPatch from './components/patches/PolyPatch'
import XYPatch from './components/patches/XYPatch'
import ArpPatch from './components/patches/ArpPatch'
import SynthTestPatch from './components/patches/SynthTestPatch'
import GrainPatch from './components/patches/GrainPatch'
import PolySynth from './components/patches/PolySynth'
import LFORack from './components/LFORack'

function App() {
  const [started, setStarted] = useState(false)

  const handleStart = async () => {
    await Tone.start()
    setStarted(true)
  }
  
  return (
    <div>
      {!started && 
        <button onClick={handleStart}>Start Audio</button>
      }
      {started && 
        <>
          <TransportControls />
          <Visualizer />          
          <PolySynth />
          <LFORack />
        </>
      }
    </div>
  )
}

export default App