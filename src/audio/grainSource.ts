import * as Tone from 'tone'

/**
 * The audio the grain engine reads from.
 *
 * Two copies of every buffer, forward and reversed. Web Audio's
 * `AudioBufferSourceNode` refuses a negative `playbackRate`, so a backwards
 * grain is not a playback trick — it has to read a genuinely reversed buffer
 * at the mirrored offset. One extra copy in memory buys the whole feature.
 */
export interface GrainBuffer {
    name: string
    forward: AudioBuffer
    reversed: AudioBuffer
    duration: number
    /** min/max pairs per pixel column, for the waveform display */
    peaks: Float32Array
}

/** Columns of the waveform overview. Fixed, so the canvas can just index it. */
const PEAK_COLUMNS = 900

function reverseBuffer(source: AudioBuffer): AudioBuffer {
    const ctx = Tone.getContext()
    const out = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate)
    for (let c = 0; c < source.numberOfChannels; c++) {
        const from = source.getChannelData(c)
        const to = out.getChannelData(c)
        for (let i = 0, j = from.length - 1; i < from.length; i++, j--) to[i] = from[j]
    }
    return out
}

/**
 * Min and max per column, interleaved. Computed once on load rather than per
 * frame — scanning a minute of audio every animation frame is not free.
 */
function computePeaks(buffer: AudioBuffer): Float32Array {
    const peaks = new Float32Array(PEAK_COLUMNS * 2)
    const data = buffer.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / PEAK_COLUMNS))
    for (let col = 0; col < PEAK_COLUMNS; col++) {
        let min = 0
        let max = 0
        const start = col * step
        const end = Math.min(data.length, start + step)
        for (let i = start; i < end; i++) {
            const v = data[i]
            if (v < min) min = v
            if (v > max) max = v
        }
        peaks[col * 2] = min
        peaks[col * 2 + 1] = max
    }
    return peaks
}

export function makeGrainBuffer(name: string, forward: AudioBuffer): GrainBuffer {
    return {
        name,
        forward,
        reversed: reverseBuffer(forward),
        duration: forward.duration,
        peaks: computePeaks(forward),
    }
}

/** Decode a dropped or chosen file. Rejects with a readable message. */
export async function loadGrainFile(file: File): Promise<GrainBuffer> {
    const bytes = await file.arrayBuffer()
    const decoded = await Tone.getContext().decodeAudioData(bytes)
    return makeGrainBuffer(file.name.replace(/\.[^.]+$/, ''), decoded)
}

/* ------------------------------------------------------------------ */
/* Starter textures                                                    */
/* ------------------------------------------------------------------ */

/**
 * The built-in material is *generated*, not shipped as files.
 *
 * The point of a starter texture is that the instrument makes sound the
 * moment it loads, and a few hundred lines of additive synthesis does that
 * without putting megabytes of audio in a git repo. They're also written to
 * granulate well, which ordinary samples often don't: slow evolution, no
 * silence, nothing percussive enough to turn into a machine-gun at high
 * density.
 */
export type StarterName = 'drone' | 'choir' | 'metal' | 'wash' | 'tape'

export const STARTERS: readonly StarterName[] = ['drone', 'choir', 'metal', 'wash', 'tape']

/**
 * A smooth pseudo-random walk, for parameters that should drift not jump.
 *
 * Three sines at unrelated rates, with phases fixed at construction. They
 * must be fixed: advancing a phase per call runs it to infinity within a few
 * thousand samples, and `Math.sin(Infinity)` is NaN, which silently poisons
 * the whole buffer.
 */
function drift(seed: number) {
    const a = seed
    const b = seed * 1.7 + 1.1
    const c = seed * 2.9 + 2.3
    return (t: number) =>
        Math.sin(t * 0.37 + a) * 0.5 + Math.sin(t * 0.11 + b) * 0.3 + Math.sin(t * 0.83 + c) * 0.2
}

function renderStarter(name: StarterName): AudioBuffer {
    const ctx = Tone.getContext()
    const rate = ctx.sampleRate
    const seconds = 6
    const length = Math.floor(rate * seconds)
    const buffer = ctx.createBuffer(2, length, rate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)

    // Partial sets, chosen for what they sound like once chopped up. The
    // fundamental sits low so that transposing a grain up still has body.
    const recipes: Record<StarterName, { partials: number[], gains: number[], base: number }> = {
        drone: { base: 55, partials: [1, 2, 3, 4, 5, 6, 8], gains: [1, .5, .35, .2, .14, .1, .06] },
        choir: { base: 110, partials: [1, 2, 3, 4, 5, 7, 9, 11], gains: [.6, 1, .8, .3, .5, .2, .12, .08] },
        metal: { base: 92, partials: [1, 2.76, 5.4, 8.93, 13.34, 18.64], gains: [1, .7, .5, .35, .2, .12] },
        wash: { base: 73, partials: [1, 1.5, 2.01, 3.02, 4.49, 6.51], gains: [.8, .6, .5, .4, .25, .15] },
        tape: { base: 65, partials: [1, 2, 4, 8], gains: [1, .4, .18, .07] },
    }
    const recipe = recipes[name]
    const wobble = drift(name.length * 3.1)
    const pan = drift(name.length * 7.7)

    // Noise for the two textures that want air in them, lowpassed by a
    // one-pole so it sits under the partials rather than hissing over them.
    let noiseState = 0

    for (let i = 0; i < length; i++) {
        const t = i / rate
        let sample = 0
        for (let p = 0; p < recipe.partials.length; p++) {
            // Each partial detunes on its own slow curve, which is what stops
            // a frozen grain from sounding like a synthesizer holding a note.
            const detune = 1 + wobble(t + p * 4) * 0.0025 * (p + 1)
            const freq = recipe.base * recipe.partials[p] * detune
            sample += Math.sin(2 * Math.PI * freq * t + p) * recipe.gains[p]
        }
        sample /= recipe.gains.reduce((a, b) => a + b, 0)

        if (name === 'wash' || name === 'tape') {
            noiseState += (Math.random() * 2 - 1 - noiseState) * (name === 'wash' ? 0.06 : 0.015)
            sample = sample * 0.6 + noiseState * (name === 'wash' ? 1.6 : 0.9)
        }
        if (name === 'metal') {
            // A slow tremolo gives the scan head something to find.
            sample *= 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.37 * t)
        }

        // Gentle fades at both ends so a grain landing on the boundary of a
        // looped scan doesn't click.
        const fade = Math.min(1, t / 0.25, (seconds - t) / 0.25)
        const width = pan(t) * 0.4
        left[i] = sample * fade * (1 - Math.max(0, width)) * 0.8
        right[i] = sample * fade * (1 + Math.min(0, width)) * 0.8
    }
    return buffer
}

export function loadStarter(name: StarterName): GrainBuffer {
    return makeGrainBuffer(name, renderStarter(name))
}
