import { useState } from 'react'
import * as Tone from 'tone'

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
      {started && <p>Workbench goes here</p>}
    </div>
  )
}

export default App