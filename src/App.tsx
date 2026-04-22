import { useState } from 'react'
import * as Tone from 'tone'
import TransportControls from './components/TransportControls'
import Visualizer from './components/Visualizer'
import SynthPatch from './components/patches/SynthPatch'
import SequencerPatch from './components/patches/SequencerPatch'

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
          <SynthPatch />
          <SequencerPatch />
        </>
      }
    </div>
  )
}

export default App