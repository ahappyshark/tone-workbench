/**
 * The serialisable shape of a whole patch.
 *
 * Everything a preset needs to restore lives in here — nothing about the
 * patch may live in component state, or it won't survive a save/load.
 */

export const PATCH_VERSION = 3

export const WAVES = ['sine', 'triangle', 'sawtooth', 'square'] as const
export type Wave = typeof WAVES[number]

/**
 * How an oscillator slot uses its wave. Maps onto `Tone.OmniOscillator`'s
 * type string — 'fat' gives detuned copies inside the node, 'fm'/'am' swap in
 * the FM/AM oscillators, 'pulse' ignores the wave entirely.
 *
 * No 'pwm' mode: PWM is just pulse width modulated by an LFO, which the mod
 * matrix does better in phase 2.
 */
export const OSC_MODES = ['basic', 'fat', 'fm', 'am', 'pulse'] as const
export type OscMode = typeof OSC_MODES[number]

export const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'] as const
export type FilterType = typeof FILTER_TYPES[number]

export const NOISE_TYPES = ['white', 'pink', 'brown'] as const
export type NoiseType = typeof NOISE_TYPES[number]

export const VOICE_MODES = ['poly', 'mono', 'legato'] as const
export type VoiceMode = typeof VOICE_MODES[number]

export interface OscState {
    mode: OscMode
    wave: Wave
    level: number
    octave: number
    semi: number
    fine: number
    /** pulse only */
    width: number
    /** fat only */
    count: number
    /** fat only */
    spread: number
    /** fm and am */
    harmonicity: number
    /** fm only */
    modulationIndex: number
}

export interface SubState {
    wave: Wave
    /** octaves below the played note */
    octave: number
    level: number
}

export interface NoiseState {
    type: NoiseType
    level: number
}

export interface FilterState {
    type: FilterType
    cutoff: number
    resonance: number
    /** mod envelope depth, in cents — signed, so it can sweep downward */
    envAmount: number
    /** 0 = fixed cutoff, 1 = cutoff tracks the played pitch exactly */
    keyTrack: number
}

export interface EnvState {
    attack: number
    decay: number
    sustain: number
    release: number
}

export interface VoiceState {
    mode: VoiceMode
    /** portamento seconds */
    glide: number
    /** voices consumed per note; > 1 costs polyphony */
    unison: number
    /** total detune spread across a unison group, in cents */
    detune: number
    /** stereo spread across a unison group, 0..1 */
    spread: number
}

/** Tempo-locked LFO rates, as note divisions of the transport. */
export const DIVISIONS = ['1n', '2n', '4n', '4t', '8n', '8t', '16n', '16t', '32n'] as const
export type Division = typeof DIVISIONS[number]

export interface LFOState {
    id: string
    waveform: Wave
    /** free-running rate in Hz, used when sync is off */
    rate: number
    /** lock the rate to transport tempo. Synced LFOs only run while the
     *  transport does — that's what locking to it means. */
    sync: boolean
    division: Division
    /**
     * One LFO per voice, retriggered on note-on, so each note drifts
     * independently. Off means a single shared LFO and every note moves in
     * lockstep.
     */
    perVoice: boolean
    running: boolean
}

/** Stepped random / sample-and-hold. One global source. */
export interface RandomState {
    rate: number
    sync: boolean
    division: Division
}

/**
 * One modulation connection. Depth is bipolar -1..1 and scaled by the
 * destination's own `scale`, so depth is comparable across destinations and
 * a negative value simply inverts.
 */
export interface ModRoute {
    id: string
    /** a fixed source id, or `lfo:<lfoId>` */
    source: string
    /** a key of MOD_DESTINATIONS */
    destination: string
    depth: number
}

export const MOD_SOURCE_IDS = ['modEnv', 'velocity', 'keyTrack', 'modWheel', 'random'] as const
export type FixedModSource = typeof MOD_SOURCE_IDS[number]

