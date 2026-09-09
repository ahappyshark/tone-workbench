import * as Tone from 'tone'
import { FxRack } from './fxRack'
import { GrainVoice, type GrainSample } from './grainVoice'
import {
    DEFAULT_GRAIN_PATCH,
    GRAIN_POLYPHONY,
    grainDestinations,
    type GrainPatchState,
    type GrainState,
    type GrainVoiceState,
} from './grainTypes'
import { applyLFOSettings } from './voice'
import {
    MOD_SOURCE_META,
    type EnvState,
    type FilterState,
    type FxSlot,
    type LFOState,
    type ModEnvState,
    type ModRoute,
    type RandomState,
} from './patchTypes'
import type { GrainBuffer } from './grainSource'

/**
 * How often the grain scheduler wakes up.
 *
 * Each tick schedules every grain due before the next one, with explicit
 * start times, so this rate sets how often *modulation* is re-read — not how
 * accurately grains are placed. Thirty a second is finer than any LFO worth
 * hearing and cheap enough to ignore.
 */
const TICK_HZ = 30

/**
 * The pitch of the drone voice.
 *
 * Middle C, so that with key tracking at zero — the texture-box setting — the
 * drone and every played key produce the same pitch, and the drone is purely
 * a "keep the cloud open" switch.
 */
const DRONE_NOTE = 60

/**
 * The grain instrument.
 *
 *   clouds ─▶ voice bus ─▶ [ fx chain ] ─▶ output ─▶ master
 *
 * A sibling of `SynthEngine`, not a mode of it: a different sound source, the
 * same everything else. The effects chain is literally the same class, which
 * is why `FxRack` never learned anything about oscillators.
 */
export class GrainEngine {
    readonly output: Tone.Gain

    private readonly voices: GrainVoice[]
    private readonly voiceBus: Tone.Gain
    private readonly fx: FxRack
    private fxStates: FxSlot[] = []

    /** note -> the voice sounding it */
    private readonly playing = new Map<number, GrainVoice>()
    /** held keys, oldest first — last-note priority in mono */
    private held: number[] = []
    private voiceState: GrainVoiceState = DEFAULT_GRAIN_PATCH.voice
    private grainState: GrainState = DEFAULT_GRAIN_PATCH.grain
    private sample: GrainSample | null = null

    /** the voice held open by the drone switch, excluded from stealing */
    private droneVoice: GrainVoice | null = null

    private readonly scheduler: Tone.Clock

    /* Shared modulation sources. Each exists twice over: as an audio node for
     * audio-rate destinations, and as a plain number for grain-rate ones. */
    private readonly modWheel: Tone.Signal<'number'>
    private modWheelValue = 0
    private readonly random: Tone.Signal<'number'>
    private randomValue = 0
    private readonly randomClock: Tone.Clock
    private readonly randomLoop: Tone.Loop
    private randomTrigger: RandomState['trigger'] = DEFAULT_GRAIN_PATCH.random.trigger

    /**
     * LFOs, each with an analyser tap.
     *
     * The tap is the price of the two-regime design: an LFO's output is an
     * audio signal, and the only way to get a number out of one is to look at
     * its samples. Thirty reads a second of a 32-sample buffer is nothing,
     * and it means the same LFO can drive a filter and a grain size at once.
     */
    private readonly lfos = new Map<string, { lfo: Tone.LFO, probe: Tone.Analyser }>()
    private lfoStates: LFOState[] = []

    private readonly modEnvClock: Tone.Clock
    private readonly modEnvLoop: Tone.Loop

    private bendPosition = 0
    private sustainDown = false
    private readonly sustained = new Set<number>()

    constructor() {
        this.voiceBus = new Tone.Gain(0.5)
        this.fx = new FxRack()
        this.output = new Tone.Gain(1)
        this.voiceBus.connect(this.fx.input)
        this.fx.output.connect(this.output)

        this.voices = Array.from({ length: GRAIN_POLYPHONY }, () => {
            const voice = new GrainVoice()
            voice.output.connect(this.voiceBus)
            return voice
        })

        this.modWheel = new Tone.Signal(0)
        this.random = new Tone.Signal(0)
        const step = () => this.stepRandom()
        this.randomClock = new Tone.Clock(step, 4)
        this.randomLoop = new Tone.Loop(step, '8n')
        this.randomClock.start()

        const loopModEnv = (time: number) => {
            for (const voice of this.voices) voice.retriggerModEnv(time)
        }
        this.modEnvClock = new Tone.Clock(loopModEnv, 1)
        this.modEnvLoop = new Tone.Loop(loopModEnv, '4n')

        this.scheduler = new Tone.Clock(time => this.tick(time), TICK_HZ)
        this.scheduler.start()
    }

