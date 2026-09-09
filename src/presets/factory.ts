import {
    coercePatch,
    fxDestinationId,
    type FxParams,
    type FxSlot,
    type LFOState,
    type ModRoute,
    type PatchState,
} from '../audio/patchTypes'

/**
 * The factory bank.
 *
 * These are data, not code — which is the whole bet `SYNTH-DESIGN.md` makes
 * about the two planned variants. If a preset here needs something the engine
 * can't express, that's the engine's gap, not a reason to special-case the
 * preset.
 *
 * Each entry is a sparse override of `DEFAULT_PATCH` run through
 * `coercePatch`, so a preset only states what it changes and gains sensible
 * values for everything added later. That also means these double as
 * regression fixtures: if coercion breaks, the bank stops loading.
 */

type Spec = {
    name: string
    oscA?: Partial<PatchState['oscA']>
    oscB?: Partial<PatchState['oscB']>
    sub?: Partial<PatchState['sub']>
    noise?: Partial<PatchState['noise']>
    filter?: Partial<PatchState['filter']>
    ampEnv?: Partial<PatchState['ampEnv']>
    modEnv?: Partial<PatchState['modEnv']>
    voice?: Partial<PatchState['voice']>
    random?: Partial<PatchState['random']>
    lfos?: (Partial<LFOState> & { id: string })[]
    fx?: (Partial<Omit<FxSlot, 'params'>> & { id: string, type: FxSlot['type'], params?: Partial<FxParams> })[]
    modRoutes?: (Partial<ModRoute> & { source: string, destination: string, depth: number })[]
}

/** A short line for the UI, so the bank isn't eight opaque names. */
export interface FactoryPreset {
    name: string
    blurb: string
    patch: PatchState
}

function build(spec: Spec, blurb: string): FactoryPreset {
    const routes = (spec.modRoutes ?? []).map((r, i) => ({ id: `r${i}`, ...r }))
    return {
        name: spec.name,
        blurb,
        patch: coercePatch({ ...spec, modRoutes: routes }),
    }
}

