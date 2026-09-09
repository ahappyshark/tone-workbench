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
 * moment it loads, and additive synthesis does that without putting megabytes
 * of audio in a git repo.
 *
 * The first version of these was wrong in an instructive way. They were
 * written to "granulate well" — smooth, evolving, no silence — which made
 * them spectrally identical everywhere: a measured similarity of 0.998 or
 * better between any two windows. Every grain control worked perfectly and
 * none of them could be heard, because it does not matter where you read from
 * a buffer that sounds the same all the way through.
 *
 * So the rule is the opposite of the obvious one. **Starter material must
 * change across its length**: different pitches, different timbres, attacks,
 * and gaps. Position, scan and scatter are only audible as the difference
 * between one moment and another.
 */
export type StarterName = 'chords' | 'vowels' | 'bells' | 'weather' | 'melody'

export const STARTERS: readonly StarterName[] = ['chords', 'vowels', 'bells', 'weather', 'melody']

/** Deterministic noise, so a starter sounds the same every time it loads. */
function rng(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0
        return state / 4294967296
    }
}

/**
 * One sound placed in the buffer. Events are how the contrast gets in: a
 * texture is a sequence of these at different times, pitches and timbres.
 */
interface Event {
    at: number
    dur: number
    freq: number
    /** partial ratios against `freq`, and their relative levels */
    partials: readonly number[]
    gains: readonly number[]
    /** 0 swells in and out like a pad, 1 is struck and decays */
    strike: number
    /** filtered noise mixed in, 0..1 */
    air: number
    /** -1..1 */
    pan: number
    level: number
}

const SECONDS = 6

function midi(n: number): number {
    return 440 * Math.pow(2, (n - 69) / 12)
}

/** The events each starter is built from. */
function score(name: StarterName): Event[] {
    const random = rng(name.length * 7919)
    const events: Event[] = []

    const harmonic = [1, 2, 3, 4, 5, 6, 8]
    const harmonicGains = [1, .5, .33, .22, .15, .1, .06]
    // Struck metal is inharmonic — that's what makes it read as metal.
    const inharmonic = [1, 2.76, 5.4, 8.93, 13.34, 18.64]
    const inharmonicGains = [1, .6, .4, .26, .16, .1]

    switch (name) {
        case 'chords': {
            // Four chords, so where you read decides what harmony you get.
            const chords = [[43, 50, 55, 59], [41, 48, 53, 57], [45, 52, 57, 60], [38, 45, 50, 54]]
            chords.forEach((chord, i) => {
                for (const note of chord) {
                    events.push({
                        at: i * 1.4, dur: 1.9, freq: midi(note),
                        partials: harmonic, gains: harmonicGains,
                        strike: 0, air: 0.04, pan: (random() * 2 - 1) * 0.6, level: 0.28,
                    })
                }
            })
            break
        }
        case 'vowels': {
            // Formant-ish weightings, changed every event, over a moving
            // pitch. Scanning across this is a vowel sweep.
            const vowels = [
                [1, .7, .25, .5, .1, .05, .02],
                [1, .35, .8, .15, .3, .08, .03],
                [1, .9, .12, .06, .35, .2, .05],
                [1, .2, .45, .9, .12, .05, .02],
            ]
            for (let i = 0; i < 6; i++) {
                events.push({
                    at: i * 0.95, dur: 1.3, freq: midi(55 + [0, 3, 7, 5, 10, 3][i]),
                    partials: harmonic, gains: vowels[i % vowels.length],
                    strike: 0, air: 0.08, pan: (random() * 2 - 1) * 0.7, level: 0.3,
                })
            }
            break
        }
        case 'bells': {
            // Struck, with real gaps. The gaps matter: a grain landing in one
            // is silence, which is how you hear scatter working.
            for (let i = 0; i < 9; i++) {
                events.push({
                    at: i * 0.62 + random() * 0.1, dur: 1.6 + random(),
                    freq: midi(60 + [0, 7, 12, 3, 10, 5, 15, 8, 19][i]),
                    partials: inharmonic, gains: inharmonicGains,
                    strike: 1, air: 0.02, pan: (random() * 2 - 1) * 0.8, level: 0.34,
                })
            }
            break
        }
        case 'weather': {
            // Mostly air, at wildly different densities and registers.
            for (let i = 0; i < 7; i++) {
                events.push({
                    at: i * 0.8, dur: 1.1 + random() * 0.8,
                    freq: midi(36 + Math.floor(random() * 28)),
                    partials: [1, 1.5, 2.01, 3.02], gains: [.6, .4, .3, .2],
                    strike: random() > 0.5 ? 1 : 0, air: 0.5 + random() * 0.5,
                    pan: (random() * 2 - 1) * 0.9, level: 0.3,
                })
            }
            break
        }
        case 'melody': {
            // Short plucks with silence between them — the clearest possible
            // demonstration of what position and scatter do.
            const line = [60, 67, 63, 70, 58, 65, 72, 55, 62, 69, 60, 67]
            line.forEach((note, i) => {
                events.push({
                    at: i * 0.47, dur: 0.42, freq: midi(note),
                    partials: [1, 2, 3, 4, 5], gains: [1, .45, .2, .1, .05],
                    strike: 1, air: 0.03, pan: (random() * 2 - 1) * 0.5, level: 0.45,
                })
            })
            break
        }
    }
    return events
}