    /* -------------------------------------------------------------- */
    /* The scheduler                                                   */
    /* -------------------------------------------------------------- */

    private tick(time: number) {
        this.sweep()
        const window = 1 / TICK_HZ
        const globals = this.sampleGlobals()
        for (const voice of this.voices) {
            if (voice.note === null) continue
            voice.emitGrains(time, time + window, globals)
        }
    }

    /**
     * Every shared source as a number, read once per tick and handed to all
     * the voices. Per-voice sources are resolved inside the voice.
     */
    private sampleGlobals(): Record<string, number> {
        const globals: Record<string, number> = {
            modWheel: this.modWheelValue,
            random: this.randomValue,
        }
        for (const [id, entry] of this.lfos) {
            const values = entry.probe.getValue() as Float32Array
            globals[`lfo:${id}`] = values[values.length - 1] ?? 0
        }
        return globals
    }

    private stepRandom() {
        this.randomValue = Math.random() * 2 - 1
        this.random.value = this.randomValue
    }

    /* -------------------------------------------------------------- */
    /* Source material                                                 */
    /* -------------------------------------------------------------- */

    /**
     * Swap the audio being granulated.
     *
     * Grains already in flight keep their own buffer reference and finish
     * normally, so a swap crossfades itself rather than cutting.
     */
    setBuffer(buffer: GrainBuffer | null) {
        this.sample = buffer
            ? {
                forward: new Tone.ToneAudioBuffer(buffer.forward),
                reversed: new Tone.ToneAudioBuffer(buffer.reversed),
                duration: buffer.duration,
            }
            : null
        for (const voice of this.voices) voice.setSample(this.sample)
    }

    /** Scan-head positions of the sounding voices, 0..1, for the display. */
    headPositions(): number[] {
        const heads: number[] = []
        for (const voice of this.voices) {
            const head = voice.headPosition()
            if (head !== null) heads.push(head)
        }
        return heads
    }

    /* -------------------------------------------------------------- */
    /* Live control                                                    */
    /* -------------------------------------------------------------- */

    setModWheel(value: number) {
        this.modWheelValue = Math.max(0, Math.min(1, value))
        this.modWheel.value = this.modWheelValue
    }

    setPitchBend(position: number) {
        this.bendPosition = Math.max(-1, Math.min(1, position))
        const cents = this.bendPosition * this.voiceState.bendRange * 100
        // Grain pitch is decided in JavaScript when a grain is born, so bend
        // is a number the voices read rather than a signal summed into a
        // detune param. New grains bend; grains already in flight do not.
        for (const voice of this.voices) voice.setBend(cents)
    }

    setSustain(down: boolean) {
        if (this.sustainDown === down) return
        this.sustainDown = down
        if (down) return
        for (const note of this.sustained) {
            const voice = this.playing.get(note)
            if (voice && voice !== this.droneVoice) voice.release()
        }
        this.sustained.clear()
    }

    /* -------------------------------------------------------------- */
    /* Allocation                                                      */
    /* -------------------------------------------------------------- */

    private sweep() {
        const now = Tone.now()
        let reclaimed = false
        for (const voice of this.voices) {
            if (voice === this.droneVoice) continue
            if (voice.note !== null && voice.isSpent(now)) {
                voice.reclaim()
                reclaimed = true
            }
        }
        if (!reclaimed) return
        for (const [note, voice] of this.playing) {
            if (voice.note === null) this.playing.delete(note)
        }
    }

    /** An idle voice, or the oldest one that isn't the drone. */
    private claim(): GrainVoice | null {
        this.sweep()
        const free = this.voices.find(v => v.note === null && v !== this.droneVoice)
        if (free) return free

        const candidates = this.voices
            .filter(v => v !== this.droneVoice)
            .sort((a, b) => {
                const aReleasing = a.releasing ? 0 : 1
                const bReleasing = b.releasing ? 0 : 1
                if (aReleasing !== bReleasing) return aReleasing - bReleasing
                return a.startedAt - b.startedAt
            })
        const stolen = candidates[0]
        if (!stolen) return null
        for (const [note, voice] of this.playing) {
            if (voice === stolen) this.playing.delete(note)
        }
        stolen.reclaim()
        return stolen
    }

