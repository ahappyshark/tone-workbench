/**
 * The serialisable shape of a grain patch.
 *
 * A separate instrument from the shark synth, with a separate store — but it
 * borrows every type that isn't about grains: filter, envelopes, LFOs, the
 * random source, the effects chain and the modulation route. Those describe
 * ideas ("an ADSR", "a slot in a chain"), not one particular instrument, and
 * two copies of them would drift.
 */

import {
    DIVISIONS,
    ENV_RANGES,
    FILTER_RANGES,
    FILTER_TYPES,
    FX_RANGES,
    FX_TYPES,
    LFO_RATE,
    MOD_DEPTH,
    MOD_SOURCE_IDS,
    MOD_SOURCE_META,
    TRIGGER_MODES,
    WAVES,
    coerceFxParams,
    createFx,
    createLFO,
    createRoute,
    fxDestinations,
    type EnvState,
    type FilterState,
    type FxSlot,
    type LFOState,
    type ModDestinationMeta,
    type ModEnvState,
    type ModRoute,
    type RandomState,
    type TriggerMode,
} from './patchTypes'

export const GRAIN_PATCH_VERSION = 2

/**
 * Voices are whole grain clouds, and a cloud costs far more than an
 * oscillator — six is already a lot of overlapping buffer sources.
 */
export const GRAIN_POLYPHONY = 6

/* ------------------------------------------------------------------ */
/* The cloud                                                           */
/* ------------------------------------------------------------------ */

/**
 * One grain cloud's parameters.
 *
 * The whole reason this instrument doesn't use `Tone.GrainPlayer`: there,
 * the read position is `tickCount * grainSize`, so position is a function of
 * elapsed time and nothing else. No freeze, no scrubbing, no jitter, and one
 * grain per tick. Here position and pitch are independent, which is what
 * granular synthesis is actually for.
 */
export interface GrainState {
    /** where the scan head sits, as a fraction of the buffer */
    position: number
    /**
     * How fast the head drifts on its own, in buffer-seconds per second.
     * Zero freezes it on `position`; negative crawls backwards. Note-on
     * resets the drift, so a note always starts where the knob points.
     */
    scan: number
    /** grain duration in seconds */
    size: number
    /** grains per second, independent of size — that's what overlap means */
    density: number
    /**
     * Random offset per grain, as a fraction of the whole buffer either side
     * of the head. A fraction rather than seconds so that "grab from anywhere
     * in the file" means the same thing whether the file is two seconds long
     * or two minutes.
     */
    spray: number
    /**
     * Window skew. 0 is a percussive grain that starts loud and decays, 1 is
     * the reverse swell, 0.5 is the symmetric triangle you want most of the
     * time. Never fully hard at either end, or every grain clicks.
     */
    shape: number
    /** random detune per grain, cents either side */
    jitter: number
    /** random pan per grain — the thing that makes a cloud wide */
    spread: number
    /** probability a grain reads backwards, 0..1 */
    reverse: number
    octave: number
    semi: number
    fine: number
    /**
     * How much the played note transposes the grains. At 1 it's a chromatic
     * keyboard; at 0 the pitch is fixed and keys only trigger clouds, which
     * is the texture-box behaviour and sounds nothing like a sampler.
     */
    keyTrack: number
}

export interface GrainVoiceState {
    mode: 'poly' | 'mono'
    /** pitch bend range in semitones, either direction */
    bendRange: number
    /**
     * Hold one cloud open with no key down. A texture box that only speaks
     * when you press something isn't a texture box.
     */
    drone: boolean
}

export const GRAIN_MODES = ['poly', 'mono'] as const

export interface GrainPatchState {
    version: number
    name: string
    grain: GrainState
    filter: FilterState
    ampEnv: EnvState
    modEnv: ModEnvState
    voice: GrainVoiceState
    random: RandomState
    /**
     * Always global here. A per-voice LFO would have to be read back into
     * JavaScript once per voice per tick to reach a grain param, and Web
     * Audio gives no way to read a node's output cheaply — see
     * `MOD_REGIMES` below.
     */
    lfos: LFOState[]
    fx: FxSlot[]
    modRoutes: ModRoute[]
}

/* ------------------------------------------------------------------ */
/* Two modulation regimes                                              */
/* ------------------------------------------------------------------ */

