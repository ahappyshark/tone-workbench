/**
 * The serialisable shape of a whole patch.
 *
 * Everything a preset needs to restore lives in here — nothing about the
 * patch may live in component state, or it won't survive a save/load.
 */

export const PATCH_VERSION = 5

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

/**
 * Which held key wins in mono/legato when several are down. They sound
 * genuinely different under a trill and every mono synth picks one:
 * `last` follows your most recent key, `low` lets a held bass note rule
 * while you play above it, `high` is the mirror of that.
 */
export const NOTE_PRIORITIES = ['last', 'low', 'high'] as const
export type NotePriority = typeof NOTE_PRIORITIES[number]

/**
 * How a modulation source gets its phase.
 *
 * `free` runs continuously off the audio clock, `sync` locks to the transport
 * and only advances while it runs, `key` restarts on every note-on. They are
 * genuinely different musical behaviours, not presentation: a free LFO is
 * wherever it happens to be when you play, a key-triggered one always starts
 * at the same place, so only the second gives a repeatable attack.
 *
 * `key` and `sync` are mutually exclusive by definition — a synced source's
 * phase belongs to the transport, and restarting it is the one thing that
 * would break the lock.
 */
export const TRIGGER_MODES = ['free', 'key', 'sync'] as const
export type TriggerMode = typeof TRIGGER_MODES[number]

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
    /** which held key wins in mono/legato */
    priority: NotePriority
    /** pitch bend wheel range in semitones, either direction */
    bendRange: number
    /**
     * Portamento seconds. Only applies when a sounding voice is re-pitched,
     * which is mono and legato — a fresh note in poly starts at its own pitch
     * rather than sliding up from whatever its recycled voice last played.
     */
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
    /** rate in Hz. Used by `free` and `key`; `sync` uses the division. */
    rate: number
    /**
     * `free` runs continuously, `key` restarts the phase on every note-on,
     * `sync` locks the rate to transport tempo and only advances while the
     * transport runs — that's what locking to it means.
     */
    trigger: TriggerMode
    division: Division
    /**
     * One LFO per voice, so each note drifts independently. Off means a single
     * shared LFO and every note moves in lockstep.
     *
     * Orthogonal to `trigger`: per-voice decides how many LFOs there are, the
     * trigger decides where their phase comes from. Per-voice + key is the
     * combination that makes each note's wobble start from the same place as
     * every other note's.
     */
    perVoice: boolean
    running: boolean
}

/**
 * Stepped random / sample-and-hold. One global source.
 *
 * `key` here means a fresh value per note-on rather than on a clock, which is
 * the version you want for per-note variation that doesn't drift mid-note.
 */
export interface RandomState {
    rate: number
    trigger: TriggerMode
    division: Division
}

/**
 * The mod envelope, plus how it repeats.
 *
 * `key` is an ordinary envelope: one shot per note-on. `free` and `sync`
 * additionally re-trigger the attack on a clock while the note is held, which
 * turns the envelope into a looping shape — an LFO whose waveform you drew
 * with the ADSR knobs. Note-on still fires the attack in every mode, so a
 * looping envelope starts with the note rather than wherever the loop was.
 */
