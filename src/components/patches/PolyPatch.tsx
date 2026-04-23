import { useEffect, useRef } from "react";
import * as Tone from 'tone'
import { masterGain } from "../../audio/master";

const NOTE_COLOR_MAP: Record<string, string> = {
    'C4': '#FF0000',
    'D4': '#FF7700',
    'E4': '#FFFF00',
    'F4': '#00AA00',
    'G4': '#0077FF',
    'A4': '#0000ff',
    'B4': '#7700ff',
}

const NOTES = Object.keys(NOTE_COLOR_MAP)

function PolyPatch() {
    const synthRef = useRef<Tone.PolySynth | null>(null)
    const activeNotes = useRef<Set<string>>(new Set())

    useEffect(() => {
        const keyMap: Record<string, string> = {
            'a': 'C4',
            's': 'D4',
            'd': 'E4',
            'f': 'F4',
            'g': 'G4',
            'h': 'A4',
            'j': 'B4',
        }

        const pressed = new Set<string>()
        const onDown = (e: KeyboardEvent) => {
            const note = keyMap[e.key]
            if (note && !pressed.has(e.key)) {
                synthRef.current?.triggerAttack(note)
                pressed.add(e.key)
            }
        }
        const onUp = (e: KeyboardEvent) => {
            const note = keyMap[e.key]
            if (note) {
                synthRef.current?.triggerRelease(note)
                pressed.delete(e.key)
            }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)

        return () => {
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
        }
    }, [])
    useEffect(() => {
        const synth = new Tone.PolySynth(Tone.Synth, {
            volume: -12,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1.2 }
        })
        synth.connect(masterGain)
        synthRef.current = synth

        return () => {
            synth.dispose()
        }
    }, [])

    const handlePress = (note: string) => {
        activeNotes.current.add(note)
        const n = activeNotes.current.size
        synthRef.current?.set({ volume: -6 - (n * 2) })
        synthRef.current?.triggerAttack(note)
    }

    const handleRelease = (note: string) => {
        activeNotes.current.delete(note)
        const n = Math.max(1, activeNotes.current.size)
        synthRef.current?.set({ volume: -6 - (n * 2) })
        synthRef.current?.triggerRelease(note)
    }

    return (
        <div>
            <h3>Poly Patch</h3>
            <div style={{ display: 'flex', gap: 8 }}>
                {NOTES.map((note) => (
                    <button
                        key={note}
                        onMouseDown={() => handlePress(note)}
                        onMouseUp={() => handleRelease(note)}
                        onMouseLeave={() => handleRelease(note)}
                        style={{
                            width: 48,
                            height: 80,
                            background: NOTE_COLOR_MAP[note],
                            border: 'none',
                            borderRadius: 4,
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 11,
                        }}
                    >
                        {note}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default PolyPatch