export const MOD_SOURCE_META: Record<FixedModSource, { label: string, perVoice: boolean }> = {
    modEnv: { label: 'Mod Envelope', perVoice: true },
    velocity: { label: 'Velocity', perVoice: true },
    keyTrack: { label: 'Key Track', perVoice: true },
    modWheel: { label: 'Mod Wheel', perVoice: false },
    random: { label: 'Random S&H', perVoice: false },
}

/**
 * Where modulation can go, and what a depth of 1.0 means there.
 *
 * Cutoff and pitch route to `detune` (cents, exponential) rather than
 * frequency (linear Hz), so a given depth sweeps the same number of octaves
 * wherever the knob happens to sit.
 */
export const MOD_DESTINATIONS: Record<string, { label: string, scale: number, unit: string }> = {
    'filter.detune': { label: 'Filter Cutoff', scale: 4800, unit: 'cents' },
    'filter.resonance': { label: 'Filter Reso', scale: 20, unit: '' },
    'oscA.detune': { label: 'Osc A Pitch', scale: 1200, unit: 'cents' },
    'oscB.detune': { label: 'Osc B Pitch', scale: 1200, unit: 'cents' },
    'oscA.level': { label: 'Osc A Level', scale: 1, unit: '' },
    'oscB.level': { label: 'Osc B Level', scale: 1, unit: '' },
    'sub.level': { label: 'Sub Level', scale: 1, unit: '' },
    'noise.level': { label: 'Noise Level', scale: 1, unit: '' },
    'amp.pan': { label: 'Pan', scale: 1, unit: '' },
}

export interface PatchState {
    version: number
    name: string
    oscA: OscState
    oscB: OscState
    sub: SubState
    noise: NoiseState
    filter: FilterState
    ampEnv: EnvState
    modEnv: EnvState
    voice: VoiceState
    random: RandomState
    lfos: LFOState[]
    modRoutes: ModRoute[]
}

/* ------------------------------------------------------------------ */
/* Ranges — shared by the knobs and by import clamping                 */
/* ------------------------------------------------------------------ */

export const OSC_RANGES = {
    level: { min: 0, max: 1 },
    octave: { min: -2, max: 2 },
    semi: { min: -12, max: 12 },
    fine: { min: -50, max: 50 },
    width: { min: 0.01, max: 0.99 },
    count: { min: 1, max: 7 },
    spread: { min: 0, max: 100 },
    harmonicity: { min: 0.25, max: 8 },
    modulationIndex: { min: 0, max: 30 },
} as const

export const SUB_RANGES = {
    octave: { min: 1, max: 2 },
    level: { min: 0, max: 1 },
} as const

export const NOISE_RANGES = {
    level: { min: 0, max: 1 },
} as const

export const FILTER_RANGES = {
    cutoff: { min: 20, max: 18000 },
    resonance: { min: 0.1, max: 20 },
    envAmount: { min: -4800, max: 4800 },
    keyTrack: { min: 0, max: 1 },
} as const

export const ENV_RANGES = {
    attack: { min: 0.001, max: 4 },
    decay: { min: 0.001, max: 4 },
    sustain: { min: 0, max: 1 },
    release: { min: 0.001, max: 8 },
} as const

export const VOICE_RANGES = {
    glide: { min: 0, max: 1 },
    unison: { min: 1, max: 8 },
    detune: { min: 0, max: 50 },
    spread: { min: 0, max: 1 },
} as const

export const LFO_RATE = { min: 0.01, max: 20 } as const
/** Modulation depth is bipolar and normalised; the destination scales it. */
export const MOD_DEPTH = { min: -1, max: 1 } as const

/** Integer-valued params — knobs snap, coercion rounds. */
export const INTEGER_PARAMS = new Set(['octave', 'semi', 'count'])

/* ------------------------------------------------------------------ */
/* Which oscillator params are live for which mode                     */
/* ------------------------------------------------------------------ */