export interface ModEnvState extends EnvState {
    trigger: TriggerMode
    /** loop rate in Hz when trigger is `free` */
    rate: number
    /** loop division when trigger is `sync` */
    division: Division
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export const FX_TYPES = ['drive', 'chorus', 'delay', 'reverb'] as const
export type FxType = typeof FX_TYPES[number]

export const FX_LABELS: Record<FxType, string> = {
    drive: 'Drive',
    chorus: 'Chorus',
    delay: 'Delay',
    reverb: 'Reverb',
}

/**
 * Every effect's parameters in one flat record, the same trick `OscState`
 * uses: the patch stores them all whatever the slot's current type is, so
 * switching a slot to delay and back doesn't forget the chorus settings.
 * `FX_TYPE_PARAMS` says which ones are live.
 */
export interface FxParams {
    /** drive: waveshaper amount */
    drive: number
    /** chorus: LFO rate in Hz */
    rate: number
    /** chorus: LFO depth */
    depth: number
    /** chorus: stereo spread in degrees */
    spread: number
    /** delay: time in seconds */
    time: number
    /** chorus and delay: feedback */
    feedback: number
    /** reverb: tail length in seconds */
    decay: number
    /** reverb: seconds before the tail starts */
    preDelay: number
}

export interface FxSlot {
    id: string
    type: FxType
    /** a bypassed slot keeps its node and its settings, but leaves the chain */
    enabled: boolean
    wet: number
    params: FxParams
}

export const FX_RANGES = {
    wet: { min: 0, max: 1 },
    drive: { min: 0, max: 1 },
    rate: { min: 0.05, max: 10 },
    depth: { min: 0, max: 1 },
    spread: { min: 0, max: 180 },
    time: { min: 0.005, max: 2 },
    // 1.0 is a feedback loop that never decays; leave headroom below it.
    feedback: { min: 0, max: 0.95 },
    decay: { min: 0.1, max: 20 },
    preDelay: { min: 0, max: 0.5 },
} as const

/** Which knobs each effect actually has, in the order they should appear. */
export const FX_TYPE_PARAMS: Record<FxType, readonly (keyof FxParams)[]> = {
    drive: ['drive'],
    chorus: ['rate', 'depth', 'spread', 'feedback'],
    delay: ['time', 'feedback'],
    reverb: ['decay', 'preDelay'],
}

export const FX_PARAM_LABELS: Record<keyof FxParams | 'wet', string> = {
    wet: 'Wet',
    drive: 'Drive',
    rate: 'Rate',
    depth: 'Depth',
    spread: 'Spread',
    time: 'Time',
    feedback: 'Feedback',
    decay: 'Decay',
    preDelay: 'Pre-Dly',
}

/**
 * Which effect params can accept modulation, and what depth 1.0 means there.
 *
 * The rest are plain setters rather than audio-rate params, and they are not
 * cheap: `distortion` rebuilds a waveshaper curve and `decay` re-renders an
 * impulse response offline. Neither can follow an LFO, so neither is offered
 * as a destination — that's a property of the effect, not a missing feature.
 */
export const FX_MOD_PARAMS: Record<FxType, readonly (keyof FxParams | 'wet')[]> = {
    drive: ['wet'],
    chorus: ['wet', 'rate', 'feedback'],
    delay: ['wet', 'time', 'feedback'],
    reverb: ['wet'],
}

const FX_MOD_SCALE: Record<string, { scale: number, unit: string }> = {
    wet: { scale: 1, unit: '' },
    rate: { scale: 10, unit: 'Hz' },
    feedback: { scale: 1, unit: '' },
    time: { scale: 0.5, unit: 's' },
}

/** The destination id for one param of one effect slot. */
export function fxDestinationId(slotId: string, param: string): string {
    return `fx:${slotId}:${param}`
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
export interface ModDestinationMeta {
    label: string
    scale: number
    unit: string
    /**
     * Lives on the shared effects bus rather than inside a voice, so it can
     * only be fed by a source there is exactly one of. See `modDestinations`.
     */
    global?: boolean
}

export const MOD_DESTINATIONS: Record<string, ModDestinationMeta> = {
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

/**
 * Every destination available in the current patch: the fixed per-voice set
 * above, plus one entry per modulatable param of each effect slot.
 *
 * Effects are global — one chain, after the voices are summed — so their
 * params are marked `global`. A per-voice source can't reach them: there are
 * sixteen mod envelopes and one delay time, and no honest answer to which
 * envelope wins. `isRouteLive` is what the UI uses to say so out loud rather
 * than letting such a route sit there doing nothing.
 */
export function modDestinations(fx: FxSlot[]): Record<string, ModDestinationMeta> {
    return { ...MOD_DESTINATIONS, ...fxDestinations(fx) }
}

/**
 * Just the effect-slot half, with no instrument-specific destinations mixed
 * in. Split out because the grain instrument has an entirely different set of
 * its own but the identical effects chain — see `grainDestinations`.
 */
export function fxDestinations(fx: FxSlot[]): Record<string, ModDestinationMeta> {
    const all: Record<string, ModDestinationMeta> = {}
    fx.forEach((slot, i) => {
        for (const param of FX_MOD_PARAMS[slot.type]) {
            const scale = FX_MOD_SCALE[param] ?? { scale: 1, unit: '' }
            all[fxDestinationId(slot.id, param)] = {
                label: `FX ${i + 1} ${FX_LABELS[slot.type]} · ${FX_PARAM_LABELS[param]}`,
                scale: scale.scale,
                unit: scale.unit,
                global: true,
            }
        }
    })
    return all
}

/** True when a source is the only one of its kind, so a global param can use it. */
export function isGlobalSource(sourceId: string, lfos: LFOState[]): boolean {
    if (sourceId.startsWith('lfo:')) {
        const lfo = lfos.find(l => l.id === sourceId.slice(4))
        return lfo ? !lfo.perVoice : false
    }
    const meta = MOD_SOURCE_META[sourceId as FixedModSource]
    return meta ? !meta.perVoice : false
}

/**
 * Whether a route will actually do anything. The one way to write a dead
 * route is aiming a per-voice source at a global effect param.
 */
export function isRouteLive(route: ModRoute, fx: FxSlot[], lfos: LFOState[]): boolean {
    const meta = modDestinations(fx)[route.destination]
    if (!meta) return false
    return meta.global ? isGlobalSource(route.source, lfos) : true
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
    modEnv: ModEnvState
    voice: VoiceState
    random: RandomState
    lfos: LFOState[]
    /** the effects chain, in signal order — index 0 is nearest the voices */
    fx: FxSlot[]
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
    bendRange: { min: 0, max: 24 },
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
    modEnv: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4, trigger: 'key', rate: 1, division: '4n' },
    voice: { mode: 'poly', priority: 'last', bendRange: 2, glide: 0, unison: 1, detune: 12, spread: 0.5 },
    random: { rate: 4, trigger: 'free', division: '8n' },
    lfos: [],
    fx: [],
    modRoutes: [],
}

export function createLFO(id: string): LFOState {
    return { id, waveform: 'sine', rate: 1, trigger: 'free', division: '8n', perVoice: false, running: true }
}

export function defaultFxParams(): FxParams {
    return {
        drive: 0.4,
        rate: 1.5,
        depth: 0.6,
        spread: 180,
        time: 0.25,
        feedback: 0.35,
        decay: 3,
        preDelay: 0.02,
    }
}

export function createFx(id: string, type: FxType = 'reverb'): FxSlot {
    return { id, type, enabled: true, wet: 0.3, params: defaultFxParams() }
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
 * Trigger mode, tolerating the `sync: boolean` that versions 2–4 wrote. That
 * flag only ever distinguished free from sync, so an old preset can never
 * mean `key` and the mapping is lossless.
 */
function coerceTrigger(r: Record<string, unknown>, base: TriggerMode): TriggerMode {
    if (typeof r.trigger === 'string') return pick(r.trigger, TRIGGER_MODES, base)
    if (typeof r.sync === 'boolean') return r.sync ? 'sync' : 'free'
    return base
}

export function coerceFxParams(raw: unknown): FxParams {
    const r = isRecord(raw) ? raw : {}
    const base = defaultFxParams()
    const keys = Object.keys(base) as (keyof FxParams)[]
    const out = {} as FxParams
    for (const key of keys) out[key] = num(r[key], base[key], FX_RANGES[key])
    return out
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
            trigger: coerceTrigger(entry, base.trigger),
            division: pick(entry.division, DIVISIONS, base.division),
            perVoice: bool(entry.perVoice, base.perVoice),
            running: bool(entry.running, base.running),
        }
    })

