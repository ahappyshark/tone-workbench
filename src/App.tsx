import { useState } from 'react'
import * as Tone from 'tone'
import TransportControls from './components/TransportControls'
import Visualizer from './components/Visualizer'

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
          <p>Workbench goes here</p>
        </>
      }
    </div>
  )
}

export default App