    /* -------------------------------------------------------------- */
    /* Playing                                                         */
    /* -------------------------------------------------------------- */

    noteOn(midi: number, velocity = 0.8) {
        const now = Tone.now()
        if (this.voiceState.mode === 'mono') {
            this.held = this.held.filter(n => n !== midi)
            this.held.push(midi)
            const existing = [...this.playing.entries()][0]
            if (existing) {
                const [current, voice] = existing
                this.playing.delete(current)
                this.playing.set(midi, voice)
                voice.trigger(midi, velocity, now)
                return
            }
        } else {
            const existing = this.playing.get(midi)
            if (existing) {
                existing.reclaim()
                this.playing.delete(midi)
            }
        }

        const voice = this.claim()
        if (!voice) return
        this.playing.set(midi, voice)
        this.sustained.delete(midi)
        voice.trigger(midi, velocity, now)
        if (this.randomTrigger === 'key') this.stepRandom()
        this.restartKeyedLFOs()
    }

    noteOff(midi: number) {
        if (this.voiceState.mode === 'mono') {
            this.held = this.held.filter(n => n !== midi)
            if (this.held.length > 0) {
                const next = this.held[this.held.length - 1]
                const existing = [...this.playing.entries()][0]
                if (existing) {
                    const [current, voice] = existing
                    this.playing.delete(current)
                    this.playing.set(next, voice)
                    voice.retune(next)
                }
                return
            }
        }
        const voice = this.playing.get(midi)
        if (!voice || voice === this.droneVoice) return
        if (this.sustainDown) { this.sustained.add(midi); return }
        voice.release()
    }

    allNotesOff() {
        for (const [note, voice] of this.playing) {
            if (voice === this.droneVoice) continue
            voice.release()
            this.playing.delete(note)
        }
        this.held = []
        this.sustained.clear()
    }

    private restartKeyedLFOs() {
        for (const state of this.lfoStates) {
            if (state.trigger !== 'key' || !state.running) continue
            const entry = this.lfos.get(state.id)
            if (!entry) continue
            entry.lfo.stop()
            entry.lfo.start()
        }
    }

    /* -------------------------------------------------------------- */
    /* Patch application                                               */
    /* -------------------------------------------------------------- */

    applyGrain(state: GrainState) {
        this.grainState = state
        for (const voice of this.voices) voice.setGrain(state)
    }

    applyFilter(state: FilterState) {
        for (const voice of this.voices) voice.setFilter(state)
    }

    applyAmpEnv(state: EnvState) {
        for (const voice of this.voices) voice.setAmpEnv(state)
    }

    applyModEnv(state: ModEnvState) {
        for (const voice of this.voices) voice.setModEnv(state)
        if (state.trigger === 'sync') {
            this.modEnvClock.stop()
            this.modEnvLoop.interval = state.division
            this.modEnvLoop.start(0)
        } else if (state.trigger === 'free') {
            this.modEnvLoop.stop()
            this.modEnvClock.frequency.value = Math.max(state.rate, 0.01)
            this.modEnvClock.start()
        } else {
            this.modEnvClock.stop()
            this.modEnvLoop.stop()
        }
    }

    applyVoice(state: GrainVoiceState) {
        const previous = this.voiceState
        this.voiceState = state
        this.setPitchBend(this.bendPosition)

        if (previous.mode !== state.mode) this.allNotesOff()

        if (state.drone && !this.droneVoice) {
            const voice = this.claim()
            if (voice) {
                this.droneVoice = voice
                voice.trigger(DRONE_NOTE, 0.8, Tone.now())
            }
        } else if (!state.drone && this.droneVoice) {
            this.droneVoice.release()
            this.droneVoice = null
        }
    }

    applyRandom(state: RandomState) {
        this.randomTrigger = state.trigger
        if (state.trigger === 'sync') {
            this.randomClock.stop()
            this.randomLoop.interval = state.division
            this.randomLoop.start(0)
        } else if (state.trigger === 'key') {
            this.randomClock.stop()
            this.randomLoop.stop()
        } else {
            this.randomLoop.stop()
            this.randomClock.frequency.value = Math.max(state.rate, 0.01)
            this.randomClock.start()
        }
    }