function renderStarter(name: StarterName): AudioBuffer {
    const ctx = Tone.getContext()
    const rate = ctx.sampleRate
    const length = Math.floor(rate * SECONDS)
    const buffer = ctx.createBuffer(2, length, rate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)
    const random = rng(name.length * 104729)

    for (const event of score(name)) {
        const start = Math.floor(event.at * rate)
        const count = Math.min(Math.floor(event.dur * rate), length - start)
        if (count <= 0) continue
        const sum = event.gains.reduce((a, b) => a + b, 0)
        // One-pole lowpassed noise, so `air` sits under the partials rather
        // than hissing over them.
        let noise = 0
        const cutoff = 0.02 + (event.freq / 2000) * 0.2
        const leftGain = Math.sqrt((1 - event.pan) / 2)
        const rightGain = Math.sqrt((1 + event.pan) / 2)

        for (let i = 0; i < count; i++) {
            const t = i / rate
            const phase = t / event.dur

            let sample = 0
            for (let p = 0; p < event.partials.length; p++) {
                // A touch of detune per partial, so a frozen grain doesn't
                // sound like a synthesizer holding a perfectly still note.
                const detune = 1 + Math.sin(t * (0.7 + p * 0.31) + p) * 0.0015
                sample += Math.sin(2 * Math.PI * event.freq * event.partials[p] * detune * t + p)
                    * event.gains[p]
            }
            sample /= sum

            if (event.air > 0) {
                noise += (random() * 2 - 1 - noise) * cutoff
                sample = sample * (1 - event.air * 0.6) + noise * event.air
            }

            // Struck decays from the first sample; a pad swells and fades.
            const env = event.strike > 0
                ? Math.exp(-phase * 4.5) * Math.min(1, t / 0.004)
                : Math.sin(Math.PI * phase) ** 1.5
            const value = sample * env * event.level

            const at = start + i
            left[at] += value * leftGain
            right[at] += value * rightGain
        }
    }

    // Events overlap and sum, so normalise rather than hoping, then fade the
    // very ends so a grain landing on the boundary of a wrapped scan is clean.
    let peak = 0
    for (let i = 0; i < length; i++) {
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
    }
    const scale = peak > 0 ? 0.85 / peak : 1
    const fade = Math.floor(rate * 0.02)
    for (let i = 0; i < length; i++) {
        const edge = Math.min(1, i / fade, (length - i) / fade)
        left[i] *= scale * edge
        right[i] *= scale * edge
    }
    return buffer
}

export function loadStarter(name: StarterName): GrainBuffer {
    return makeGrainBuffer(name, renderStarter(name))
}
