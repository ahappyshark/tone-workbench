import * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * One band of the smear: a delay line with its own feedback loop.
 *
 *   band ─▶ delay ─┬────────▶ sum
 *             ▲    └─▶ regen ┐
 *             └──────────────┘
 *
 * The cycle is delay → regen → delay, so the `DelayNode` Web Audio insists on
 * is right there in it. Nothing filters inside the loop: the signal arriving
 * is already band-limited by the split, so repeats stay in their band without
 * any further help and the feedback knob means what it says.
 */
class Band {
    readonly delay: Tone.Delay
    readonly regen: Tone.Gain

    constructor(time: number, feedback: number) {
        this.delay = new Tone.Delay({ delayTime: time, maxDelay: 2 })
        this.regen = new Tone.Gain(feedback)
        this.delay.connect(this.regen)
        this.regen.connect(this.delay)
    }

    dispose() {
        // Break the cycle before disposing either end of it.
        this.regen.disconnect()
        this.delay.dispose()
        this.regen.dispose()
    }
}

/**
 * Three delays that don't agree with each other.
 *
 *   in ─┬────────────────────────────────────────────────▶ fade.a (dry)
 *       └─▶ split ─┬─ low  ─▶ delay ⟲ regen ─┐
 *                  ├─ mid  ─▶ delay ⟲ regen ─┼─▶ sum ───▶ fade.b (wet)
 *                  └─ high ─▶ delay ⟲ regen ─┘
 *
 * A plain delay moves a sound whole. This one takes it apart first: the split
 * hands each band to its own delay, and because the three times are
 * independent, a single event leaves at three different moments. The
 * transient stays where you played it while the body arrives late and the top
 * scatters ahead — which is why it smears rather than repeats.
 *
 * Short highs against long lows is the setting to reach for. It reads as
 * depth rather than as echo, because that is roughly what distance does to
 * sound: the top of a sound is the first thing a room takes away, so
 * feeding the highs back quickly at a short time and letting the lows lag
 * behind puts the source further off without a reverb anywhere near it.
 *
 * Inverting it — long highs, short lows — is not the same effect backwards.
 * It sounds like nothing physical at all, which is exactly why it is worth
 * having on a knob.
 *
 * The bands do not sum back to exactly what went in: Butterworth crossovers
 * are not complementary, so with all three times equal the wet path measures
 * about 2 dB below the dry one on broadband material. That is left alone
 * rather than made up with a gain, because the loss is concentrated around
 * the two crossovers and a fixed gain would only move the error somewhere
 * else. It matters not at all once the three times differ, which is the only
 * reason to reach for this.
 *
 * Every control here is a real audio-rate param, feedbacks included, so all
 * eight of them are modulation destinations. An LFO on one band's delay time
 * repitches only that band, which is a chorus that touches the highs and
 * leaves the bass still.
 */
export class MultibandSmear {
    /** what upstream connects into */
    readonly input: Tone.Gain
    /** what connects onward — the dry/wet mix */
    readonly output: Tone.CrossFade

    private readonly split: Tone.MultibandSplit
    private readonly sum: Tone.Gain
    private readonly low: Band
    private readonly mid: Band
    private readonly high: Band

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        // Q sits below Tone's default of 1: the three bands are summed back
        // together at the end, and a resonant peak either side of a crossover
        // survives that sum as an audible honk on the wet path.
        this.split = new Tone.MultibandSplit({ Q: 0.7, lowFrequency: 250, highFrequency: 2500 })
        this.sum = new Tone.Gain(1)
        this.low = new Band(0.5, 0.5)
        this.mid = new Band(0.28, 0.45)
        this.high = new Band(0.09, 0.6)

        this.input.connect(this.output.a)
        this.input.connect(this.split)

        this.split.low.connect(this.low.delay)
        this.split.mid.connect(this.mid.delay)
        this.split.high.connect(this.high.delay)

        for (const band of [this.low, this.mid, this.high]) band.delay.connect(this.sum)
        this.sum.connect(this.output.b)
    }

    /* ---------------------------------------------------------------- */
    /* Params — all eight, plus wet                                      */
    /* ---------------------------------------------------------------- */

    get wet(): AnyParam {
        return this.output.fade
    }

    /** Low/mid crossover, in Hz. A signal, so it sweeps. */
    get lowCross(): AnyParam {
        return this.split.lowFrequency
    }

    /** Mid/high crossover, in Hz. */
    get highCross(): AnyParam {
        return this.split.highFrequency
    }

    get lowTime(): AnyParam { return this.low.delay.delayTime }
    get midTime(): AnyParam { return this.mid.delay.delayTime }
    get highTime(): AnyParam { return this.high.delay.delayTime }

    get lowFeedback(): AnyParam { return this.low.regen.gain }
    get midFeedback(): AnyParam { return this.mid.regen.gain }
    get highFeedback(): AnyParam { return this.high.regen.gain }

    dispose() {
        this.low.dispose()
        this.mid.dispose()
        this.high.dispose()
        for (const node of [this.input, this.output, this.split, this.sum]) node.dispose()
    }
}
