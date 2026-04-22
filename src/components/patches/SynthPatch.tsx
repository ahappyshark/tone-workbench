import { useEffect, useRef } from "react";
import * as Tone from "tone";
import { masterGain } from "../../audio/master";

function SynthPatch() {
    const synthRef = useRef<Tone.Synth | null>(null)
    const filterRef = useRef<Tone.Filter | null>(null)
    const lfoRef = useRef<Tone.LFO | null>(null)

    useEffect(() => {
        const synth = new Tone.Synth({ oscillator: { type: 'sawtooth' } })
        const filter = new Tone.Filter(800, 'lowpass')
        const lfo = new Tone.LFO(5, 200, 4000)

        lfo.connect(filter.frequency)
        synth.connect(filter)
        filter.connect(masterGain)

        lfo.start()

        synthRef.current = synth
        filterRef.current = filter
        lfoRef.current = lfo
    }, [])

    const handlePlay = () => {
        synthRef.current?.triggerAttack('C3')
    }

    const handleRelease = () => {
        synthRef.current?.triggerRelease()
    }

    const handleLfoRate = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (lfoRef.current) {
            lfoRef.current.frequency.value = Number(e.target.value)
        }
    }

    return (
        <div>
            <h3>Synth Patch</h3>
            <button onMouseDown={handlePlay} onMouseUp={handleRelease}>
                Hold to Play
            </button>
            <label>
                LFO Rate
                <input
                    type="range"
                    min={0.1}
                    max={10}
                    step={0.1}
                    defaultValue={0.5}
                    onChange={handleLfoRate} 
                />
            </label>
        </div>
    )
}

export default SynthPatch