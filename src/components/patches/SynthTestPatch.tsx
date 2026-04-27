import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { masterGain } from '../../audio/master'
import Knob from '../controls/Knob'
import Slider from '../controls/Slider'

interface ADSRState {
    attack: number
    decay: number
    sustain: number
    release: number
}

function SynthTestPatch() {
    const synthRef = useRef<Tone.Synth | null>(null)

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
        const synth = new Tone.Synth({
            volume: -12,
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.05 , decay: 0.2, sustain: 0.5, release: 0.8 }
        })

        synth.connect(filter)
        filter.connect(masterGain)
        synthRef.current = synth
        filterRef.current = filter

        return () => {
            synth.dispose()
            filter.dispose()
        }
    }, [])

    const handleAdsr = (key: keyof ADSRState) => (value: number) => {
        setAdsr(prev => {
            const next = { ...prev, [key]: value }
            synthRef.current?.set({ envelope: next })
            return next
        })


    }

    const handleCutoff = (value: number) => {
        setFilterCutoff(value)
        filterRef.current?.frequency.rampTo(value, 0.02)
    }

    const handleRes = (value: number) => {
        setFilterRes(value)
        filterRef.current?.set({ Q: value })
    }

    const handleDown = () => synthRef.current?.triggerAttack('C3')
    const handleUp = () => synthRef.current?.triggerRelease()

    return (
        <div>
            <h3> Synth Test</h3>
            <button
                onMouseDown={handleDown}
                onMouseUp={handleUp}
                onMouseLeave={handleUp}
                style={{ marginBottom: 16 }}
            >
                Hold to Play
            </button>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>ENVELOPE</p>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Knob label='Attack' min={0} max={2} value={adsr.attack} onChange={handleAdsr('attack')} defaultValue={0.02} />
                        <Knob label='Decay' min={0} max={2} value={adsr.decay} onChange={handleAdsr('decay')} defaultValue={0.2} color='#ff8800'/>
                        <Knob label='Sustain' min={0} max={1} value={adsr.sustain} onChange={handleAdsr('sustain')} defaultValue={0.5} color='#ffff00'/>
                        <Knob label='Release' min={0} max={5} value={adsr.release} onChange={handleAdsr('release')} defaultValue={0.8} color='#aa44ff'/>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Slider label='Attack' min={0} max={2} value={adsr.attack} onChange={handleAdsr('attack')} />
                        <Slider label='Decay' min={0} max={2} value={adsr.decay} onChange={handleAdsr('decay')} color='#ff8800'/>
                        <Slider label='Sustain' min={0} max={1} value={adsr.sustain} onChange={handleAdsr('sustain')} defaultValue={0.5} color='#ffff00'/>
                        <Slider label='Release' min={0} max={5} value={adsr.release} onChange={handleAdsr('release')} defaultValue={0.8} color='#aa44ff'/>
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

export default SynthTestPatch