export const FACTORY_PRESETS: FactoryPreset[] = [
    build({
        name: 'Drift Pad',
        oscA: { mode: 'fat', wave: 'sawtooth', level: 0.55, count: 3, spread: 14 },
        oscB: { wave: 'sawtooth', level: 0.45, octave: -1, fine: -6 },
        sub: { wave: 'sine', octave: 1, level: 0.15 },
        noise: { type: 'pink', level: 0.04 },
        filter: { type: 'lowpass', cutoff: 1200, resonance: 2, envAmount: 1200, keyTrack: 0.3 },
        ampEnv: { attack: 1.2, decay: 1.5, sustain: 0.8, release: 3.5 },
        modEnv: { attack: 2, decay: 3, sustain: 0.5, release: 3 },
        voice: { mode: 'poly', unison: 2, detune: 18, spread: 0.7 },
        lfos: [{ id: 'drift', waveform: 'sine', rate: 0.12, trigger: 'free', perVoice: true }],
        fx: [
            { id: 'ch', type: 'chorus', wet: 0.5, params: { rate: 0.6, depth: 0.7, spread: 180, feedback: 0.1 } },
            { id: 'dl', type: 'delay', wet: 0.25, params: { time: 0.48, feedback: 0.38 } },
            { id: 'rv', type: 'reverb', wet: 0.55, params: { decay: 9, preDelay: 0.05 } },
        ],
        modRoutes: [
            { source: 'lfo:drift', destination: 'filter.detune', depth: 0.25 },
            { source: 'lfo:drift', destination: 'amp.pan', depth: 0.4 },
        ],
    }, 'Slow saws, per-voice drift, long tail. The ambient starting point.'),

    build({
        name: 'Glass Bell',
        oscA: { mode: 'fm', wave: 'sine', level: 0.8, harmonicity: 3.5, modulationIndex: 7 },
        oscB: { wave: 'sine', level: 0.25, octave: 1, fine: 4 },
        filter: { type: 'lowpass', cutoff: 9000, resonance: 0.8, envAmount: 2400 },
        ampEnv: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.8 },
        modEnv: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
        voice: { mode: 'poly', unison: 1 },
        fx: [
            { id: 'dl', type: 'delay', wet: 0.2, params: { time: 0.32, feedback: 0.3 } },
            { id: 'rv', type: 'reverb', wet: 0.4, params: { decay: 5, preDelay: 0.02 } },
        ],
        modRoutes: [
            { source: 'velocity', destination: 'filter.detune', depth: 0.35 },
        ],
    }, 'FM strike with no sustain. Play it hard for a brighter bell.'),

    build({
        name: 'Aggro Bass',
        oscA: { wave: 'sawtooth', level: 0.9 },
        oscB: { wave: 'square', level: 0.5, octave: -1, fine: 8 },
        sub: { wave: 'square', octave: 1, level: 0.5 },
        filter: { type: 'lowpass', cutoff: 260, resonance: 6, envAmount: 3000, keyTrack: 0.4 },
        ampEnv: { attack: 0.005, decay: 0.35, sustain: 0.55, release: 0.25 },
        modEnv: { attack: 0.002, decay: 0.28, sustain: 0.1, release: 0.3 },
        voice: { mode: 'mono', priority: 'low', glide: 0.06, unison: 2, detune: 16, spread: 0.25 },
        fx: [
            { id: 'dr', type: 'drive', wet: 0.7, params: { drive: 0.45 } },
            { id: 'rv', type: 'reverb', wet: 0.12, params: { decay: 1.5 } },
        ],
        modRoutes: [
            { source: 'velocity', destination: 'filter.detune', depth: 0.3 },
        ],
    }, 'Mono, low-note priority, driven. Hold a root and play over it.'),

    build({
        name: 'Rubber Pluck',
        oscA: { mode: 'pulse', level: 0.75, width: 0.22 },
        oscB: { wave: 'sawtooth', level: 0.3, fine: -8 },
        filter: { type: 'lowpass', cutoff: 700, resonance: 5, envAmount: 3200, keyTrack: 0.5 },
        ampEnv: { attack: 0.004, decay: 0.5, sustain: 0.15, release: 0.5 },
        modEnv: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.25 },
        voice: { mode: 'poly', unison: 1 },
        lfos: [{ id: 'wob', waveform: 'sine', rate: 3.2, trigger: 'key', perVoice: true }],
        fx: [
            { id: 'dl', type: 'delay', wet: 0.28, params: { time: 0.19, feedback: 0.32 } },
            { id: 'rv', type: 'reverb', wet: 0.2, params: { decay: 2 } },
        ],
        modRoutes: [
            { source: 'lfo:wob', destination: 'filter.detune', depth: 0.06 },
        ],
    }, 'Short pulse pluck. The wobble is key-triggered, so every note starts alike.'),

    build({
        name: 'Hollow Choir',
        oscA: { mode: 'fat', wave: 'sawtooth', level: 0.5, count: 3, spread: 25 },
        oscB: { wave: 'triangle', level: 0.4, octave: -1 },
        noise: { type: 'pink', level: 0.12 },
        filter: { type: 'bandpass', cutoff: 900, resonance: 3, envAmount: 900, keyTrack: 0.6 },
        ampEnv: { attack: 0.8, decay: 1.2, sustain: 0.75, release: 2.4 },
        modEnv: { attack: 1.5, decay: 2, sustain: 0.4, release: 2 },
        voice: { mode: 'poly', unison: 2, detune: 22, spread: 0.85 },
        lfos: [
            { id: 'breathe', waveform: 'sine', rate: 0.22, trigger: 'free', perVoice: true },
            { id: 'wide', waveform: 'triangle', rate: 0.07, trigger: 'free', perVoice: false },
        ],
        fx: [
            { id: 'ch', type: 'chorus', wet: 0.6, params: { rate: 0.4, depth: 0.8, spread: 180 } },
            { id: 'rv', type: 'reverb', wet: 0.6, params: { decay: 12, preDelay: 0.08 } },
        ],
        modRoutes: [
            { source: 'lfo:breathe', destination: 'filter.detune', depth: 0.3 },
            { source: 'lfo:breathe', destination: 'amp.pan', depth: 0.5 },
            // A shared LFO onto a shared reverb: the one combination that can
            // reach an effect param.
            { source: 'lfo:wide', destination: fxDestinationId('rv', 'wet'), depth: 0.15 },
        ],
    }, 'Bandpass formant pad. A shared LFO breathes the reverb in and out.'),

    build({
        name: 'Cascade',
        oscA: { wave: 'square', level: 0.6 },
        oscB: { wave: 'sawtooth', level: 0.35, octave: -1 },
        filter: { type: 'lowpass', cutoff: 1400, resonance: 7, envAmount: 1800 },
        ampEnv: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.35 },
        modEnv: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.3, trigger: 'sync', division: '16n' },
        random: { trigger: 'key' },
        voice: { mode: 'poly', unison: 1 },
        lfos: [{ id: 'gate', waveform: 'square', trigger: 'sync', division: '16n', perVoice: false }],
        fx: [
            { id: 'dl', type: 'delay', wet: 0.3, params: { time: 0.28, feedback: 0.45 } },
            { id: 'rv', type: 'reverb', wet: 0.25, params: { decay: 3 } },
        ],
        modRoutes: [
            { source: 'random', destination: 'filter.detune', depth: 0.3 },
            { source: 'lfo:gate', destination: fxDestinationId('dl', 'wet'), depth: 0.3 },
        ],
    }, 'Sixteenth-note looping envelope and a gated delay. Start the transport.'),

    build({
        name: 'Deep Space',
        oscA: { mode: 'fat', wave: 'triangle', level: 0.5, count: 5, spread: 30 },
        oscB: { mode: 'fm', wave: 'sine', level: 0.3, octave: -1, harmonicity: 0.5, modulationIndex: 3 },
        noise: { type: 'brown', level: 0.06 },
        filter: { type: 'lowpass', cutoff: 700, resonance: 4, envAmount: 2400, keyTrack: 0.2 },
        ampEnv: { attack: 2.5, decay: 3, sustain: 0.85, release: 6 },
        modEnv: { attack: 3, decay: 4, sustain: 0.3, release: 5, trigger: 'free', rate: 0.08 },
        voice: { mode: 'poly', unison: 2, detune: 25, spread: 0.9 },
        lfos: [{ id: 'tide', waveform: 'sine', rate: 0.05, trigger: 'free', perVoice: false }],
        fx: [
            { id: 'ch', type: 'chorus', wet: 0.35, params: { rate: 0.25, depth: 0.9 } },
            { id: 'dl', type: 'delay', wet: 0.35, params: { time: 0.75, feedback: 0.5 } },
            { id: 'rv', type: 'reverb', wet: 0.7, params: { decay: 16, preDelay: 0.1 } },
        ],
        modRoutes: [
            { source: 'lfo:tide', destination: 'filter.detune', depth: 0.2 },
            { source: 'lfo:tide', destination: fxDestinationId('rv', 'wet'), depth: 0.2 },
        ],
    }, 'Very slow everything. The mod envelope loops free at 0.08 Hz, so it never repeats the same way twice.'),

    build({
        name: 'Siren Lead',
        oscA: { wave: 'sawtooth', level: 0.8 },
        oscB: { wave: 'sawtooth', level: 0.6, fine: 12 },
        sub: { wave: 'square', octave: 1, level: 0.25 },
        filter: { type: 'lowpass', cutoff: 2200, resonance: 5, envAmount: 1800, keyTrack: 0.5 },
        ampEnv: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.4 },
        modEnv: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.4 },
        voice: { mode: 'mono', priority: 'last', glide: 0.08, unison: 3, detune: 20, spread: 0.4 },
        lfos: [{ id: 'vib', waveform: 'sine', rate: 5.5, trigger: 'key', perVoice: false }],
        fx: [
            { id: 'dr', type: 'drive', wet: 0.45, params: { drive: 0.3 } },
            { id: 'dl', type: 'delay', wet: 0.3, params: { time: 0.36, feedback: 0.4 } },
            { id: 'rv', type: 'reverb', wet: 0.25, params: { decay: 2.5 } },
        ],
        modRoutes: [
            { source: 'lfo:vib', destination: 'oscA.detune', depth: 0.04 },
            { source: 'lfo:vib', destination: 'oscB.detune', depth: 0.04 },
            { source: 'modWheel', destination: 'filter.detune', depth: 0.3 },
        ],
    }, 'Mono glide lead. The vibrato restarts with each note; the mod wheel opens the filter.'),
]

export function loadFactoryPreset(name: string): PatchState | null {
    const found = FACTORY_PRESETS.find(p => p.name === name)
    // Cloned, so loading the same preset twice can't hand out a patch the
    // store has already mutated a section of.
    return found ? structuredClone(found.patch) : null
}
