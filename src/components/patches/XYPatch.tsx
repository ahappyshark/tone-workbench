import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { masterGain } from '../../audio/master'

const SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']

const NOTE_COLOR_MAP: Record<string, string> = {
    'C4': '#FF0000',
    'D4': '#FF7700',
    'E4': '#FFFF00',
    'F4': '#00AA00',
    'G4': '#0077FF',
    'A4': '#0000ff',
    'B4': '#7700ff',
}

interface SynthConfig {
    label: string
    create: () => Tone.PolySynth
    applyY: (synth: Tone.PolySynth, filter: Tone.Filter, normalized: number) => void
    yLabel: string
}

const SYNTH_CONFIGS: SynthConfig[] = [
    {
        label: 'Sawtooth + Filter',
        create: () => new Tone.PolySynth(Tone.Synth, {
            volume: -12,
            oscillator: { type: 'sawtooth' },
            envelope: { attack: 0.1, decay: 0.3, sustain: 0.4, release: 1.0 }
        }),
        applyY: (_, filter, n) => {
            filter.frequency.rampTo(200 + n * 8000, 0.05)
        },
        yLabel: 'Filter Cutoff'
    },
    {
        label: 'Pulse + Width',
        create: () => new Tone.PolySynth(Tone.Synth, {
            volume: -12,
            oscillator: { type: 'pulse', width: 0.5 } as any,
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 1.0 }
        }),
        applyY: (synth, _, n) => {
            synth.set({ oscillator: { width: n }} as any)
        },
        yLabel: 'Pulse Width'
    },
    {
        label: 'FM Synth',
        create: () => new Tone.PolySynth(Tone.FMSynth, {
            volume: -12,
            envelope: { attack: 0.05, decay: 0.3, sustain: 0.4, release: 1.0 },
            modulationIndex: 5,
            harmonicity: 3
        }),
        applyY: (synth, _, n) => {
            synth.set({ modulationIndex: n * 20 } as any)
        },
        yLabel: 'Modulation Index'
    }
]

function noteFromX(x: number, width: number): string {
    const index = Math.floor((x / width) * SCALE.length)
    return SCALE[Math.min(index, SCALE.length - 1)]
}

interface Ripple {
    x: number
    y: number
    color: string
    radius: number
    alpha: number
}

function XYPatch() {
    const synthRef = useRef<Tone.PolySynth | null>(null)
    const filterRef = useRef<Tone.Filter | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const ripplesRef = useRef<Ripple[]>([])
    const rafRef = useRef<number>(0)
    const activePointers = useRef<Map<number, string>>(new Map())
    const [configIndex, setConfigIndex] = useState(0)
    
    useEffect(() => {
        synthRef.current?.dispose()
        filterRef.current?.dispose()

        const config = SYNTH_CONFIGS[configIndex]
        const filter = new Tone.Filter(4000, 'lowpass')
        const synth = config.create()
        synth.connect(filter)
        filter.connect(masterGain)
        synthRef.current = synth
        filterRef.current = filter

        return () => {
            synth.dispose()
            filter.dispose()
        }
    }, [configIndex])

    useEffect(() => {
        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            SCALE.forEach((note, i) => {
                const x = (i / SCALE.length) * canvas.width
                const w = canvas.width / SCALE.length
                ctx.fillStyle = NOTE_COLOR_MAP[note] + '44'
                ctx.fillRect(x, 0, w, canvas.height)
            })

            ripplesRef.current = ripplesRef.current.filter(r => r.alpha > 0)
            ripplesRef.current.forEach(r => {
                ctx.beginPath()
                ctx.arc(r.x, r.y, r.radius, 0, 2 * Math.PI)
                ctx.strokeStyle = r.color + Math.floor(r.alpha * 255).toString(16).padStart(2, '0')
                ctx.lineWidth = 2
                ctx.stroke()
                r.radius += 3
                r.alpha -= 0.02
            })

            rafRef.current = requestAnimationFrame(draw)
        }

        draw()
        return () => {
            cancelAnimationFrame(rafRef.current)
        }
    }, [])

    const getCanvasPos = (e: React.PointerEvent) => {
        const rect = canvasRef.current!.getBoundingClientRect()
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        }
    }

    const getNormalized = (y: number) => {
        return 1 - (y / canvasRef.current!.height)
    }

    const handlePointerDown = (e: React.PointerEvent) => {
        const { x, y } = getCanvasPos(e)
        const note = noteFromX(x, canvasRef.current!.width)
        const normalized = getNormalized(y)
        const config = SYNTH_CONFIGS[configIndex]

        config.applyY(synthRef.current!, filterRef.current!, normalized)        
        synthRef.current?.triggerAttack(note)
        activePointers.current.set(e.pointerId, note)

        ripplesRef.current.push({
            x, y,
            color: NOTE_COLOR_MAP[note],
            radius: 10,
            alpha: 1
        })
    }

    const handlePointerUp = (e: React.PointerEvent) => {
        const note = activePointers.current.get(e.pointerId)
        if (note) {
            synthRef.current?.triggerRelease(note)
            activePointers.current.delete(e.pointerId)
        }
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!activePointers.current.has(e.pointerId)) return
        const { y } = getCanvasPos(e)
        const normalized = getNormalized(y)
        SYNTH_CONFIGS[configIndex].applyY(synthRef.current!, filterRef.current!, normalized)
    }

    return (
        <div>
            <h3>XY Pad</h3>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                {SYNTH_CONFIGS.map((c, i) => (
                        <button
                            key={i}
                            onClick={() => setConfigIndex(i)}
                            style={{
                                fontWeight: i === configIndex ? 'bold' : 'normal'
                            }}                            
                        >
                            {c.label}
                        </button>
                    ))}
                    <span style={{ fontSize: 12, opacity: 0.6 }}>
                        Y - {SYNTH_CONFIGS[configIndex].yLabel}
                    </span>
            </div>
            <canvas
                ref={canvasRef}
                width={600}
                height={300}
                style= {{ touchAction: 'none', cursor: 'crosshair', borderRadius: 8 }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerLeave={handlePointerUp}
            />
        </div>
    )
}

export default XYPatch