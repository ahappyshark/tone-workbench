import * as Tone from 'tone'
import {
    DEFAULT_GRAIN_PATCH,
    GRAIN_DESTINATIONS,
    GRAIN_RANGES,
    type GrainState,
} from './grainTypes'
import type { EnvState, FilterState } from './patchTypes'

/**
 * One grain cloud.
 *
 *   grains ─▶ pan fan ─▶ cloud ─▶ filter ─▶ amp ─▶ pan ─▶ out
 *                                    ▲        ▲
 *                                 mod env  amp env
 *
 * The pool, the stealing rules and the base-signal discipline are all
 * deliberately the same as `Voice`, so the two instruments can't grow
 * different answers to the same problems. What's different is above the
 * filter: instead of four oscillators running continuously, a scheduler fires
 * short one-shot buffer reads and throws them away.
 */

/**
 * Fixed stereo positions the grains are shared between.
 *
 * A panner per grain would mean a node built and torn down for every one of
 * them, which at high density is most of the CPU cost. Nine positions is far
 * finer than anyone can hear in a cloud of overlapping grains.
 */
const PAN_POSITIONS = 9

/**
 * Concurrent grains one voice will allow.
 *
 * Density times size is the overlap count, and both are modulatable, so a
 * badly aimed route can otherwise ask for hundreds at once and take the audio
 * thread with it. Dropping grains past the cap degrades the texture; not
 * having a cap degrades everything.
 */
const MAX_GRAINS = 48

/**
 * The window never goes fully hard at either end. A grain with a zero-length
 * fade is a rectangular window, which is a click with a sample inside it.
 */
const MIN_FADE = 0.08

export interface GrainSample {
    forward: Tone.ToneAudioBuffer
    reversed: Tone.ToneAudioBuffer
    duration: number
}

/** A grain-rate route, already resolved to its destination's scale. */
interface GrainRoute {
    source: string
    destination: string
    amount: number
}

export class GrainVoice {
    readonly output: Tone.Gain

    private readonly panFan: Tone.Panner[]
    private readonly cloud: Tone.Gain
    private readonly filter: Tone.Filter
    private readonly amp: Tone.AmplitudeEnvelope
    private readonly panner: Tone.Panner
    private readonly modEnv: Tone.Envelope
    private readonly envAmount: Tone.Gain

    /** Base signals for params that also receive modulation. See `Voice`. */
    private readonly qBase: Tone.Signal<'number'>
    private readonly panBase: Tone.Signal<'number'>

    /** Per-voice sources, as audio nodes for the audio-rate regime. */
    private readonly velocitySignal: Tone.Signal<'number'>
    private readonly keyTrackSignal: Tone.Signal<'number'>

    /** routeId -> the depth gain wiring one source into one audio param */
    private readonly audioRoutes = new Map<string, {
        gain: Tone.Gain
        source: Tone.ToneAudioNode
        destination: string
    }>()
    /** routeId -> a route resolved in JavaScript when a grain is born */
    private readonly grainRoutes = new Map<string, GrainRoute>()

    note: number | null = null
    startedAt = 0
    releasing = false
    releaseEndsAt = 0

    private state: GrainState = DEFAULT_GRAIN_PATCH.grain
    private stateFilter: FilterState = DEFAULT_GRAIN_PATCH.filter
    private releaseSeconds = DEFAULT_GRAIN_PATCH.ampEnv.release
    private velocity = 0
    private sample: GrainSample | null = null
    private bendCents = 0

    /**
     * How far the scan head has drifted from `position` since the note began,
     * in buffer seconds. Reset on note-on, so a note always starts where the
     * knob points rather than wherever the last one wandered to.
     */
    private drift = 0
    /** context time the next grain is due — carried across scheduler ticks */
    private nextGrainAt = 0
    private liveGrains = 0
    private nextPan = 0

