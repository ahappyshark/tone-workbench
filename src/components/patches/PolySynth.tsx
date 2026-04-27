import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { masterGain } from "../../audio/master";
import { useMidi } from "../../hooks/useMidi";
import { useKeyboard } from "../../hooks/useKeyboard";
import Knob from "../controls/Knob";
import { useRegisterParam } from "../../hooks/useRegisterParam";

interface ADSRState {
    attack: number
    decay: number
    sustain: number
    release: number
}

function PolySynth() {
    const [loaded, setLoaded] = useState(false)

    const synthRef = useRef<Tone.PolySynth | null>(null)
    const [adsr, setAdsr] = useState<ADSRState>({
        attack: 0.05,
        decay: 0.2,
        sustain: 0.5,
        release: 0.8
    })

    const [filterCutoff, setFilterCutoff] = useState(4000)
    const [filterRes, setFilterRes] = useState(1)
    const filterRef = useRef<Tone.Filter | null>(null)

    

    useEffect(() => {
        const filter = new Tone.Filter(4000, 'lowpass')
        const synth = new Tone.PolySynth(Tone.Synth, {
            volume: -12,
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1.2 }
        })
        
        synth.connect(filter)
        filter.connect(masterGain)
        synthRef.current = synth
        filterRef.current = filter
        setLoaded(true)

        return () => {
            synth.dispose()
            filter.dispose()
        }
    }, [])

    useRegisterParam('PolySynth', () => ({
        filterCutoff: { label: 'Filter Cutoff', signal: filterRef.current!.frequency, min: 100, max: 10000 },
        filterRes: { label: 'Filter Resonance', signal: filterRef.current!.Q, min: 0.1, max: 20 },
    }), loaded)

    const handleAdsr = (key: keyof ADSRState) => (value: number) => {
        setAdsr(prev => {
            const next = { ...prev, [key]: value }
            synthRef.current?.set({ envelope: next })
            return next
        })
    }

    const handleCutoff = useCallback((value: number) => {
        setFilterCutoff(value)
        filterRef.current?.frequency.rampTo(value, 0.02)
    }, [])

    const handleRes = useCallback((value: number) => {
        setFilterRes(value)
        filterRef.current?.set({ Q: value })
    }, [])

    const handleNoteOn = useCallback((midi: number, velocity: number) => {
        synthRef.current?.triggerAttack(Tone.Frequency(midi, 'midi').toFrequency())
    }, [])

    const handleNoteOff = useCallback((midi: number) => {
        synthRef.current?.triggerRelease(Tone.Frequency(midi, 'midi').toFrequency())
    }, [])

    useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })
    useKeyboard({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })

    return (
        <div>
            <h3>Poly Synth</h3>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>ENVELOPE</p>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Knob label='Attack' min={0} max={2} value={adsr.attack} onChange={handleAdsr('attack')} defaultValue={0.02} />
                        <Knob label='Decay' min={0} max={2} value={adsr.decay} onChange={handleAdsr('decay')} defaultValue={0.2} color='#ff8800'/>
                        <Knob label='Sustain' min={0} max={1} value={adsr.sustain} onChange={handleAdsr('sustain')} defaultValue={0.5} color='#ffff00'/>
                        <Knob label='Release' min={0} max={5} value={adsr.release} onChange={handleAdsr('release')} defaultValue={0.8} color='#aa44ff'/>
                    </div>
                </div>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>FILTER</p>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Knob label='Cutoff' min={100} max={10000} value={filterCutoff} onChange={handleCutoff} color='#00aaff'/>
                        <Knob label='Resonance' min={0.1} max={20} value={filterRes} onChange={handleRes} color='#ff4488'/>
                    </div>
                </div>
            </div>           
        </div>
    )
}

export default PolySynth