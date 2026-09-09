import { useEffect, useRef } from 'react'
import type { GrainBuffer } from '../../audio/grainSource'

interface WaveformViewProps {
    buffer: GrainBuffer | null
    /** where the knob points, 0..1 */
    position: number
    /** random offset either side of the head, as a fraction of the buffer */
    spray: number
    /** live scan-head positions, polled each frame */
    readHeads: () => number[]
    onScrub: (position: number) => void
}

const WIDTH = 900
const HEIGHT = 150

/**
 * The buffer, the position knob, the spray band and the live scan heads.
 *
 * Granular without a picture of the buffer is guesswork — the difference
 * between a good spot and a silent one is often a tenth of a second, and no
 * number on a knob tells you which is which. Dragging scrubs the position.
 */
function WaveformView({ buffer, position, spray, readHeads, onScrub }: WaveformViewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // Read through a ref inside the animation loop: re-subscribing the loop
    // on every knob frame would cancel and restart it sixty times a second.
    const stateRef = useRef({ buffer, position, spray, readHeads })
    useEffect(() => {
        stateRef.current = { buffer, position, spray, readHeads }
    })

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        let frame = 0

        const draw = () => {
            const { buffer: buf, position: pos, spray: spr, readHeads: heads } = stateRef.current
            ctx.clearRect(0, 0, WIDTH, HEIGHT)
            ctx.fillStyle = '#141414'
            ctx.fillRect(0, 0, WIDTH, HEIGHT)

            if (buf) {
                const mid = HEIGHT / 2
                const columns = buf.peaks.length / 2

                // Spray band first, so the waveform draws over it.
                if (spr > 0 && buf.duration > 0) {
                    const half = spr * WIDTH
                    ctx.fillStyle = 'rgba(170, 68, 255, 0.16)'
                    ctx.fillRect(pos * WIDTH - half, 0, half * 2, HEIGHT)
                }

                ctx.strokeStyle = '#00ff88'
                ctx.globalAlpha = 0.75
                ctx.beginPath()
                for (let col = 0; col < columns; col++) {
                    const x = (col / columns) * WIDTH
                    ctx.moveTo(x, mid + buf.peaks[col * 2] * mid * 0.92)
                    ctx.lineTo(x, mid + buf.peaks[col * 2 + 1] * mid * 0.92)
                }
                ctx.stroke()
                ctx.globalAlpha = 1

                // The knob's position: where a new note starts reading.
                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(pos * WIDTH, 0)
                ctx.lineTo(pos * WIDTH, HEIGHT)
                ctx.stroke()

                // Live heads: where each sounding cloud has drifted to.
                ctx.strokeStyle = '#ffff00'
                ctx.lineWidth = 2
                for (const head of heads()) {
                    ctx.beginPath()
                    ctx.moveTo(head * WIDTH, 0)
                    ctx.lineTo(head * WIDTH, HEIGHT)
                    ctx.stroke()
                }
                ctx.lineWidth = 1
            } else {
                ctx.fillStyle = '#666'
                ctx.font = '12px system-ui, sans-serif'
                ctx.fillText('no audio loaded', 16, HEIGHT / 2)
            }

            frame = requestAnimationFrame(draw)
        }
        draw()
        return () => cancelAnimationFrame(frame)
    }, [])

    const scrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.buttons === 0 && e.type === 'pointermove') return
        const rect = e.currentTarget.getBoundingClientRect()
        onScrub(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)))
    }

    return (
        <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e) }}
            onPointerMove={scrub}
            style={{
                width: '100%',
                height: HEIGHT,
                borderRadius: 6,
                border: '1px solid #333',
                cursor: 'crosshair',
                touchAction: 'none',
            }}
        />
    )
}

export default WaveformView