    constructor() {
        this.cloud = new Tone.Gain(1)
        this.panFan = Array.from({ length: PAN_POSITIONS }, (_, i) => {
            const pan = new Tone.Panner((i / (PAN_POSITIONS - 1)) * 2 - 1)
            pan.connect(this.cloud)
            return pan
        })

        this.filter = new Tone.Filter({ frequency: 8000, type: 'lowpass' })
        this.amp = new Tone.AmplitudeEnvelope(DEFAULT_GRAIN_PATCH.ampEnv)
        this.modEnv = new Tone.Envelope(DEFAULT_GRAIN_PATCH.modEnv)
        this.envAmount = new Tone.Gain(0)
        this.panner = new Tone.Panner(0)
        this.output = new Tone.Gain(1)

        this.qBase = new Tone.Signal(DEFAULT_GRAIN_PATCH.filter.resonance)
        this.panBase = new Tone.Signal(0)
        this.qBase.connect(this.filter.Q)
        this.panBase.connect(this.panner.pan)

        this.velocitySignal = new Tone.Signal(0)
        this.keyTrackSignal = new Tone.Signal(0)

        this.cloud.chain(this.filter, this.amp, this.panner, this.output)
        this.modEnv.connect(this.envAmount)
        this.envAmount.connect(this.filter.detune)
    }

    /* -------------------------------------------------------------- */
    /* Patch application                                               */
    /* -------------------------------------------------------------- */

    setGrain(state: GrainState) {
        this.state = state
    }

    setSample(sample: GrainSample | null) {
        this.sample = sample
    }

    setFilter(state: FilterState) {
        this.stateFilter = state
        this.filter.type = state.type
        this.qBase.value = state.resonance
        this.envAmount.gain.value = state.envAmount
        this.applyCutoff()
    }

    setAmpEnv(state: EnvState) {
        this.amp.set(state)
        this.releaseSeconds = state.release
    }

    setModEnv(state: EnvState) {
        this.modEnv.set(state)
    }

    setBend(cents: number) {
        this.bendCents = cents
    }

    /* -------------------------------------------------------------- */
    /* Modulation                                                      */
    /* -------------------------------------------------------------- */

    /** The node behind a per-voice source id, for audio-rate routes. */
    sourceNode(id: string): Tone.ToneAudioNode | null {
        switch (id) {
            case 'modEnv': return this.modEnv
            case 'velocity': return this.velocitySignal
            case 'keyTrack': return this.keyTrackSignal
            default: return null
        }
    }

    setAudioRoute(routeId: string, source: Tone.ToneAudioNode | null, destination: string, amount: number) {
        const target = this.audioParam(destination)
        if (!source || !target) {
            this.clearRoute(routeId)
            return
        }
        this.grainRoutes.delete(routeId)
        const existing = this.audioRoutes.get(routeId)
        if (existing && existing.source === source && existing.destination === destination) {
            existing.gain.gain.value = amount
            return
        }
        this.clearRoute(routeId)
        const gain = new Tone.Gain(amount)
        source.connect(gain)
        gain.connect(target)
        this.audioRoutes.set(routeId, { gain, source, destination })
    }

    /**
     * A route into a param the scheduler reads rather than the audio graph.
     * No nodes at all: the sum is arithmetic done when a grain is born.
     */
    setGrainRoute(routeId: string, source: string, destination: string, amount: number) {
        this.clearAudioRoute(routeId)
        this.grainRoutes.set(routeId, { source, destination, amount })
    }

    clearRoute(routeId: string) {
        this.clearAudioRoute(routeId)
        this.grainRoutes.delete(routeId)
    }

    private clearAudioRoute(routeId: string) {
        const route = this.audioRoutes.get(routeId)
        if (!route) return
        try { route.source.disconnect(route.gain) } catch { /* already gone */ }
        route.gain.dispose()
        this.audioRoutes.delete(routeId)
    }