    const fxIds = new Set<string>()
    const rawFx = Array.isArray(raw.fx) ? raw.fx : []
    const fx: FxSlot[] = rawFx.filter(isRecord).map((entry, i) => {
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
    // Destinations depend on which slots exist, so the chain has to be settled
    // before routes can be checked against it.
    const destinations = modDestinations(fx)

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
            // A route pointing at an effect slot that isn't in this patch has
            // nowhere to land, so it falls back rather than silently persisting.
            destination: str(entry.destination, base.destination) in destinations
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
        modEnv: {
            ...coerceEnv(raw.modEnv, d.modEnv),
            trigger: coerceTrigger(isRecord(raw.modEnv) ? raw.modEnv : {}, d.modEnv.trigger),
            rate: num(isRecord(raw.modEnv) ? raw.modEnv.rate : undefined, d.modEnv.rate, LFO_RATE),
            division: pick(isRecord(raw.modEnv) ? raw.modEnv.division : undefined, DIVISIONS, d.modEnv.division),
        },
        voice: {
            mode: pick(rawVoice.mode, VOICE_MODES, d.voice.mode),
            priority: pick(rawVoice.priority, NOTE_PRIORITIES, d.voice.priority),
            bendRange: num(rawVoice.bendRange, d.voice.bendRange, VOICE_RANGES.bendRange, true),
            glide: num(rawVoice.glide, d.voice.glide, VOICE_RANGES.glide),
            unison: num(rawVoice.unison, d.voice.unison, VOICE_RANGES.unison, true),
            detune: num(rawVoice.detune, d.voice.detune, VOICE_RANGES.detune),
            spread: num(rawVoice.spread, d.voice.spread, VOICE_RANGES.spread),
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
