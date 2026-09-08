/**
 * The serialisable shape of a whole patch.
 *
 * Everything a preset needs to restore lives in here — nothing about the
 * patch may live in component state, or it won't survive a save/load.
 */

export const PATCH_VERSION = 1

export const OSC_TYPES = ['sine', 'triangle', 'sawtooth', 'square'] as const
export type OscType = typeof OSC_TYPES[number]

export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass'] as const
export type FilterType = typeof FILTER_TYPES[number]

export interface SynthState {
    oscillator: OscType
    volume: number
    attack: number
    decay: number
    sustain: number
    release: number
    filterType: FilterType
    filterCutoff: number
    filterRes: number
}

export interface LFOState {
    id: string
    waveform: OscType
    rate: number
    min: number
    max: number
    /** param registry id, e.g. 'PolySynth.filterCutoff'. '' = unrouted */
    target: string
    running: boolean
}

export interface PatchState {
    version: number
    name: string
    synth: SynthState
    lfos: LFOState[]
}

/** Knob bounds. Shared by the UI and by import clamping so they can't drift. */
export const SYNTH_RANGES = {
    volume: { min: -40, max: 0 },
    attack: { min: 0, max: 2 },
    decay: { min: 0, max: 2 },
    sustain: { min: 0, max: 1 },
    release: { min: 0, max: 5 },
    filterCutoff: { min: 100, max: 10000 },
    filterRes: { min: 0.1, max: 20 },
} as const

export const LFO_RATE = { min: 0.01, max: 20 } as const
/** Fallback bounds for the LFO min/max knobs when no target is selected. */
export const LFO_DEPTH = { min: -10000, max: 10000 } as const

export const DEFAULT_SYNTH: SynthState = {
    oscillator: 'sawtooth',
    volume: -12,
    attack: 0.05,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    filterType: 'lowpass',
    filterCutoff: 4000,
    filterRes: 1,
}

export const DEFAULT_PATCH: PatchState = {
    version: PATCH_VERSION,
    name: 'Init',
    synth: DEFAULT_SYNTH,
    lfos: [],
}

export function createLFO(id: string): LFOState {
    return {
        id,
        waveform: 'sine',
        rate: 1,
        min: 0,
        max: 1,
        target: '',
        running: true,
    }
}

/* ------------------------------------------------------------------ */
/* Import coercion                                                     */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown, fallback: number, range?: { min: number, max: number }): number {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return fallback
    if (!range) return n
    return Math.min(range.max, Math.max(range.min, n))
}

function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
    return options.includes(v as T) ? (v as T) : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
    return typeof v === 'boolean' ? v : fallback
}

function str(v: unknown, fallback: string): string {
    return typeof v === 'string' ? v : fallback
}

/**
 * Turn arbitrary parsed JSON into a valid PatchState.
 *
 * Preset files are user-editable and travel between machines, so anything
 * missing, mistyped or out of range falls back to the default rather than
 * reaching a Tone node. Never throws.
 */
export function coercePatch(raw: unknown): PatchState {
    if (!isRecord(raw)) return { ...DEFAULT_PATCH }

    const rawSynth = isRecord(raw.synth) ? raw.synth : {}
    const synth: SynthState = {
        oscillator: pick(rawSynth.oscillator, OSC_TYPES, DEFAULT_SYNTH.oscillator),
        volume: num(rawSynth.volume, DEFAULT_SYNTH.volume, SYNTH_RANGES.volume),
        attack: num(rawSynth.attack, DEFAULT_SYNTH.attack, SYNTH_RANGES.attack),
        decay: num(rawSynth.decay, DEFAULT_SYNTH.decay, SYNTH_RANGES.decay),
        sustain: num(rawSynth.sustain, DEFAULT_SYNTH.sustain, SYNTH_RANGES.sustain),
        release: num(rawSynth.release, DEFAULT_SYNTH.release, SYNTH_RANGES.release),
        filterType: pick(rawSynth.filterType, FILTER_TYPES, DEFAULT_SYNTH.filterType),
        filterCutoff: num(rawSynth.filterCutoff, DEFAULT_SYNTH.filterCutoff, SYNTH_RANGES.filterCutoff),
        filterRes: num(rawSynth.filterRes, DEFAULT_SYNTH.filterRes, SYNTH_RANGES.filterRes),
    }

    const seen = new Set<string>()
    const rawLfos = Array.isArray(raw.lfos) ? raw.lfos : []
    const lfos: LFOState[] = rawLfos.filter(isRecord).map((entry, i) => {
        const base = createLFO(`lfo-${i}`)
        let id = str(entry.id, base.id)
        // ids key React's reconciliation and each LFO's Tone node — dupes
        // would collapse two modules into one.
        while (seen.has(id)) id = `${id}-dup`
        seen.add(id)
        return {
            id,
            waveform: pick(entry.waveform, OSC_TYPES, base.waveform),
            rate: num(entry.rate, base.rate, LFO_RATE),
            min: num(entry.min, base.min, LFO_DEPTH),
            max: num(entry.max, base.max, LFO_DEPTH),
            target: str(entry.target, base.target),
            running: bool(entry.running, base.running),
        }
    })

    return {
        version: PATCH_VERSION,
        name: str(raw.name, DEFAULT_PATCH.name),
        synth,
        lfos,
    }
}
