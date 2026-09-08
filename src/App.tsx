import { useState } from 'react'
import * as Tone from 'tone'
import TransportControls from './components/TransportControls'
import Visualizer from './components/Visualizer'
import SynthPanel from './components/SynthPanel'
import LFORack from './components/LFORack'
import ModMatrix from './components/ModMatrix'
import PresetBar from './components/PresetBar'

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
          <PresetBar />
          <SynthPanel />
          <LFORack />
          <ModMatrix />
        </>
      }
    </div>
  )
}

export default App