import * as Tone from 'tone'
import {
    DEFAULT_PATCH,
    OSC_MODE_PARAMS,
    omniType,
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
        const gain = which === 'a' ? this.gainA : this.gainB
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

        gain.gain.value = state.level
        this.applyPitch()
    }

    setSub(state: SubState) {
        this.stateSub = state
        this.sub.type = state.wave
        this.gainSub.gain.value = state.level
        this.applyPitch()
    }

    setNoise(state: NoiseState) {
        this.noise.type = state.type
        this.gainNoise.gain.value = state.level
    }

    setFilter(state: FilterState) {
        this.stateFilter = state
        this.filter.type = state.type
        this.filter.frequency.value = state.cutoff
        this.filter.Q.value = state.resonance
        this.envAmount.gain.value = state.envAmount
        this.applyKeyTrack()
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
        this.panner.pan.value = pan
        this.applyPitch()
    }

    /* -------------------------------------------------------------- */
    /* Playing                                                         */
    /* -------------------------------------------------------------- */

    /**
     * @param retrigger false re-pitches without restarting the envelopes,
     *   which is what legato mode means.
     */
    trigger(note: number, velocity: number, retrigger = true) {
        this.note = note
        this.releasing = false
        this.startedAt = Tone.now()
        this.applyPitch()
        this.applyKeyTrack()
        if (retrigger) {
            this.amp.triggerAttack(undefined, velocity)
            this.modEnv.triggerAttack()
        }
    }

    /** Re-pitch a sounding voice without touching its envelopes. */
    retune(note: number) {
        this.note = note
        this.applyPitch()
        this.applyKeyTrack()
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

    private applyPitch() {
        if (this.note === null) return
        const set = (signal: Tone.Signal<'frequency'>, midi: number) => {
            const hz = Tone.Frequency(midi, 'midi').toFrequency()
            if (this.glide > 0) signal.exponentialRampTo(hz, this.glide)
            else signal.value = hz
        }
        set(this.oscA.frequency, this.note + this.stateA.octave * 12 + this.stateA.semi)
        set(this.oscB.frequency, this.note + this.stateB.octave * 12 + this.stateB.semi)
        set(this.sub.frequency, this.note - this.stateSub.octave * 12)

        this.oscA.detune.value = this.stateA.fine + this.unisonDetune
        this.oscB.detune.value = this.stateB.fine + this.unisonDetune
        this.sub.detune.value = this.unisonDetune
    }

    /**
     * Cutoff follows the played pitch. Sits on detune as the *base* value; the
     * mod envelope's connection sums on top of it.
     */
    private applyKeyTrack() {
        if (this.note === null) return
        this.filter.detune.value = (this.note - 60) * 100 * this.stateFilter.keyTrack
    }

    dispose() {
        for (const node of [
            this.oscA, this.oscB, this.sub, this.noise,
            this.gainA, this.gainB, this.gainSub, this.gainNoise,
            this.filter, this.amp, this.modEnv, this.envAmount,
            this.panner, this.output,
        ]) {
            node.dispose()
        }
    }

    /** Modulation destinations this voice exposes to the param registry. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get modTargets(): Record<string, Tone.Param<any> | Tone.Signal<any>> {
        return {
            'filter.cutoff': this.filter.frequency,
            'filter.detune': this.filter.detune,
            'filter.resonance': this.filter.Q,
            'oscA.detune': this.oscA.detune,
            'oscB.detune': this.oscB.detune,
            'amp.pan': this.panner.pan,
        }
    }
}
