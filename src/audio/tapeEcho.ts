import * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

/**
 * A delay that degrades the way tape does.
 *
 *   in ─┬─────────────────────────────────────────▶ fade.a (dry)
 *       └─▶ mix ─▶ delay ─┬──────────────────────▶ fade.b (wet)
 *             ▲           └─▶ sat ─▶ damp ─▶ regen ┐
 *             └──────────────────────────────────── ┘
 *                    wow: lfo ─▶ flutter ─▶ delay.delayTime
 *
 * The whole point is what happens to the *repeats* rather than the first one.
 * Each pass goes through a waveshaper and a lowpass before it comes back, so
 * the echoes get progressively softer, darker and more compressed instead of
 * being clean copies at falling volume. That difference is most of why a tape
 * echo sits in a mix and a digital delay sits on top of one.
 *
 * The wow is an LFO summed into the delay time. It has to *sum* rather than
 * set, because the rack's own base signal and any modulation routes are on
 * that same param — which is exactly what the base-signal discipline in
 * `Voice` and `FxRack` exists to allow.
 *
 * Modulating the delay time of a running delay line repitches whatever is
 * already in it, which is the warble. Too much and it is seasick, so the
 * flutter depth is scaled down hard: full depth is a few milliseconds.
 */
export class TapeEcho {
    readonly input: Tone.Gain
    readonly output: Tone.CrossFade

    private readonly mix: Tone.Gain
    private readonly delay: Tone.Delay
    private readonly sat: Tone.Distortion
    private readonly damp: Tone.Filter
    private readonly regen: Tone.Gain
    private readonly lfo: Tone.LFO
    private readonly flutter: Tone.Gain

    private appliedDrive = -1

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.CrossFade(0.3)
        this.mix = new Tone.Gain(1)
        this.delay = new Tone.Delay({ delayTime: 0.3, maxDelay: 2 })
        // No oversampling: the aliasing of a cheap waveshaper is part of what
        // makes a repeat sound worn rather than merely quieter.
        this.sat = new Tone.Distortion({ distortion: 0.15 })
        this.damp = new Tone.Filter({ frequency: 3200, type: 'lowpass' })
        this.regen = new Tone.Gain(0.4)
        this.lfo = new Tone.LFO({ frequency: 0.6, min: -1, max: 1 })
        this.flutter = new Tone.Gain(0)

        this.input.connect(this.output.a)
        this.input.connect(this.mix)
        this.mix.connect(this.delay)
        this.delay.connect(this.output.b)

        this.delay.chain(this.sat, this.damp, this.regen)
        this.regen.connect(this.mix)

        this.lfo.connect(this.flutter)
        this.flutter.connect(this.delay.delayTime)
        this.lfo.start()
    }

    get wet(): AnyParam {
        return this.output.fade
    }

    get time(): AnyParam {
        return this.delay.delayTime
    }

    get feedback(): AnyParam {
        return this.regen.gain
    }

    get damping(): AnyParam {
        return this.damp.frequency
    }

    /** Waveshaper amount. Rebuilds a curve on assignment, so guard it. */
    setDrive(amount: number) {
        if (this.appliedDrive === amount) return
        this.appliedDrive = amount
        this.sat.distortion = amount
    }

    setWow(rate: number, depth: number) {
        this.lfo.frequency.value = Math.max(0.01, rate)
        // Full depth is five milliseconds. Beyond that it stops being wow and
        // starts being a pitch effect.
        this.flutter.gain.value = depth * 0.005
    }

    dispose() {
        this.lfo.stop()
        for (const node of [
            this.input, this.output, this.mix, this.delay, this.sat,
            this.damp, this.regen, this.lfo, this.flutter,
        ]) {
            node.dispose()
        }
    }
}
