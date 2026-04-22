import { useEffect, useRef } from "react";
import * as Tone from "tone";
import { masterGain } from "../audio/master";

function Visualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const analyserRef = useRef<Tone.Analyser | null>(null)
    const rafRef = useRef<number>(0)

    useEffect(() => {
        const analyser = new Tone.Analyser('waveform', 256)
        masterGain.connect(analyser)
        analyserRef.current = analyser

        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        const draw = () => {
            const values = analyser.getValue() as Float32Array
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.beginPath()
            ctx.strokeStyle = '#00ff88'
            ctx.lineWidth = 2

            values.forEach((v, i) => {
                const x = (i / values.length) * canvas.width
                const y = ((v + 1) / 2) * canvas.height
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            })

            ctx.stroke()
            rafRef.current = requestAnimationFrame(draw)
        }
        draw()
        return () => {
            cancelAnimationFrame(rafRef.current)
            analyser.dispose()
        }
    }, [])

    return (
        <canvas ref={canvasRef} width={600} height={120} />
    )
}

export default Visualizer