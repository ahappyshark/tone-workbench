import * as Tone from 'tone'
import {
    DEFAULT_PATCH,
    MOD_DESTINATIONS,
    OSC_MODE_PARAMS,
    omniType,
    type LFOState,
    type EnvState,
    type FilterState,
    type NoiseState,
    type OscState,
    type SubState,
} from './patchTypes'

/**
 * One voice: a complete, independent signal path.
 *
 *   oscA ─┐
 *   oscB ─┼─▶ filter ─▶ amp ─▶ panner ─▶ out
 *   sub  ─┤      ▲
 *   noise─┘   modEnv (via envAmount, in cents, onto filter.detune)
 *
 * Nodes are built once and never recreated — allocating during playback
 * clicks. Sources run continuously and are gated by the amp envelope, for the
 * same reason.
 *
 * A voice owns a copy of the pitch-relevant patch fields because it has to
 * recompute frequencies whenever octave/semi/glide change *or* a new note
 * arrives, and those two paths must agree.
 */
export class Voice {
    readonly output: Tone.Gain

    private readonly oscA: Tone.OmniOscillator<never>
    private readonly oscB: Tone.OmniOscillator<never>
    private readonly sub: Tone.Oscillator
    private readonly noise: Tone.Noise
    private readonly gainA: Tone.Gain
    private readonly gainB: Tone.Gain
    private readonly gainSub: Tone.Gain
    private readonly gainNoise: Tone.Gain
    private readonly filter: Tone.Filter
    private readonly amp: Tone.AmplitudeEnvelope
    private readonly modEnv: Tone.Envelope
    private readonly envAmount: Tone.Gain
    private readonly panner: Tone.Panner

    /**
     * Base values for params that also receive modulation.
     *
     * Connecting anything to a Tone Param cancels its value, zeroes it and
     * marks it `overridden` — after which writing `.value` silently does
     * nothing. So a knob may not write such a param directly. Instead a
     * dedicated signal supplies the base and the modulation sums on top; the
     * base signal has no inputs of its own, so writing it works.
     */
    private readonly qBase: Tone.Signal<'number'>
    private readonly levelBaseA: Tone.Signal<'number'>
    private readonly levelBaseB: Tone.Signal<'number'>
    private readonly levelBaseSub: Tone.Signal<'number'>
    private readonly levelBaseNoise: Tone.Signal<'number'>
    private readonly panBase: Tone.Signal<'number'>

    /** Per-voice modulation sources, held at a constant while a note sounds. */
    private readonly velocitySignal: Tone.Signal<'number'>
    private readonly keyTrackSignal: Tone.Signal<'number'>
    /** Per-voice LFO instances, keyed by LFO id. Only for perVoice LFOs. */
    private readonly lfos = new Map<string, Tone.LFO>()
    /** routeId -> the depth gain wiring one source into one destination */
    private readonly routes = new Map<string, {
        gain: Tone.Gain
        source: Tone.ToneAudioNode
        destination: string
    }>()

    /** null when idle. Set on trigger, cleared on reclaim. */
    note: number | null = null
    /** context time of the last trigger, for oldest-first stealing */
    startedAt = 0
    /** released but still ringing out — reclaimable before a held voice */
    releasing = false
    /**
     * Context time at which the release tail finishes. Without this a voice
     * never returns to the free pool, so once the pool has been cycled every
     * new note steals and chops off someone's release.
     */
    releaseEndsAt = 0

    private stateA: OscState = DEFAULT_PATCH.oscA
    private stateB: OscState = DEFAULT_PATCH.oscB
    private stateSub: SubState = DEFAULT_PATCH.sub
    private stateFilter: FilterState = DEFAULT_PATCH.filter
    private unisonDetune = 0
    private glide = 0
    private releaseSeconds = DEFAULT_PATCH.ampEnv.release