    /** LFOs here are always shared — see `GrainPatchState.lfos`. */
    applyLFOs(states: LFOState[]) {
        this.lfoStates = states
        const wanted = new Set(states.map(l => l.id))
        for (const [id, entry] of this.lfos) {
            if (wanted.has(id)) continue
            entry.lfo.disconnect(entry.probe)
            entry.probe.dispose()
            entry.lfo.dispose()
            this.lfos.delete(id)
        }
        for (const state of states) {
            let entry = this.lfos.get(state.id)
            if (!entry) {
                const lfo = new Tone.LFO({ min: -1, max: 1 })
                // 32 samples is under a millisecond of audio, so whichever
                // one we read is "now" as far as a modulation source goes.
                const probe = new Tone.Analyser('waveform', 32)
                lfo.connect(probe)
                entry = { lfo, probe }
                this.lfos.set(state.id, entry)
            }
            applyLFOSettings(entry.lfo, state)
        }
    }

    applyFx(states: FxSlot[]) {
        this.fxStates = states
        this.fx.apply(states)
    }

    /**
     * Wire every route to the regime its destination belongs to.
     *
     * Three cases, and the destination decides which: an effect param is
     * global and audio-rate, a filter or pan param is per-voice and
     * audio-rate, and a grain param is per-voice and read by the scheduler.
     * Only the first can be dead, and only for a per-voice source — the same
     * rule the synth has, for the same reason.
     */
    applyRoutes(routes: ModRoute[]) {
        const wanted = new Set(routes.map(r => r.id))
        const destinations = grainDestinations(this.fxStates)

        for (const id of this.fx.routeIds()) {
            if (!wanted.has(id)) this.fx.clearRoute(id)
        }
        for (const voice of this.voices) {
            for (const id of voice.routeIds()) {
                if (!wanted.has(id)) voice.clearRoute(id)
            }
        }

        for (const route of routes) {
            const meta = destinations[route.destination]
            if (!meta) continue
            const amount = route.depth * meta.scale

            if (meta.global) {
                for (const voice of this.voices) voice.clearRoute(route.id)
                this.fx.setRoute(route.id, this.globalNode(route.source), route.destination, amount)
                continue
            }
            this.fx.clearRoute(route.id)
            for (const voice of this.voices) {
                if (meta.regime === 'grain') {
                    voice.setGrainRoute(route.id, route.source, route.destination, amount)
                } else {
                    voice.setAudioRoute(route.id, this.nodeFor(route.source, voice), route.destination, amount)
                }
            }
        }
    }

    /** The single node behind a shared source, or null for a per-voice one. */
    private globalNode(sourceId: string): Tone.ToneAudioNode | null {
        if (sourceId.startsWith('lfo:')) return this.lfos.get(sourceId.slice(4))?.lfo ?? null
        const meta = MOD_SOURCE_META[sourceId as keyof typeof MOD_SOURCE_META]
        if (!meta || meta.perVoice) return null
        return sourceId === 'modWheel' ? this.modWheel : this.random
    }

    private nodeFor(sourceId: string, voice: GrainVoice): Tone.ToneAudioNode | null {
        if (sourceId.startsWith('lfo:')) return this.lfos.get(sourceId.slice(4))?.lfo ?? null
        const meta = MOD_SOURCE_META[sourceId as keyof typeof MOD_SOURCE_META]
        if (!meta) return null
        if (meta.perVoice) return voice.sourceNode(sourceId)
        return sourceId === 'modWheel' ? this.modWheel : this.random
    }

    applyPatch(patch: GrainPatchState) {
        this.applyGrain(patch.grain)
        this.applyFilter(patch.filter)
        this.applyAmpEnv(patch.ampEnv)
        this.applyModEnv(patch.modEnv)
        this.applyVoice(patch.voice)
        this.applyRandom(patch.random)
        this.applyLFOs(patch.lfos)
        this.applyFx(patch.fx)
        this.applyRoutes(patch.modRoutes)
    }

    /** Read back for the UI — the grain panel needs to know the buffer's length. */
    get grain(): GrainState {
        return this.grainState
    }

    dispose() {
        this.scheduler.dispose()
        this.randomClock.dispose()
        this.randomLoop.dispose()
        this.modEnvClock.dispose()
        this.modEnvLoop.dispose()
        for (const entry of this.lfos.values()) {
            entry.lfo.disconnect(entry.probe)
            entry.probe.dispose()
            entry.lfo.dispose()
        }
        this.lfos.clear()
        for (const voice of this.voices) voice.dispose()
        this.fx.dispose()
        this.voiceBus.dispose()
        this.modWheel.dispose()
        this.random.dispose()
        this.output.dispose()
        this.playing.clear()
    }
}