/**
 * The one genuinely new problem in this instrument.
 *
 * The shark synth sums modulation into `AudioParam`s at audio rate: a knob
 * writes a base signal, routes add on top, and nobody in JavaScript ever
 * needs to know the total. Grain parameters can't work that way. Grain size,
 * density, spray and position are read by the *scheduler* — plain JavaScript,
 * at the moment a grain is born — and Web Audio offers no way to read the
 * summed value of a param back out.
 *
 * So grain destinations are **sampled**: every source is reduced to a number
 * once per scheduler tick, and the route sums are done in JavaScript. Every
 * source can supply one. An envelope has `getValueAtTime`, velocity and key
 * tracking are already numbers, the random source is a number we rolled
 * ourselves, and an LFO gets a small analyser tap.
 *
 * Params still on the audio path — filter cutoff, resonance, voice pan, and
 * everything in the effects chain — keep the existing signal-summing route.
 *
 * Sampling per grain rather than per sample is not a compromise, incidentally.
 * It's what per-grain modulation *is*.
 */
export type ModRegime = 'audio' | 'grain'

export interface GrainDestinationMeta extends ModDestinationMeta {
    regime: ModRegime
}

export const GRAIN_DESTINATIONS: Record<string, GrainDestinationMeta> = {
    'grain.position': { label: 'Position', scale: 1, unit: '', regime: 'grain' },
    'grain.scan': { label: 'Scan Rate', scale: 2, unit: '×', regime: 'grain' },
    'grain.size': { label: 'Grain Size', scale: 0.25, unit: 's', regime: 'grain' },
    'grain.density': { label: 'Density', scale: 40, unit: '/s', regime: 'grain' },
    'grain.spray': { label: 'Scatter', scale: 1, unit: '', regime: 'grain' },
    'grain.shape': { label: 'Shape', scale: 1, unit: '', regime: 'grain' },
    'grain.pitch': { label: 'Grain Pitch', scale: 1200, unit: 'cents', regime: 'grain' },
    'grain.jitter': { label: 'Pitch Jitter', scale: 1200, unit: 'cents', regime: 'grain' },
    'grain.spread': { label: 'Stereo Spread', scale: 1, unit: '', regime: 'grain' },
    'grain.reverse': { label: 'Reverse Odds', scale: 1, unit: '', regime: 'grain' },
    'filter.detune': { label: 'Filter Cutoff', scale: 4800, unit: 'cents', regime: 'audio' },
    'filter.resonance': { label: 'Filter Reso', scale: 20, unit: '', regime: 'audio' },
    'amp.pan': { label: 'Cloud Pan', scale: 1, unit: '', regime: 'audio' },
}

/**
 * Every destination in the current patch: the fixed set above plus one entry
 * per modulatable effect param. Effect slots are shared and audio-rate, so
 * they arrive already marked `global`.
 */
export function grainDestinations(fx: FxSlot[]): Record<string, GrainDestinationMeta> {
    const all: Record<string, GrainDestinationMeta> = { ...GRAIN_DESTINATIONS }
    for (const [id, meta] of Object.entries(fxDestinations(fx))) {
        all[id] = { ...meta, regime: 'audio' }
    }
    return all
}

/**
 * Whether a route does anything.
 *
 * Grain destinations are resolved inside a voice, so any source reaches them.
 * The only dead route is the same one the synth has: a per-voice source
 * pointed at a shared effect param, where sixteen values meet one knob.
 */
export function isGrainRouteLive(route: ModRoute, fx: FxSlot[]): boolean {
    const meta = grainDestinations(fx)[route.destination]
    if (!meta) return false
    if (!meta.global) return true
    if (route.source.startsWith('lfo:')) return true
    const source = MOD_SOURCE_META[route.source as keyof typeof MOD_SOURCE_META]
    return source ? !source.perVoice : false
}

/* ------------------------------------------------------------------ */
/* Ranges                                                              */
/* ------------------------------------------------------------------ */

export const GRAIN_RANGES = {
    position: { min: 0, max: 1 },
    scan: { min: -2, max: 2 },
    // Below about 5ms a grain is a click with a pitch; above half a second
    // it stops being a grain and starts being a loop.
    size: { min: 0.005, max: 0.5 },
    density: { min: 0.5, max: 80 },
    spray: { min: 0, max: 1 },
    shape: { min: 0, max: 1 },
    jitter: { min: 0, max: 1200 },
    spread: { min: 0, max: 1 },
    reverse: { min: 0, max: 1 },
    octave: { min: -2, max: 2 },
    semi: { min: -12, max: 12 },
    fine: { min: -50, max: 50 },
    keyTrack: { min: 0, max: 1 },
} as const

