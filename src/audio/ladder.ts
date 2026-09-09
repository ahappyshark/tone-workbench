import * as Tone from 'tone'

/** The rack drives these through one shape, whatever their unit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * A regeneration ladder: a delay whose feedback path runs through a
 * transposer, with a reverb after it. Each pass comes back moved, so the tail
 * climbs (or falls, or goes inharmonic) away from the note you played.
 *
 * Two effects share this network, because they *are* the same network. The
 * only difference is what sits in the loop:
 *
 * - **shimmer** uses a pitch shifter, which moves by musical intervals. An
 *   octave up is the classic. Every generation stays in tune with the last.
 * - **shift** uses a frequency shifter, which moves by a fixed number of
 *   hertz. That is not transposition: it slides every partial by the same
 *   amount rather than the same ratio, so harmonic relationships break and
 *   the tail turns bell-like and metallic. At a few hertz it is slow beating
 *   rather than pitch movement at all.
 *
 * The frequency shifter's amount is a signal, so unlike shimmer's pitch it
 * can be modulated. Aiming an LFO at it is the barberpole effect.
 *
 *   in ─┬──────────────────────────────────────────────▶ fade.a (dry)
 *       └─▶ ladder ─▶ reverb ─────────────────────────▶ fade.b (wet)
 *             ▲  │
 *             │  └─▶ spacing ─▶ pitch ─▶ damp ─▶ regen ┐
 *             └────────────────────────────────────────┘
 *
 * This is the patch you'd build from modules: a delay whose feedback path
 * runs through a pitch shifter, with a reverb smearing the result. Four
 * things about it are load-bearing.
 *
 * **The reverb is after the loop, not inside it.** The first version put the
 * convolver in the cycle, which works and sounds fine but dies in about two
 * seconds no matter how high the feedback goes: a convolution reverb spreads
 * one impulse across its whole decay, so the gain going *round* the loop is
 * a small fraction of unity and the ladder starves. Outside the loop, the
 * regeneration gain means what the knob says.
 *
 * **There has to be a delay in the cycle.** Web Audio silences a feedback
 * cycle containing no `DelayNode`, and Tone says so out loud in
 * `FeedbackEffect`. `spacing` is that delay, and it's also the most musical
 * control here — it sets how long each octave waits before the next arrives,
 * which is the difference between a metallic sheen and a slow ascending
 * cloud.
 *
 * **The damping filter is what keeps it stable.** Every pass moves energy an
 * octave up, so without a lowpass in the loop the feedback piles into the top
 * end and screams. Damping makes each generation a little darker, which is
 * both the safety net and the reason the ladder fades out like a reverb
 * rather than running away.
 *
 * **`Tone.Reverb` could not have grown a knob for this.** It's a convolver;
 * the tail is an impulse response that has already finished being computed,
 * with no feedback path to insert anything into. That's why this is a
 * composite effect rather than another parameter on the reverb, and it's the
 * reason `FxRack` now tracks each slot's entry and exit separately.
 */
export type LadderKind = 'pitch' | 'shift'

export class Ladder {
    /** what upstream connects into */
    readonly input: Tone.Gain
    /** what connects onward — the dry/wet mix */
    readonly output: Tone.CrossFade

    private readonly ladder: Tone.Gain
    private readonly reverb: Tone.Reverb
    readonly kind: LadderKind
    /** exactly one of these exists, decided by `kind` */
    private readonly pitchShift: Tone.PitchShift | null
    private readonly freqShift: Tone.FrequencyShifter | null
    private readonly damp: Tone.Filter
    private readonly spacing: Tone.Delay
    private readonly regen: Tone.Gain

    constructor(kind: LadderKind) {
        this.kind = kind
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        this.ladder = new Tone.Gain(1)
        this.reverb = new Tone.Reverb({ decay: 4, preDelay: 0.01, wet: 1 })
        // A larger window shifts big intervals more smoothly at the cost of
        // latency, and an octave is a big interval. In a reverb tail the
        // latency is inaudible, so trade it away.
        this.pitchShift = kind === 'pitch'
            ? new Tone.PitchShift({ pitch: 12, windowSize: 0.1 })
            : null
        this.freqShift = kind === 'shift' ? new Tone.FrequencyShifter(0) : null
        this.damp = new Tone.Filter({ frequency: 4000, type: 'lowpass' })
        this.spacing = new Tone.Delay({ delayTime: 0.25, maxDelay: 2 })
        this.regen = new Tone.Gain(0.5)

        this.input.connect(this.output.a)
        this.input.connect(this.ladder)
        // Everything the ladder is holding — the original and every octave
        // above it — goes into the reverb together.
        this.ladder.connect(this.reverb)
        this.reverb.connect(this.output.b)

        // The cycle. `spacing` is the DelayNode that makes it legal, and the
        // reverb is deliberately not part of it.
        const transposer = (this.pitchShift ?? this.freqShift) as Tone.ToneAudioNode
        this.ladder.chain(this.spacing, transposer, this.damp, this.regen)
        this.regen.connect(this.ladder)
    }

    /* ---------------------------------------------------------------- */
    /* Params                                                            */
    /* ---------------------------------------------------------------- */

    /** Dry/wet. A `Param`, so the rack's base signal and routes reach it. */
    get wet(): AnyParam {
        return this.output.fade
    }

    /** How much of each pass survives into the next. */
    get feedback(): AnyParam {
        return this.regen.gain
    }

    /** Lowpass in the loop, in Hz. Lower is darker and dies sooner. */
    get damping(): AnyParam {
        return this.damp.frequency
    }

    /** Seconds between one octave and the next. */
    get time(): AnyParam {
        return this.spacing.delayTime
    }

    /**
     * Transposition per pass, in semitones. Shimmer only, and not a param —
     * the setter rebuilds the shifter's delay ramps, so it can no more follow
     * an LFO than reverb decay can.
     */
    set pitch(semitones: number) {
        if (this.pitchShift) this.pitchShift.pitch = semitones
    }

    /**
     * Hertz moved per pass. Shift only, and a real signal, so this one *is*
     * a modulation destination.
     */
    get shift(): AnyParam | null {
        return this.freqShift ? this.freqShift.frequency : null
    }

    /**
     * Tail length. Re-renders an impulse response offline, so the rack
     * debounces it exactly as it does for a plain reverb.
     */
    setDecay(seconds: number, preDelay: number) {
        this.reverb.decay = seconds
        this.reverb.preDelay = preDelay
        return this.reverb.ready
    }

    dispose() {
        // Break the cycle first: disposing a node that is still part of a
        // live feedback loop leaves the rest of the loop connected to it.
        this.regen.disconnect()
        for (const node of [
            this.input, this.output, this.ladder, this.reverb,
            this.pitchShift, this.freqShift, this.damp, this.spacing, this.regen,
        ]) {
            node?.dispose()
        }
    }
}