/**
 * `Tone.OmniOscillator` *throws* when you set a param the current type
 * doesn't have — setting `modulationIndex` on a sawtooth is an error, not a
 * no-op. The patch stores every param regardless; the apply layer consults
 * this table before writing.
 */
export const OSC_MODE_PARAMS: Record<OscMode, readonly (keyof OscState)[]> = {
    basic: [],
    fat: ['count', 'spread'],
    fm: ['harmonicity', 'modulationIndex'],
    am: ['harmonicity'],
    pulse: ['width'],
}

/** The `Tone.OmniOscillator` type string for an oscillator's mode + wave. */
export function omniType(osc: OscState): string {
    switch (osc.mode) {
        case 'basic': return osc.wave
        case 'fat': return `fat${osc.wave}`
        case 'fm': return `fm${osc.wave}`
        case 'am': return `am${osc.wave}`
        case 'pulse': return 'pulse'
    }
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

function defaultOsc(overrides: Partial<OscState> = {}): OscState {
    return {
        mode: 'basic',
        wave: 'sawtooth',
        level: 0.8,
        octave: 0,
        semi: 0,
        fine: 0,
        width: 0.5,
        count: 3,
        spread: 20,
        harmonicity: 1,
        modulationIndex: 5,
        ...overrides,
    }
}

export const DEFAULT_PATCH: PatchState = {
    version: PATCH_VERSION,
    name: 'Init',
    oscA: defaultOsc(),
    // B detuned a touch so the default patch already beats slightly
    oscB: defaultOsc({ level: 0.5, fine: 7 }),
    sub: { wave: 'square', octave: 1, level: 0 },
    noise: { type: 'white', level: 0 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1, envAmount: 0, keyTrack: 0 },
    ampEnv: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.6 },
    modEnv: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4 },
    voice: { mode: 'poly', glide: 0, unison: 1, detune: 12, spread: 0.5 },
    random: { rate: 4, sync: false, division: '8n' },
    lfos: [],
    modRoutes: [],
}

export function createLFO(id: string): LFOState {
    return { id, waveform: 'sine', rate: 1, sync: false, division: '8n', perVoice: false, running: true }
}

export function createRoute(id: string): ModRoute {
    return { id, source: 'modEnv', destination: 'filter.detune', depth: 0 }
}

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