export const GRAIN_VOICE_RANGES = {
    bendRange: { min: 0, max: 24 },
} as const

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_GRAIN_PATCH: GrainPatchState = {
    version: GRAIN_PATCH_VERSION,
    name: 'Init Cloud',
    grain: {
        position: 0.25,
        scan: 0.1,
        // Small grains at a healthy rate, with enough scatter to be obviously
        // granular on load. The old defaults produced an overlap of two and a
        // scatter of one percent of the buffer, which just sounded like
        // playback with a filter on it.
        size: 0.07,
        density: 26,
        spray: 0.18,
        shape: 0.5,
        jitter: 15,
        spread: 0.7,
        reverse: 0,
        octave: 0,
        semi: 0,
        fine: 0,
        keyTrack: 1,
    },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.7, envAmount: 0, keyTrack: 0 },
    // Slow by default: a cloud with a 10ms attack is a sampler, not a texture.
    ampEnv: { attack: 0.6, decay: 0.4, sustain: 0.9, release: 2.5 },
    modEnv: { attack: 0.5, decay: 1, sustain: 0.3, release: 2, trigger: 'key', rate: 0.2, division: '1n' },
    voice: { mode: 'poly', bendRange: 2, drone: false },
    random: { rate: 4, trigger: 'free', division: '8n' },
    lfos: [],
    fx: [],
    modRoutes: [],
}

export function createGrainLFO(id: string): LFOState {
    // perVoice is meaningless here and forced off; see GrainPatchState.lfos.
    return { ...createLFO(id), perVoice: false, rate: 0.2 }
}

export { createFx as createGrainFx, createRoute as createGrainRoute }