    constructor() {
        this.oscA = new Tone.OmniOscillator({ type: 'sawtooth' }) as Tone.OmniOscillator<never>
        this.oscB = new Tone.OmniOscillator({ type: 'sawtooth' }) as Tone.OmniOscillator<never>
        this.sub = new Tone.Oscillator({ type: 'square' })
        this.noise = new Tone.Noise({ type: 'white' })

        this.gainA = new Tone.Gain(0.8)
        this.gainB = new Tone.Gain(0.5)
        this.gainSub = new Tone.Gain(0)
        this.gainNoise = new Tone.Gain(0)

        this.filter = new Tone.Filter({ frequency: 4000, type: 'lowpass' })
        this.amp = new Tone.AmplitudeEnvelope(DEFAULT_PATCH.ampEnv)
        this.modEnv = new Tone.Envelope(DEFAULT_PATCH.modEnv)
        // Envelope outputs 0..1; this gain scales it into cents. Signed, so a
        // negative envAmount sweeps the filter downward.
        this.envAmount = new Tone.Gain(0)
        this.panner = new Tone.Panner(0)
        this.output = new Tone.Gain(1)
        this.velocitySignal = new Tone.Signal(0)
        this.keyTrackSignal = new Tone.Signal(0)

        this.qBase = new Tone.Signal(DEFAULT_PATCH.filter.resonance)
        this.levelBaseA = new Tone.Signal(DEFAULT_PATCH.oscA.level)
        this.levelBaseB = new Tone.Signal(DEFAULT_PATCH.oscB.level)
        this.levelBaseSub = new Tone.Signal(DEFAULT_PATCH.sub.level)
        this.levelBaseNoise = new Tone.Signal(DEFAULT_PATCH.noise.level)
        this.panBase = new Tone.Signal(0)
        this.qBase.connect(this.filter.Q)
        this.levelBaseA.connect(this.gainA.gain)
        this.levelBaseB.connect(this.gainB.gain)
        this.levelBaseSub.connect(this.gainSub.gain)
        this.levelBaseNoise.connect(this.gainNoise.gain)
        this.panBase.connect(this.panner.pan)

        this.oscA.connect(this.gainA)
        this.oscB.connect(this.gainB)
        this.sub.connect(this.gainSub)
        this.noise.connect(this.gainNoise)
        for (const g of [this.gainA, this.gainB, this.gainSub, this.gainNoise]) {
            g.connect(this.filter)
        }
        this.filter.chain(this.amp, this.panner, this.output)

        // Both key tracking and the mod envelope land on detune (cents, so
        // exponential) rather than frequency (linear Hz). Web Audio sums them.
        this.modEnv.connect(this.envAmount)
        this.envAmount.connect(this.filter.detune)

        this.oscA.start()
        this.oscB.start()
        this.sub.start()
        this.noise.start()
    }

    /* -------------------------------------------------------------- */
    /* Patch application                                               */
    /* -------------------------------------------------------------- */

    setOsc(which: 'a' | 'b', state: OscState) {
        const osc = which === 'a' ? this.oscA : this.oscB
        if (which === 'a') this.stateA = state
        else this.stateB = state

        const wanted = omniType(state)
        if (osc.type !== wanted) osc.type = wanted as never

        // Only params valid for the current type — OmniOscillator throws on
        // the rest rather than ignoring them.
        const live = OSC_MODE_PARAMS[state.mode]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyOsc = osc as any
        for (const key of live) {
            const value = state[key]
            const current = anyOsc[key]
            if (current && typeof current === 'object' && 'value' in current) {
                current.value = value
            } else {
                anyOsc[key] = value
            }
        }

        ;(which === 'a' ? this.levelBaseA : this.levelBaseB).value = state.level
        this.applyPitch()
    }

    setSub(state: SubState) {
        this.stateSub = state
        this.sub.type = state.wave
        this.levelBaseSub.value = state.level
        this.applyPitch()
    }

