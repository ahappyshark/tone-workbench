import * as Tone from 'tone';

function TransportControls() {
    const handlePlay = () => Tone.getTransport().start()
    const handleStop = () => Tone.getTransport().stop()
    const handlePause = () => Tone.getTransport().pause()

    const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        Tone.getTransport().bpm.value = Number(e.target.value)
    }

    return (
        <div>
            <button onClick={handlePlay}>Play</button>
            <button onClick={handleStop}>Stop</button>
            <button onClick={handlePause}>Pause</button>
            <label>
                BPM
                <input
                    type="range"
                    min={60}
                    max={240}
                    defaultValue={120}
                    onChange={handleBpmChange} 
                />
            </label>            
        </div>
    )
}

export default TransportControls