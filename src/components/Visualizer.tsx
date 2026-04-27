import { useEffect, useRef } from "react";
import * as Tone from "tone";
import { masterGain } from "../audio/master";
import { freqToColor } from "../audio/noteColors";

const FFT_SIZE = 256

function Visualizer() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const waveformRef = useRef<Tone.Analyser | null>(null)
    const fftRef = useRef<Tone.Analyser | null>(null)
    const rafRef = useRef<number>(0)

    useEffect(() => {
        const waveform = new Tone.Analyser('waveform', FFT_SIZE)
        const fft = new Tone.Analyser('fft', FFT_SIZE)
        masterGain.connect(waveform)
        masterGain.connect(fft)
        waveformRef.current = waveform
        fftRef.current = fft

        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d')!
        const W = canvas.width
        const H = canvas.height
        const halfH = H / 2

        const draw = () => {
            const waveValues = waveform.getValue() as Float32Array
            const fftValues = fft.getValue() as Float32Array

            ctx.clearRect(0, 0, W, H)

            // --- bottom half: FFT bars ---
            const barWidth = W / fftValues.length
            const sampleRate = Tone.getContext().sampleRate
            const nyquist = sampleRate / 2

            fftValues.forEach((db, i) => {
              // map bin index to frequency
              const freq = (i / fftValues.length) * nyquist
              if (freq < 20) return // skip sub-audible

              // db range is roughly -160 to 0
              const normalized = Math.max(0, (db + 120) / 120)
              const barH = normalized * halfH

              const x = i * barWidth
              const color = freqToColor(freq)

              ctx.fillStyle = color
              ctx.fillRect(x, halfH + (halfH - barH), barWidth + 1, barH)
            })

            // --- top half: waveform ---
            ctx.beginPath()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.globalAlpha = 0.6

            waveValues.forEach((v, i) => {
              const x = (i / waveValues.length) * W
              const y = ((v + 1) / 2) * halfH
              i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
            })

            ctx.stroke()
            ctx.globalAlpha = 1

            // dividing line
            ctx.beginPath()
            ctx.strokeStyle = '#333'
            ctx.lineWidth = 1
            ctx.moveTo(0, halfH)
            ctx.lineTo(W, halfH)
            ctx.stroke()

            rafRef.current = requestAnimationFrame(draw)
        }

        draw()

        return () => {
            cancelAnimationFrame(rafRef.current)
            waveform.dispose()
            fft.dispose()
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            width={600}
            height={160}
            style={{ borderRadius: 6 }}
        />
    )
}

export default Visualizer