    setNoise(state: NoiseState) {
        this.noise.type = state.type
        this.levelBaseNoise.value = state.level
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

    setGlide(seconds: number) {
        this.glide = seconds
    }

    /** Position within a unison group: detune in cents, pan in -1..1. */
    setUnison(detuneCents: number, pan: number) {
        this.unisonDetune = detuneCents
        this.panBase.value = pan
        this.applyPitch()
    }

    /* -------------------------------------------------------------- */
    /* Modulation                                                      */
    /* -------------------------------------------------------------- */

    /** The node behind a per-voice source id, or null if this voice has none. */
    sourceNode(id: string): Tone.ToneAudioNode | null {
        if (id.startsWith('lfo:')) return this.lfos.get(id.slice(4)) ?? null
        switch (id) {
            case 'modEnv': return this.modEnv
            case 'velocity': return this.velocitySignal
            case 'keyTrack': return this.keyTrackSignal
            default: return null
        }
    }

    /**
     * Sum a shared bend signal (in cents) into this voice's pitch. It stacks
     * with `fine` and unison offsets, which are set as the params' own values.
     */
    connectPitchBend(bend: Tone.Signal<'cents'>) {
        bend.connect(this.oscA.detune)
        bend.connect(this.oscB.detune)
        bend.connect(this.sub.detune)
    }

    /** Create or update this voice's private copy of a per-voice LFO. */
    syncLFO(state: LFOState) {
        let lfo = this.lfos.get(state.id)
        if (!lfo) {
            // -1..1 so every source reaches the matrix on the same scale.
            lfo = new Tone.LFO({ min: -1, max: 1 })
            this.lfos.set(state.id, lfo)
        }
        applyLFOSettings(lfo, state)
    }

    dropLFO(id: string) {
        const lfo = this.lfos.get(id)
        if (!lfo) return
        lfo.dispose()
        this.lfos.delete(id)
    }

    lfoIds(): string[] {
        return [...this.lfos.keys()]
    }

    /**
     * Wire one route. Reuses the existing gain when only depth changed, so
     * dragging a depth knob doesn't churn audio nodes.
     */
    setRoute(routeId: string, source: Tone.ToneAudioNode | null, destination: string, depth: number) {
        const meta = MOD_DESTINATIONS[destination]
        const target = this.destinationParam(destination)
        if (!source || !meta || !target) {
            this.clearRoute(routeId)
            return
        }
        const existing = this.routes.get(routeId)
        if (existing && existing.source === source && existing.destination === destination) {
            existing.gain.gain.value = depth * meta.scale
            return
        }
        this.clearRoute(routeId)
        const gain = new Tone.Gain(depth * meta.scale)
        source.connect(gain)
        gain.connect(target)
        this.routes.set(routeId, { gain, source, destination })
    }

    clearRoute(routeId: string) {
        const route = this.routes.get(routeId)
        if (!route) return
        try { route.source.disconnect(route.gain) } catch { /* already gone */ }
        route.gain.dispose()
        this.routes.delete(routeId)
    }

    routeIds(): string[] {
        return [...this.routes.keys()]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private destinationParam(id: string): Tone.Param<any> | Tone.Signal<any> | null {
        switch (id) {
            case 'filter.detune': return this.filter.detune
            case 'filter.resonance': return this.filter.Q
            case 'oscA.detune': return this.oscA.detune
            case 'oscB.detune': return this.oscB.detune
            case 'oscA.level': return this.gainA.gain
            case 'oscB.level': return this.gainB.gain
            case 'sub.level': return this.gainSub.gain
            case 'noise.level': return this.gainNoise.gain
            case 'amp.pan': return this.panner.pan
            default: return null
        }
    }

    /* -------------------------------------------------------------- */
    /* Playing                                                         */
    /* -------------------------------------------------------------- */

    /**
     * @param retrigger false re-pitches without restarting the envelopes,
     *   which is what legato mode means.
     */
    trigger(note: number, velocity: number, retrigger = true, glide = false) {
        this.note = note
        this.releasing = false
        this.startedAt = Tone.now()
        this.applyPitch(glide)
        this.applyCutoff()
        this.velocitySignal.value = velocity
        // -1..1 across the playable range, centred on middle C.
        this.keyTrackSignal.value = Math.max(-1, Math.min(1, (note - 60) / 36))
        if (retrigger) {
            this.amp.triggerAttack(undefined, velocity)
            this.modEnv.triggerAttack()
            // Restarting each voice's own LFOs is what makes notes drift
            // independently rather than moving in lockstep.
            for (const lfo of this.lfos.values()) {
                lfo.stop()
                lfo.start()
            }
        }
    }

    /** Re-pitch a sounding voice without touching its envelopes. */
    retune(note: number, glide = true) {
        this.note = note
        this.applyPitch(glide)
        this.applyCutoff()
    }

    release() {
        if (this.note === null || this.releasing) return
        this.releasing = true
        this.releaseEndsAt = Tone.now() + this.releaseSeconds
        this.amp.triggerRelease()
        this.modEnv.triggerRelease()
    }

    /** True once the release tail has run out and the voice is reusable. */
    isSpent(now: number): boolean {
        return this.note === null || (this.releasing && now >= this.releaseEndsAt)
    }

    /** Free immediately for reuse. Envelopes keep ringing into the steal. */
    reclaim() {
        this.note = null
        this.releasing = false
        this.releaseEndsAt = 0
    }

    /* -------------------------------------------------------------- */

    /**
     * @param glide slide from the current pitch rather than jumping. Only ever
     *   true when a *sounding* voice is re-pitched; a fresh note must land on
     *   its own pitch, or in poly it would swoop up from whatever the recycled
     *   voice last played.
     */
    private applyPitch(glide = false) {
        if (this.note === null) return
        const slide = glide && this.glide > 0
        // Fine tuning and unison detune go into the frequency itself rather
        // than the detune param, because detune is a modulation destination
        // (pitch bend, mod routes) and a connected param can't be written.
        const set = (signal: Tone.Signal<'frequency'>, midi: number, cents: number) => {
            const hz = Tone.Frequency(midi, 'midi').toFrequency() * Math.pow(2, cents / 1200)
            if (slide) signal.exponentialRampTo(hz, this.glide)
            else signal.value = hz
        }
        set(this.oscA.frequency, this.note + this.stateA.octave * 12 + this.stateA.semi,
            this.stateA.fine + this.unisonDetune)
        set(this.oscB.frequency, this.note + this.stateB.octave * 12 + this.stateB.semi,
            this.stateB.fine + this.unisonDetune)
        set(this.sub.frequency, this.note - this.stateSub.octave * 12, this.unisonDetune)
    }

    /**
     * Cutoff, with key tracking folded in as a frequency multiplier.
     *
     * Key tracking used to be written to `filter.detune`, which the mod
     * envelope connects to in the constructor — so it was overridden from
     * birth and the Key Trk knob never did anything. `filter.frequency` takes
     * no connections, so it can be written.
     */
    private applyCutoff() {
        const cents = this.note === null
            ? 0
            : (this.note - 60) * 100 * this.stateFilter.keyTrack
        this.filter.frequency.value = this.stateFilter.cutoff * Math.pow(2, cents / 1200)
    }

    dispose() {
        for (const id of [...this.routes.keys()]) this.clearRoute(id)
        for (const lfo of this.lfos.values()) lfo.dispose()
        this.lfos.clear()
        for (const node of [
            this.oscA, this.oscB, this.sub, this.noise,
            this.gainA, this.gainB, this.gainSub, this.gainNoise,
            this.filter, this.amp, this.modEnv, this.envAmount,
            this.panner, this.output, this.velocitySignal, this.keyTrackSignal,
            this.qBase, this.levelBaseA, this.levelBaseB, this.levelBaseSub,
            this.levelBaseNoise, this.panBase,
        ]) {
            node.dispose()
        }
    }

}

/** Shared by per-voice and global LFO instances so they can't drift apart. */
export function applyLFOSettings(lfo: Tone.LFO, state: LFOState) {
    // Reset to a known state first: sync() and unsync() rewire the frequency
    // signal, and start/stop mean different things on each side of that.
    lfo.stop()
    lfo.unsync()
    lfo.type = state.waveform

    if (state.sync) {
        // Order matters. sync() captures the frequency signal's *current*
        // value as its ratio against the transport's bpm, so the division has
        // to be set first — assigning it afterwards overwrites the synced
        // connection and the rate stops following tempo.
        lfo.frequency.value = state.division
        lfo.sync()
        // A synced source is scheduled on the transport timeline, so it needs
        // a transport position, not "now". It then runs only while the
        // transport does.
        if (state.running) lfo.start(0)
    } else {
        lfo.frequency.value = state.rate
        if (state.running) lfo.start()
    }
}
