import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from 'tone'
import { masterGain } from "../audio/master";
import { useMidi } from "../hooks/useMidi";
import { useKeyboard } from "../hooks/useKeyboard";
import Knob from "./controls/Knob";
import { useRegisterParam } from "../hooks/useRegisterParam";
import { getPatch, setSynthParam, useSynthState } from "../state/patchStore";
import { OSC_TYPES, SYNTH_RANGES, DEFAULT_SYNTH, FILTER_TYPES, type OscType, type FilterType } from "../audio/patchTypes";

function PolySynth() {
    const [loaded, setLoaded] = useState(false)

    const synthRef = useRef<Tone.PolySynth | null>(null)
    const filterRef = useRef<Tone.Filter | null>(null)

    // The patch is the source of truth; the Tone nodes are downstream of it.
    const synth = useSynthState()

    useEffect(() => {
        // Read the store directly rather than closing over `synth` — this
        // effect must not re-run on every param change, and building from the
        // current patch avoids a frame of default values after a preset load.
        const initial = getPatch().synth
        const filter = new Tone.Filter(initial.filterCutoff, initial.filterType)
        filter.Q.value = initial.filterRes
        const poly = new Tone.PolySynth(Tone.Synth, {
            volume: initial.volume,
            oscillator: { type: initial.oscillator },
            envelope: {
                attack: initial.attack,
                decay: initial.decay,
                sustain: initial.sustain,
                release: initial.release,
            }
        })

        poly.connect(filter)
        filter.connect(masterGain)
        synthRef.current = poly
        filterRef.current = filter
        setLoaded(true)

        return () => {
            poly.dispose()
            filter.dispose()
            synthRef.current = null
            filterRef.current = null
        }
    }, [])

    useRegisterParam('PolySynth', () => ({
        filterCutoff: { label: 'Filter Cutoff', signal: filterRef.current!.frequency, min: SYNTH_RANGES.filterCutoff.min, max: SYNTH_RANGES.filterCutoff.max },
        filterRes: { label: 'Filter Resonance', signal: filterRef.current!.Q, min: SYNTH_RANGES.filterRes.min, max: SYNTH_RANGES.filterRes.max },
    }), loaded)

    // Push store -> audio graph. Split by node so an envelope tweak doesn't
    // re-ramp the filter, and vice versa.
    useEffect(() => {
        synthRef.current?.set({
            volume: synth.volume,
            oscillator: { type: synth.oscillator },
            envelope: {
                attack: synth.attack,
                decay: synth.decay,
                sustain: synth.sustain,
                release: synth.release,
            }
        })
    }, [synth.volume, synth.oscillator, synth.attack, synth.decay, synth.sustain, synth.release])

    useEffect(() => {
        filterRef.current?.frequency.rampTo(synth.filterCutoff, 0.02)
    }, [synth.filterCutoff])

    useEffect(() => {
        filterRef.current?.set({ Q: synth.filterRes, type: synth.filterType })
    }, [synth.filterRes, synth.filterType])

    const handleNoteOn = useCallback((midi: number) => {
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
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>OSCILLATOR</p>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                        {OSC_TYPES.map(w => (
                            <button
                                key={w}
                                onClick={() => setSynthParam('oscillator', w as OscType)}
                                style={{
                                    fontSize: 9,
                                    padding: '2px 6px',
                                    background: synth.oscillator === w ? '#00ff88' : '#333',
                                    color: synth.oscillator === w ? '#000' : '#fff',
                                    border: 'none',
                                    borderRadius: 3,
                                    cursor: 'pointer'
                                }}
                            >
                                {w}
                            </button>
                        ))}
                    </div>
                    <Knob
                        label='Volume'
                        min={SYNTH_RANGES.volume.min}
                        max={SYNTH_RANGES.volume.max}
                        value={synth.volume}
                        defaultValue={DEFAULT_SYNTH.volume}
                        onChange={v => setSynthParam('volume', v)}
                        color='#88ff00'
                    />
                </div>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>ENVELOPE</p>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Knob label='Attack' min={SYNTH_RANGES.attack.min} max={SYNTH_RANGES.attack.max} value={synth.attack} onChange={v => setSynthParam('attack', v)} defaultValue={DEFAULT_SYNTH.attack} />
                        <Knob label='Decay' min={SYNTH_RANGES.decay.min} max={SYNTH_RANGES.decay.max} value={synth.decay} onChange={v => setSynthParam('decay', v)} defaultValue={DEFAULT_SYNTH.decay} color='#ff8800'/>
                        <Knob label='Sustain' min={SYNTH_RANGES.sustain.min} max={SYNTH_RANGES.sustain.max} value={synth.sustain} onChange={v => setSynthParam('sustain', v)} defaultValue={DEFAULT_SYNTH.sustain} color='#ffff00'/>
                        <Knob label='Release' min={SYNTH_RANGES.release.min} max={SYNTH_RANGES.release.max} value={synth.release} onChange={v => setSynthParam('release', v)} defaultValue={DEFAULT_SYNTH.release} color='#aa44ff'/>
                    </div>
                </div>
                <div>
                    <p style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>FILTER</p>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                        {FILTER_TYPES.map(t => (
                            <button
                                key={t}
                                onClick={() => setSynthParam('filterType', t as FilterType)}
                                style={{
                                    fontSize: 9,
                                    padding: '2px 6px',
                                    background: synth.filterType === t ? '#00aaff' : '#333',
                                    color: synth.filterType === t ? '#000' : '#fff',
                                    border: 'none',
                                    borderRadius: 3,
                                    cursor: 'pointer'
                                }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <Knob label='Cutoff' min={SYNTH_RANGES.filterCutoff.min} max={SYNTH_RANGES.filterCutoff.max} value={synth.filterCutoff} defaultValue={DEFAULT_SYNTH.filterCutoff} onChange={v => setSynthParam('filterCutoff', v)} color='#00aaff'/>
                        <Knob label='Resonance' min={SYNTH_RANGES.filterRes.min} max={SYNTH_RANGES.filterRes.max} value={synth.filterRes} defaultValue={DEFAULT_SYNTH.filterRes} onChange={v => setSynthParam('filterRes', v)} color='#ff4488'/>
                    </div>
                </div>
            </div>           
        </div>
    )
}

export default PolySynth
