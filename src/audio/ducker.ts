import * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * A reverb that gets out of the way while you play and blooms when you stop.
 *
 *   in ─┬───────────────────────────────────────────────▶ fade.a (dry)
 *       ├─▶ reverb ─▶ duck ─────────────────────────────▶ fade.b (wet)
 *       │              ▲ gain
 *       │            clamp ◀─ sum ◀─ open (1)
 *       └─▶ follower ─▶ sense ─▶ depth ─▶ invert ─────────┘
 *
 * The follower tracks how loud the input is. That envelope is scaled, negated
 * and subtracted from a constant, and the result drives the wet path's gain.
 * Loud input closes the wet; silence opens it.
 *
 * This is the least glamorous effect in the rack and probably the most
 * useful. A long reverb is unusable at high wet because every note lands in
 * the wash of the last one. Ducking lets the tail be enormous *and* the
 * playing stay legible, which is most of the trick behind ambient records
 * that sound spacious rather than muddy.
 *
 * Two things had to be got right and were wrong first time round:
 *
 * **The follower's output is tiny.** It is the smoothed absolute value of the
 * signal, and notes off the voice bus peak around a tenth of full scale, so
 * feeding it straight in ducks by about five percent — inaudible. `sense`
 * is the makeup that makes the depth knob mean something.
 *
 * **The sum has to be clamped.** A loud enough input drives the control
 * signal below zero, and a negative gain does not mute the reverb, it
 * inverts it. The waveshaper floors it at zero.
 *
 * `recovery` is the follower's smoothing and decides the character: fast is
 * pumping and rhythmic, slow is a tide that comes in between phrases.
 */
export class Ducker {
    readonly input: Tone.Gain
    readonly output: Tone.CrossFade

    private readonly reverb: Tone.Reverb
    private readonly duck: Tone.Gain
    private readonly follower: Tone.Follower
    private readonly sense: Tone.Gain
    private readonly depth: Tone.Gain
    private readonly invert: Tone.Gain
    private readonly sum: Tone.Gain
    private readonly clamp: Tone.WaveShaper
    /** holds the wet path open; the envelope subtracts from it */
    private readonly open: Tone.Signal<'number'>

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        this.reverb = new Tone.Reverb({ decay: 6, preDelay: 0.02, wet: 1 })
        this.duck = new Tone.Gain(0)
        this.follower = new Tone.Follower(0.3)
        this.sense = new Tone.Gain(20)
        this.depth = new Tone.Gain(0.8)
        this.invert = new Tone.Gain(-1)
        this.sum = new Tone.Gain(1)
        this.clamp = new Tone.WaveShaper(x => Math.max(0, x), 2048)
        this.open = new Tone.Signal(1)

        this.input.connect(this.output.a)
        this.input.chain(this.reverb, this.duck)
        this.duck.connect(this.output.b)

        this.open.connect(this.sum)
        this.input.chain(this.follower, this.sense, this.depth, this.invert)
        this.invert.connect(this.sum)
        this.sum.chain(this.clamp)
        this.clamp.connect(this.duck.gain)
    }

    get wet(): AnyParam {
        return this.output.fade
    }

    /**
     * How hard the wet path is pushed down, 0 to 1. A gain, so it takes
     * modulation — an envelope on this is a reverb that ducks harder the
     * louder you play.
     */
    get depthParam(): AnyParam {
        return this.depth.gain
    }

    /**
     * How quickly the wet path comes back, in seconds. A plain setter on the
     * follower rather than a param, so it isn't a modulation destination.
     */
    setRecovery(seconds: number) {
        this.follower.smoothing = Math.max(0.01, seconds)
    }

    setDecay(seconds: number, preDelay: number) {
        this.reverb.decay = seconds
        this.reverb.preDelay = preDelay
        return this.reverb.ready
    }

    dispose() {
        for (const node of [
            this.input, this.output, this.reverb, this.duck, this.follower,
            this.sense, this.depth, this.invert, this.sum, this.clamp, this.open,
        ]) {
            node.dispose()
        }
    }
}
