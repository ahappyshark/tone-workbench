import * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * A bank of tuned comb filters, so whatever you feed it comes out as a chord.
 *
 *   in ─┬──────────────────────────────────▶ fade.a (dry)
 *       ├─▶ comb (root)   ─▶ pan ─┐
 *       ├─▶ comb (+i₁)    ─▶ pan ─┼─▶ sum ─▶ fade.b (wet)
 *       ├─▶ comb (+i₂)    ─▶ pan ─┤
 *       └─▶ comb (+i₃)    ─▶ pan ─┘
 *
 * A comb filter is a very short delay fed back into itself, which makes it
 * ring at one pitch — the reciprocal of its delay time. Four of them tuned to
 * a voicing turn noise, grains or any transient into a sustained chord. It is
 * the cheapest way to make an unpitched instrument play harmony, and it is
 * why this pairs with the generative harmonizer: the cluster generator picks
 * the tuning and the resonator plays whatever is going through it.
 *
 * `Tone.LowpassCombFilter` is used rather than the plain one because it has
 * damping built into the feedback path. Without it a bank at high resonance
 * is a bank of screaming sine waves.
 */

/**
 * Semitone offsets from the root.
 *
 * `thirds` is the root-omitted stacked-third voicing from the harmonizer
 * spec — a minor third, fifth and minor seventh with no root under them.
 * That is deliberately ambiguous harmony, which is what lets a drone sit
 * under changing material without committing to a key.
 */
export const VOICINGS: readonly (readonly number[])[] = [
    [0, 12, 24, 36],   // octaves — reinforcement rather than harmony
    [0, 7, 12, 19],    // fifths — open and hollow
    [0, 3, 7, 10],     // stacked thirds, root omitted
    [0, 4, 11, 18],    // wide ninth — the lushest of the four
]

export const VOICING_LABELS = ['octaves', 'fifths', 'thirds', 'ninth'] as const

const VOICES = 4

/**
 * The knob's 0…0.95 mapped onto the comb's actual feedback.
 *
 * A comb's ring time goes as 1/(1−r), so everything interesting is crammed
 * against 1. Wired straight through, the knob at 0.85 gave about a third of a
 * second of ring — the bank coloured the input and then shut up. This puts
 * several seconds of sustain at the top of the knob and a short resonant blip
 * in the middle.
 */
function resonanceCurve(knob: number): number {
    const norm = Math.max(0, Math.min(1, knob / 0.95))
    return 0.995 * (1 - Math.pow(1 - norm, 2))
}

export class Resonator {
    readonly input: Tone.Gain
    readonly output: Tone.CrossFade

    private readonly combs: Tone.LowpassCombFilter[]
    private readonly pans: Tone.Panner[]
    private readonly sum: Tone.Gain
    /**
     * One summing point that fans out to all four combs.
     *
     * Not a base signal this class writes — the rack's own base connects into
     * it and so do any modulation routes, and it distributes the total. The
     * first version handed the rack `combs[0].resonance`, which meant a mod
     * route silently changed the ring time of one voice out of four.
     */
    private readonly resonanceIn: Tone.Signal<'number'>
    private readonly curve: Tone.WaveShaper
    /**
     * Output compensation, driven by the same knob.
     *
     * A comb's gain at its resonant frequency is roughly 1/(1−r), so the
     * setting that makes it sustain is also the setting that makes it twenty
     * times louder — the first version peaked well past full scale and lived
     * on the master limiter. Scaling the sum by the square root of (1−r)
     * holds the level roughly still as the ring time changes. The square root
     * rather than the whole thing because only the resonant frequency gets
     * the full boost, not the broadband signal.
     */
    private readonly normalise: Tone.WaveShaper

    private tuning = 48
    private voicing = 1

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        // Driven by `normalise`, not set: writing a param that something is
        // connected to does nothing.
        this.sum = new Tone.Gain(0)
        this.combs = []
        this.pans = []
        this.resonanceIn = new Tone.Signal(0)
        this.curve = new Tone.WaveShaper(x => resonanceCurve(x), 4096)
        this.normalise = new Tone.WaveShaper(x => 0.9 * Math.sqrt(1 - resonanceCurve(x)), 4096)
        this.resonanceIn.connect(this.curve)
        this.resonanceIn.connect(this.normalise)
        this.normalise.connect(this.sum.gain)

        for (let i = 0; i < VOICES; i++) {
            const comb = new Tone.LowpassCombFilter({ delayTime: 0.01, resonance: 0, dampening: 4000 })
            // Fanned across the image so the chord has width without any
            // modulation. A bank stacked in the centre sounds like one comb.
            const pan = new Tone.Panner((i / (VOICES - 1)) * 1.4 - 0.7)
            comb.connect(pan)
            pan.connect(this.sum)
            this.input.connect(comb)
            // Connecting anything to a Tone param zeroes it and marks it
            // overridden, which is exactly what we want here: the rack drives
            // resonance through the fan-out below.
            this.curve.connect(comb.resonance)
            this.combs.push(comb)
            this.pans.push(pan)
        }

        this.input.connect(this.output.a)
        this.sum.connect(this.output.b)
        this.retune()
    }

    private retune() {
        const intervals = VOICINGS[this.voicing] ?? VOICINGS[0]
        this.combs.forEach((comb, i) => {
            const semitones = this.tuning + (intervals[i] ?? 0)
            const hz = 440 * Math.pow(2, (semitones - 69) / 12)
            // A comb rings at 1/delayTime, so the delay *is* the pitch.
            comb.delayTime.value = 1 / hz
        })
    }

    /* ---------------------------------------------------------------- */

    get wet(): AnyParam {
        return this.output.fade
    }

    /**
     * Ring time, for all four voices at once. A comb at 1.0 never decays, so
     * the patch range stops below that, the same way the delay's does.
     */
    get resonance(): AnyParam {
        return this.resonanceIn
    }

    setDamping(hz: number) {
        for (const comb of this.combs) comb.dampening = hz
    }

    /** Root note, in MIDI semitones. Retunes four delay lines, so not a param. */
    setTuning(midi: number, voicing: number) {
        if (this.tuning === midi && this.voicing === voicing) return
        this.tuning = midi
        this.voicing = voicing
        this.retune()
    }

    dispose() {
        this.resonanceIn.dispose()
        this.curve.dispose()
        this.normalise.dispose()
        for (const node of [...this.combs, ...this.pans, this.sum, this.input, this.output]) {
            node.dispose()
        }
    }
}