/* ------------------------------------------------------------------ */
/* Import coercion                                                     */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown, fallback: number, range?: { min: number, max: number }, integer = false): number {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return fallback
    const clamped = range ? Math.min(range.max, Math.max(range.min, n)) : n
    return integer ? Math.round(clamped) : clamped
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

function coerceEnv(raw: unknown, base: EnvState): EnvState {
    const r = isRecord(raw) ? raw : {}
    return {
        attack: num(r.attack, base.attack, ENV_RANGES.attack),
        decay: num(r.decay, base.decay, ENV_RANGES.decay),
        sustain: num(r.sustain, base.sustain, ENV_RANGES.sustain),
        release: num(r.release, base.release, ENV_RANGES.release),
    }
}

function coerceTrigger(r: Record<string, unknown>, base: TriggerMode): TriggerMode {
    return typeof r.trigger === 'string' ? pick(r.trigger, TRIGGER_MODES, base) : base
}

/**
 * Turn arbitrary parsed JSON into a valid `GrainPatchState`. Never throws —
 * preset files are hand-editable and several Tone setters throw rather than
 * ignore a bad value.
 */
export function coerceGrainPatch(raw: unknown): GrainPatchState {
    if (!isRecord(raw)) return structuredClone(DEFAULT_GRAIN_PATCH)
    const d = DEFAULT_GRAIN_PATCH

    const g = isRecord(raw.grain) ? raw.grain : {}
    const rawFilter = isRecord(raw.filter) ? raw.filter : {}
    const rawVoice = isRecord(raw.voice) ? raw.voice : {}
    const rawRandom = isRecord(raw.random) ? raw.random : {}

    const lfoIds = new Set<string>()
    const lfos: LFOState[] = (Array.isArray(raw.lfos) ? raw.lfos : []).filter(isRecord).map((entry, i) => {
        const base = createGrainLFO(`lfo-${i}`)
        let id = str(entry.id, base.id)
        while (lfoIds.has(id)) id = `${id}-dup`
        lfoIds.add(id)
        return {
            id,
            waveform: pick(entry.waveform, WAVES, base.waveform),
            rate: num(entry.rate, base.rate, LFO_RATE),
            trigger: coerceTrigger(entry, base.trigger),
            division: pick(entry.division, DIVISIONS, base.division),
            perVoice: false,
            running: bool(entry.running, base.running),
        }
    })

    const fxIds = new Set<string>()
    const fx: FxSlot[] = (Array.isArray(raw.fx) ? raw.fx : []).filter(isRecord).map((entry, i) => {
        const base = createFx(`fx-${i}`)
        let id = str(entry.id, base.id)
        while (fxIds.has(id)) id = `${id}-dup`
        fxIds.add(id)
        return {
            id,
            type: pick(entry.type, FX_TYPES, base.type),
            enabled: bool(entry.enabled, base.enabled),
            wet: num(entry.wet, base.wet, FX_RANGES.wet),
            params: coerceFxParams(entry.params),
        }
    })

    const destinations = grainDestinations(fx)
    const routeIds = new Set<string>()
    const modRoutes: ModRoute[] = (Array.isArray(raw.modRoutes) ? raw.modRoutes : [])
        .filter(isRecord)
        .map((entry, i) => {
            const base = createRoute(`route-${i}`)
            let id = str(entry.id, base.id)
            while (routeIds.has(id)) id = `${id}-dup`
            routeIds.add(id)
            const source = str(entry.source, base.source)
            const sourceOk = source.startsWith('lfo:')
                ? lfoIds.has(source.slice(4))
                : (MOD_SOURCE_IDS as readonly string[]).includes(source)
            const destination = str(entry.destination, 'grain.position')
            return {
                id,
                source: sourceOk ? source : base.source,
                destination: destination in destinations ? destination : 'grain.position',
                depth: num(entry.depth, base.depth, MOD_DEPTH),
            }
        })

    return {
        version: GRAIN_PATCH_VERSION,
        name: str(raw.name, d.name),
        grain: {
            position: num(g.position, d.grain.position, GRAIN_RANGES.position),
            scan: num(g.scan, d.grain.scan, GRAIN_RANGES.scan),
            size: num(g.size, d.grain.size, GRAIN_RANGES.size),
            density: num(g.density, d.grain.density, GRAIN_RANGES.density),
            spray: num(g.spray, d.grain.spray, GRAIN_RANGES.spray),
            shape: num(g.shape, d.grain.shape, GRAIN_RANGES.shape),
            jitter: num(g.jitter, d.grain.jitter, GRAIN_RANGES.jitter),
            spread: num(g.spread, d.grain.spread, GRAIN_RANGES.spread),
            reverse: num(g.reverse, d.grain.reverse, GRAIN_RANGES.reverse),
            octave: num(g.octave, d.grain.octave, GRAIN_RANGES.octave, true),
            semi: num(g.semi, d.grain.semi, GRAIN_RANGES.semi, true),
            fine: num(g.fine, d.grain.fine, GRAIN_RANGES.fine),
            keyTrack: num(g.keyTrack, d.grain.keyTrack, GRAIN_RANGES.keyTrack),
        },
        filter: {
            type: pick(rawFilter.type, FILTER_TYPES, d.filter.type),
            cutoff: num(rawFilter.cutoff, d.filter.cutoff, FILTER_RANGES.cutoff),
            resonance: num(rawFilter.resonance, d.filter.resonance, FILTER_RANGES.resonance),
            envAmount: num(rawFilter.envAmount, d.filter.envAmount, FILTER_RANGES.envAmount),
            keyTrack: num(rawFilter.keyTrack, d.filter.keyTrack, FILTER_RANGES.keyTrack),
        },
        ampEnv: coerceEnv(raw.ampEnv, d.ampEnv),
        modEnv: {
            ...coerceEnv(raw.modEnv, d.modEnv),
            trigger: coerceTrigger(isRecord(raw.modEnv) ? raw.modEnv : {}, d.modEnv.trigger),
            rate: num(isRecord(raw.modEnv) ? raw.modEnv.rate : undefined, d.modEnv.rate, LFO_RATE),
            division: pick(isRecord(raw.modEnv) ? raw.modEnv.division : undefined, DIVISIONS, d.modEnv.division),
        },
        voice: {
            mode: pick(rawVoice.mode, GRAIN_MODES, d.voice.mode),
            bendRange: num(rawVoice.bendRange, d.voice.bendRange, GRAIN_VOICE_RANGES.bendRange, true),
            drone: bool(rawVoice.drone, d.voice.drone),
        },
        random: {
            rate: num(rawRandom.rate, d.random.rate, LFO_RATE),
            trigger: coerceTrigger(rawRandom, d.random.trigger),
            division: pick(rawRandom.division, DIVISIONS, d.random.division),
        },
        lfos,
        fx,
        modRoutes,
    }
}
