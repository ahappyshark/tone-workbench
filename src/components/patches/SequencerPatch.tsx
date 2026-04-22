import { useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { masterGain } from "../../audio/master";

const NOTES = ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4']
const STEPS = 8

function randomSequence(): (string | null)[] {
    return Array.from({ length: STEPS }, () => 
        Math.random() > 0.3 ? NOTES[Math.floor(Math.random() * NOTES.length)] : null
    )
}

function SequencerPatch() {
    const synthRef = useRef<Tone.Synth | null>(null)
    const sequenceRef = useRef<Tone.Sequence | null>(null)
    const [steps, setSteps] = useState<(string | null)[]>(randomSequence)
    const [currentStep, setCurrentStep] = useState<number>(-1)

    useEffect(() => {
        const synth = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.4 }
        })
        synth.connect(masterGain)
        synthRef.current = synth

        return () => {
            synth.dispose()
        }
    }, [])

    useEffect(() => {
        sequenceRef.current?.dispose()

        const seq = new Tone.Sequence((time, i) => {
            const note = steps[i]
            if (note) 
                synthRef.current?.triggerAttackRelease(note, '16n', time)
            Tone.getDraw().schedule(() => {
                setCurrentStep(i)
            }, time)
        }, Array.from({ length: STEPS }, (_, i) => i), '16n')

        seq.start(0)
        sequenceRef.current = seq

        const transport = Tone.getTransport()
        const handleStop = () => setCurrentStep(-1)
        transport.on('stop', handleStop)

        return () => {
            seq.dispose()
            transport.off('stop', handleStop)
        }
    }, [steps])

    const handleRandomize = () => setSteps(randomSequence())

    return (
        <div>
            <h3>Sequencer Patch</h3>
            <div style={{ display: 'flex', gap: 4 }}>
                {steps.map((note, i) => (
                    <div
                        key={i}
                        style={{
                            width: 40,
                            height: 40,
                            background: i === currentStep ? '#00ff88' : note ? '#555' : '#222',
                            border: '1px solid #888',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            color: '#fff'
                        }}
                    >
                        {note ?? '-'}
                    </div>
                ))}
            </div>
            <button onClick={handleRandomize}>Randomize</button>
        </div>
    )
}

export default SequencerPatch