    routeIds(): string[] {
        return [...this.audioRoutes.keys(), ...this.grainRoutes.keys()]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private audioParam(id: string): Tone.Param<any> | Tone.Signal<any> | null {
        switch (id) {
            case 'filter.detune': return this.filter.detune
            case 'filter.resonance': return this.filter.Q
            case 'amp.pan': return this.panner.pan
            default: return null
        }
    }

    /**
     * One modulation source as a plain number.
     *
     * Per-voice sources are computed here; anything shared arrives already
     * sampled in `globals`, because reading a node's output costs an analyser
     * and there is no point paying for one per voice.
     */
    private sampleSource(id: string, globals: Record<string, number>, time: number): number {
        switch (id) {
            case 'velocity': return this.velocity
            case 'keyTrack': return this.note === null
                ? 0
                : Math.max(-1, Math.min(1, (this.note - 60) / 36))
            case 'modEnv': return this.modEnv.getValueAtTime(time)
            default: return globals[id] ?? 0
        }
    }

    /** A grain param's value right now: the knob, plus every route into it. */
    private resolve(
        destination: string,
        base: number,
        globals: Record<string, number>,
        time: number,
    ): number {
        let value = base
        for (const route of this.grainRoutes.values()) {
            if (route.destination !== destination) continue
            value += this.sampleSource(route.source, globals, time) * route.amount
        }
        return value
    }

    /* -------------------------------------------------------------- */
    /* Playing                                                         */
    /* -------------------------------------------------------------- */

    trigger(note: number, velocity: number, time: number) {
        this.note = note
        this.velocity = velocity
        this.releasing = false
        this.startedAt = time
        this.drift = 0
        // Due immediately, so the cloud starts the instant the key does
        // rather than up to one grain period later.
        this.nextGrainAt = time
        this.velocitySignal.value = velocity
        this.keyTrackSignal.value = Math.max(-1, Math.min(1, (note - 60) / 36))
        this.applyCutoff()
        this.amp.triggerAttack(time, velocity)
        this.modEnv.triggerAttack(time)
    }

    retune(note: number) {
        this.note = note
        this.keyTrackSignal.value = Math.max(-1, Math.min(1, (note - 60) / 36))
        this.applyCutoff()
    }

    retriggerModEnv(time?: number) {
        if (this.note === null || this.releasing) return
        this.modEnv.triggerAttack(time)
    }

    release() {
        if (this.note === null || this.releasing) return
        this.releasing = true
        this.releaseEndsAt = Tone.now() + this.releaseSeconds
        this.amp.triggerRelease()
        this.modEnv.triggerRelease()
    }

    isSpent(now: number): boolean {
        return this.note === null || (this.releasing && now >= this.releaseEndsAt)
    }

    reclaim() {
        this.note = null
        this.releasing = false
        this.releaseEndsAt = 0
    }

    /** Where the scan head is now, 0..1, for the waveform display. */
    headPosition(): number | null {
        if (this.note === null || !this.sample) return null
        const duration = this.sample.duration
        const at = this.state.position * duration + this.drift
        return ((at % duration) + duration) / duration % 1
    }

    /* -------------------------------------------------------------- */
    /* The scheduler's half                                            */
    /* -------------------------------------------------------------- */

    /**
     * Emit every grain due in `[from, to)`.
     *
     * Grains are scheduled with explicit start times rather than fired at the
     * moment the tick runs, so their spacing is sample-accurate even though
     * the scheduler itself only wakes up a few dozen times a second. This is
     * the same lookahead trick Tone uses internally; the difference is that
     * we decide each grain's parameters at its own start time.
     */
    emitGrains(from: number, to: number, globals: Record<string, number>) {
        const sample = this.sample
        if (this.note === null || !sample || sample.duration <= 0) return

        const s = this.state
        // Scan is sampled once per window. It moves the head continuously, so
        // resolving it per grain would make the drift depend on grain rate.
        const scan = this.resolve('grain.scan', s.scan, globals, from)
        this.drift += (to - from) * scan

        if (this.nextGrainAt < from) this.nextGrainAt = from

        while (this.nextGrainAt < to) {
            const time = this.nextGrainAt
            const density = clamp(
                this.resolve('grain.density', s.density, globals, time),
                GRAIN_RANGES.density.min, GRAIN_RANGES.density.max,
            )
            this.nextGrainAt = time + 1 / density
            if (this.liveGrains >= MAX_GRAINS) continue
            this.spawn(time, sample, globals, density)
        }
    }

    private spawn(time: number, sample: GrainSample, globals: Record<string, number>, density: number) {
        const s = this.state

        const size = clamp(
            this.resolve('grain.size', s.size, globals, time),
            GRAIN_RANGES.size.min, GRAIN_RANGES.size.max,
        )
        const spray = clamp(
            this.resolve('grain.spray', s.spray, globals, time),
            0, GRAIN_RANGES.spray.max,
        )
        const shape = clamp(
            this.resolve('grain.shape', s.shape, globals, time), 0, 1,
        )
        const jitter = clamp(
            this.resolve('grain.jitter', s.jitter, globals, time),
            0, GRAIN_RANGES.jitter.max,
        )
        const spread = clamp(
            this.resolve('grain.spread', s.spread, globals, time), 0, 1,
        )
        const reverseOdds = clamp(
            this.resolve('grain.reverse', s.reverse, globals, time), 0, 1,
        )
        const position = this.resolve('grain.position', s.position, globals, time)
        const extraCents = this.resolve('grain.pitch', 0, globals, time)

        // Pitch. keyTrack at zero is the texture-box case: keys trigger
        // clouds but don't transpose them.
        const note = this.note ?? 60
        const semitones = (note - 60) * s.keyTrack + s.octave * 12 + s.semi
        const cents = semitones * 100 + s.fine + extraCents + this.bendCents
            + (Math.random() * 2 - 1) * jitter
        const rate = Math.pow(2, cents / 1200)

        // How much of the buffer this grain consumes. Reading past the end
        // gives silence, so the offset is clamped rather than wrapped here.
        const consumed = Math.min(size * rate, sample.duration)
        const reversed = Math.random() < reverseOdds

        const head = position * sample.duration + this.drift
            + (Math.random() * 2 - 1) * spray
        const span = Math.max(0.001, sample.duration - consumed)
        // Wrap rather than clamp: a head past the end should come round to
        // the start, which is what makes a slow scan loop seamlessly.
        let offset = ((head % span) + span) % span
        // A backwards grain reads the mirrored copy, because Web Audio will
        // not accept a negative playback rate.
        if (reversed) offset = span - offset

        const fadeIn = size * Math.min(1 - MIN_FADE, Math.max(MIN_FADE, shape))
        const fadeOut = size - fadeIn

        // Overlap is density times size. Without this a density sweep is a
        // volume sweep, and a deep one is a limiter test.
        const overlap = Math.max(1, density * size)
        const gain = (0.7 / Math.sqrt(overlap)) * (0.4 + 0.6 * this.velocity)

        const source = new Tone.ToneBufferSource({
            url: reversed ? sample.reversed : sample.forward,
            playbackRate: rate,
            fadeIn,
            fadeOut,
            curve: 'linear',
            onended: () => {
                this.liveGrains--
                source.dispose()
            },
        })
        // Round-robin the fan when spread is wide, dead centre when it isn't.
        const pan = spread <= 0
            ? (PAN_POSITIONS - 1) / 2
            : Math.round(((this.nextPan++ * 0.618 % 1) * 2 - 1) * spread * (PAN_POSITIONS - 1) / 2
                + (PAN_POSITIONS - 1) / 2)
        source.connect(this.panFan[clamp(pan, 0, PAN_POSITIONS - 1)])

        this.liveGrains++
        source.start(time, offset, undefined, gain)
        // Stopping at the end of the fade-in is what makes the window
        // triangular: the fade-out begins immediately and runs for the rest
        // of the grain, so the two halves sum to exactly `size`.
        source.stop(time + fadeIn)
    }

    private applyCutoff() {
        const cents = this.note === null
            ? 0
            : (this.note - 60) * 100 * this.stateFilter.keyTrack
        this.filter.frequency.value = this.stateFilter.cutoff * Math.pow(2, cents / 1200)
    }

    dispose() {
        for (const id of [...this.audioRoutes.keys()]) this.clearAudioRoute(id)
        this.grainRoutes.clear()
        for (const node of [
            ...this.panFan, this.cloud, this.filter, this.amp, this.panner,
            this.modEnv, this.envAmount, this.output, this.qBase, this.panBase,
            this.velocitySignal, this.keyTrackSignal,
        ]) {
            node.dispose()
        }
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** Depth 1.0 in the matrix, in the destination's own units. */
export function grainRouteAmount(destination: string, depth: number): number {
    return depth * (GRAIN_DESTINATIONS[destination]?.scale ?? 1)
}