function coerceOsc(raw: unknown, base: OscState): OscState {
    const r = isRecord(raw) ? raw : {}
    return {
        mode: pick(r.mode, OSC_MODES, base.mode),
        wave: pick(r.wave, WAVES, base.wave),
        level: num(r.level, base.level, OSC_RANGES.level),
        octave: num(r.octave, base.octave, OSC_RANGES.octave, true),
        semi: num(r.semi, base.semi, OSC_RANGES.semi, true),
        fine: num(r.fine, base.fine, OSC_RANGES.fine),
        width: num(r.width, base.width, OSC_RANGES.width),
        count: num(r.count, base.count, OSC_RANGES.count, true),
        spread: num(r.spread, base.spread, OSC_RANGES.spread),
        harmonicity: num(r.harmonicity, base.harmonicity, OSC_RANGES.harmonicity),
        modulationIndex: num(r.modulationIndex, base.modulationIndex, OSC_RANGES.modulationIndex),
    }
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

/**
 * Turn arbitrary parsed JSON into a valid PatchState.
 *
 * Preset files are user-editable and travel between machines, so anything
 * missing, mistyped or out of range falls back to the default rather than
 * reaching a Tone node — several of which throw on a bad value rather than
 * ignoring it. Never throws.
 */
export function coercePatch(raw: unknown): PatchState {
    if (!isRecord(raw)) return structuredClone(DEFAULT_PATCH)
    const d = DEFAULT_PATCH

    const rawSub = isRecord(raw.sub) ? raw.sub : {}
    const rawNoise = isRecord(raw.noise) ? raw.noise : {}
    const rawFilter = isRecord(raw.filter) ? raw.filter : {}
    const rawVoice = isRecord(raw.voice) ? raw.voice : {}
    const rawRandom = isRecord(raw.random) ? raw.random : {}

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
            waveform: pick(entry.waveform, WAVES, base.waveform),
            rate: num(entry.rate, base.rate, LFO_RATE),
            sync: bool(entry.sync, base.sync),
            division: pick(entry.division, DIVISIONS, base.division),
            perVoice: bool(entry.perVoice, base.perVoice),
            running: bool(entry.running, base.running),
        }
    })

    const routeIds = new Set<string>()
    const rawRoutes = Array.isArray(raw.modRoutes) ? raw.modRoutes : []
    const lfoIds = new Set(lfos.map(l => l.id))
    const modRoutes: ModRoute[] = rawRoutes.filter(isRecord).map((entry, i) => {
        const base = createRoute(`route-${i}`)
        let id = str(entry.id, base.id)
        while (routeIds.has(id)) id = `${id}-dup`
        routeIds.add(id)
        const source = str(entry.source, base.source)
        // Drop routes whose source no longer exists — a deleted LFO, or a
        // hand-edited file — rather than leaving a row that points nowhere.
        const sourceOk = source.startsWith('lfo:')
            ? lfoIds.has(source.slice(4))
            : (MOD_SOURCE_IDS as readonly string[]).includes(source)
        return {
            id,
            source: sourceOk ? source : base.source,
            destination: str(entry.destination, base.destination) in MOD_DESTINATIONS
                ? str(entry.destination, base.destination)
                : base.destination,
            depth: num(entry.depth, base.depth, MOD_DEPTH),
        }
    })

    return {
        version: PATCH_VERSION,
        name: str(raw.name, d.name),
        oscA: coerceOsc(raw.oscA, d.oscA),
        oscB: coerceOsc(raw.oscB, d.oscB),
        sub: {
            wave: pick(rawSub.wave, WAVES, d.sub.wave),
            octave: num(rawSub.octave, d.sub.octave, SUB_RANGES.octave, true),
            level: num(rawSub.level, d.sub.level, SUB_RANGES.level),
        },
        noise: {
            type: pick(rawNoise.type, NOISE_TYPES, d.noise.type),
            level: num(rawNoise.level, d.noise.level, NOISE_RANGES.level),
        },
        filter: {
            type: pick(rawFilter.type, FILTER_TYPES, d.filter.type),
            cutoff: num(rawFilter.cutoff, d.filter.cutoff, FILTER_RANGES.cutoff),
            resonance: num(rawFilter.resonance, d.filter.resonance, FILTER_RANGES.resonance),
            envAmount: num(rawFilter.envAmount, d.filter.envAmount, FILTER_RANGES.envAmount),
            keyTrack: num(rawFilter.keyTrack, d.filter.keyTrack, FILTER_RANGES.keyTrack),
        },
        ampEnv: coerceEnv(raw.ampEnv, d.ampEnv),
        modEnv: coerceEnv(raw.modEnv, d.modEnv),
        voice: {
            mode: pick(rawVoice.mode, VOICE_MODES, d.voice.mode),
            glide: num(rawVoice.glide, d.voice.glide, VOICE_RANGES.glide),
            unison: num(rawVoice.unison, d.voice.unison, VOICE_RANGES.unison, true),
            detune: num(rawVoice.detune, d.voice.detune, VOICE_RANGES.detune),
            spread: num(rawVoice.spread, d.voice.spread, VOICE_RANGES.spread),
        },
        random: {
            rate: num(rawRandom.rate, d.random.rate, LFO_RATE),
            sync: bool(rawRandom.sync, d.random.sync),
            division: pick(rawRandom.division, DIVISIONS, d.random.division),
        },
        lfos,
        modRoutes,
    }
}
