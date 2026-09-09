import * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * A chorus that leaves the middle of the mix alone.
 *
 *   in ─┬─────────────────────────────────────────────────▶ fade.a (dry)
 *       └─▶ split ─┬─ mid ───────────────────────▶ merge.mid ─▶ fade.b (wet)
 *                  └─ side ─▶ mono ─▶ delay ─▶ width ─▶ merge.side
 *                                      ▲
 *                          lfo ─▶ depth ─▶ scale
 *
 * Mid/side is a change of coordinates, not a filter. The split rewrites a
 * stereo pair as what the two channels agree on (mid) and what they don't
 * (side); the merge turns it back. Everything interesting happens in between,
 * and here only the side signal is touched.
 *
 * That is the whole point. A normal chorus modulates the signal that carries
 * the lead vocal, the snare and the bass — everything that lives in the
 * centre of a mix — so width always costs some focus. Processing the sides
 * alone buys the movement without spending the centre: the source stays
 * exactly where it was and the air around it starts breathing.
 *
 * Four controls, and each does something a plain chorus cannot:
 *
 * - **width** is the side gain. Zero collapses to mono, one is untouched,
 *   two is twice as wide as it was recorded. This one knob is worth the
 *   effect on its own.
 * - **mono** highpasses the sides, so everything below it is carried by the
 *   mid alone. Wide bass is the thing that makes a mix fall apart on a
 *   single speaker, and it is the standard fix on every mastering chain.
 * - **offset** delays the sides. A few milliseconds of it reads as width
 *   because the ear takes an arrival difference as an angle.
 * - **rate** and **depth** wobble that delay, which is the chorus.
 *
 * Two properties worth knowing:
 *
 * **Neutral is reachable.** Width 1, offset 0, depth 0, mono at its floor is
 * a bit-for-bit pass-through at full wet, because the merge exactly inverts
 * the split. Nothing else in the rack can be turned all the way off from
 * inside.
 *
 * **A mono source has no sides.** Feed it something where both channels are
 * identical and the side signal is silence, so every control here does
 * nothing at all. That is not a bug in the effect, it is what mid/side
 * means — put a stereo spread, a chorus or a panned unison in front of it.
 */
export class Dimension {
    /** what upstream connects into */
    readonly input: Tone.Gain
    /** what connects onward — the dry/wet mix */
    readonly output: Tone.CrossFade

    private readonly split: Tone.MidSideSplit
    private readonly merge: Tone.MidSideMerge
    /** highpass on the sides: below it, only the mid carries the signal */
    private readonly mono: Tone.Filter
    private readonly delay: Tone.Delay
    private readonly width: Tone.Gain
    private readonly lfo: Tone.LFO
    private readonly depth: Tone.Gain
    private readonly scale: Tone.Gain

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        this.split = new Tone.MidSideSplit()
        this.merge = new Tone.MidSideMerge()
        // Q below Tone's default of 1: a resonant peak sitting right at the
        // mono crossover would put a bass bump *into* the sides, which is the
        // exact opposite of what this control is for. Measured +1.2 dB on the
        // sides an octave above the cutoff before this was pinned down.
        this.mono = new Tone.Filter({ frequency: 120, type: 'highpass', rolloff: -12, Q: 0.707 })
        this.delay = new Tone.Delay({ delayTime: 0.012, maxDelay: 0.1 })
        this.width = new Tone.Gain(1.4)
        // Unipolar rather than the usual -1..1: at an offset of zero a
        // bipolar sway would ask for a negative delay, which Web Audio clamps
        // at zero, and half a clipped sine is a buzz rather than a wobble.
        // Sweeping upward from the offset never hits that floor.
        this.lfo = new Tone.LFO({ frequency: 0.4, min: 0, max: 1 })
        this.depth = new Tone.Gain(0.5)
        // The depth gain carries a plain 0..1 so the rack can modulate it
        // directly; this is what turns that into a sane number of seconds.
        // Three milliseconds at full depth — past that it is a vibrato.
        this.scale = new Tone.Gain(0.003)

        this.input.connect(this.output.a)
        this.input.connect(this.split)

        this.split.mid.connect(this.merge.mid)
        this.split.side.chain(this.mono, this.delay, this.width, this.merge.side)
        this.merge.connect(this.output.b)

        this.lfo.chain(this.depth, this.scale)
        this.scale.connect(this.delay.delayTime)
        this.lfo.start()
    }

    /* ---------------------------------------------------------------- */
    /* Params — every knob on the panel is one                           */
    /* ---------------------------------------------------------------- */

    get wet(): AnyParam {
        return this.output.fade
    }

    /** Side gain: 0 is mono, 1 is untouched, 2 is twice as wide. */
    get widthParam(): AnyParam {
        return this.width.gain
    }

    /** Everything below this stays centred, in Hz. */
    get monoParam(): AnyParam {
        return this.mono.frequency
    }

    /** Seconds the sides lag the middle by. */
    get offset(): AnyParam {
        return this.delay.delayTime
    }

    /** Sway rate in Hz. */
    get rate(): AnyParam {
        return this.lfo.frequency
    }

    /** Sway amount, 0..1, scaled to milliseconds downstream. */
    get depthParam(): AnyParam {
        return this.depth.gain
    }

    dispose() {
        this.lfo.stop()
        for (const node of [
            this.input, this.output, this.split, this.merge, this.mono,
            this.delay, this.width, this.lfo, this.depth, this.scale,
        ]) {
            node.dispose()
        }
    }
}
