import * as Tone from 'tone'
import { Voice, applyLFOSettings } from './voice'
import {
    DEFAULT_PATCH,
    MOD_SOURCE_META,
    type LFOState,
    type ModRoute,
    type PatchState,
    type RandomState,
    type VoiceState,
} from './patchTypes'

/** Fixed pool size. Not a control — rebuilding nodes mid-playback clicks. */
export const POLYPHONY = 16


/**
 * The voice pool and its allocator.
 *
 * A note claims a *group* of `unison` voices rather than a single voice, which
 * is what lets one key press become a detuned, stereo-spread stack. Groups are
 * always stolen whole: split one and a chord loses part of a note while its
 * detune collapses to whatever half survived.
 */
export class SynthEngine {
    readonly output: Tone.Gain

    private readonly voices: Voice[]
    /** note -> the voices sounding it. At most one entry in mono/legato. */
    private readonly groups = new Map<number, Voice[]>()
    /** held keys, oldest first — last-note priority for mono. */
    private held: number[] = []
    private voiceState: VoiceState = DEFAULT_PATCH.voice

    /** Sources shared by every voice: one node, fanned out by the routes. */
    private readonly modWheel: Tone.Signal<'number'>
    private readonly random: Tone.Signal<'number'>
    /** free-running S&H clock — independent of the transport */
    private readonly randomClock: Tone.Clock
    /** tempo-locked S&H — runs on the transport, like a synced LFO */
    private readonly randomLoop: Tone.Loop
    private readonly globalLFOs = new Map<string, Tone.LFO>()
    private lfoStates: LFOState[] = []

    constructor() {
        // 16 voices summing into one bus needs headroom; the master limiter
        // catches what's left.
        this.output = new Tone.Gain(0.25)
        this.voices = Array.from({ length: POLYPHONY }, () => {
            const voice = new Voice()
            voice.output.connect(this.output)
            return voice
        })

        this.modWheel = new Tone.Signal(0)
        this.random = new Tone.Signal(0)
        // Sample-and-hold: a new value held until the next tick.
        //
        // Two clocks because they mean different things. Tone.Loop is
        // scheduled on the transport, so a *synced* S&H correctly only ticks
        // while the transport runs — but a free-running one must not depend
        // on the transport at all, and Tone.Clock runs off the audio context.
        const step = () => { this.random.value = Math.random() * 2 - 1 }
        this.randomClock = new Tone.Clock(step, 4)
        this.randomLoop = new Tone.Loop(step, '8n')
        this.randomClock.start()
    }

    /* -------------------------------------------------------------- */
    /* Modulation                                                      */
    /* -------------------------------------------------------------- */

    /** Live controller value, 0..1. Not patch state — it's a hand on a wheel. */
    setModWheel(value: number) {
        this.modWheel.value = Math.max(0, Math.min(1, value))
    }

    applyRandom(state: RandomState) {
        if (state.sync) {
            this.randomClock.stop()
            this.randomLoop.interval = state.division
            this.randomLoop.start(0)
        } else {
            this.randomLoop.stop()
            this.randomClock.frequency.value = Math.max(state.rate, 0.01)
            this.randomClock.start()
        }
    }

    /**
     * Reconcile LFO nodes with patch state. A `perVoice` LFO lives inside each
     * voice; a shared one lives here. Flipping the flag moves it, which is why
     * both sides are torn down before the wanted one is built.
     */
    applyLFOs(states: LFOState[]) {
        this.lfoStates = states
        const wanted = new Set(states.map(l => l.id))

        for (const [id, lfo] of this.globalLFOs) {
            if (!wanted.has(id)) { lfo.dispose(); this.globalLFOs.delete(id) }
        }
        for (const voice of this.voices) {
            for (const id of voice.lfoIds()) {
                if (!wanted.has(id)) voice.dropLFO(id)
            }
        }

        for (const state of states) {
            if (state.perVoice) {
                const shared = this.globalLFOs.get(state.id)
                if (shared) { shared.dispose(); this.globalLFOs.delete(state.id) }
                for (const voice of this.voices) voice.syncLFO(state)
            } else {
                for (const voice of this.voices) voice.dropLFO(state.id)
                let lfo = this.globalLFOs.get(state.id)
                if (!lfo) {
                    lfo = new Tone.LFO({ min: -1, max: 1 })
                    this.globalLFOs.set(state.id, lfo)
                }
                applyLFOSettings(lfo, state)
            }
        }
    }

    /** Wire every route into every voice. Depth-only changes reuse the gain. */
    applyRoutes(routes: ModRoute[]) {
        const wanted = new Set(routes.map(r => r.id))
        for (const voice of this.voices) {
            for (const id of voice.routeIds()) {
                if (!wanted.has(id)) voice.clearRoute(id)
            }
            for (const route of routes) {
                voice.setRoute(route.id, this.sourceFor(route.source, voice), route.destination, route.depth)
            }
        }
    }

    private sourceFor(sourceId: string, voice: Voice): Tone.ToneAudioNode | null {
        if (sourceId.startsWith('lfo:')) {
            const id = sourceId.slice(4)
            const state = this.lfoStates.find(l => l.id === id)
            if (!state) return null
            return state.perVoice ? voice.sourceNode(sourceId) : (this.globalLFOs.get(id) ?? null)
        }
        const meta = MOD_SOURCE_META[sourceId as keyof typeof MOD_SOURCE_META]
        if (!meta) return null
        if (meta.perVoice) return voice.sourceNode(sourceId)
        return sourceId === 'modWheel' ? this.modWheel : this.random
    }

    /* -------------------------------------------------------------- */
    /* Allocation                                                      */
    /* -------------------------------------------------------------- */

    /**
     * Claim `count` voices: idle ones first, then whole groups oldest-first
     * with releasing groups preferred over held ones.
     */
    private claim(count: number): Voice[] {
        this.sweep()
        const claimed = this.voices.filter(v => v.note === null)
        if (claimed.length >= count) return claimed.slice(0, count)

        const ranked = [...this.groups.entries()].sort((a, b) => {
            const aReleasing = a[1].every(v => v.releasing) ? 0 : 1
            const bReleasing = b[1].every(v => v.releasing) ? 0 : 1
            if (aReleasing !== bReleasing) return aReleasing - bReleasing
            return Math.min(...a[1].map(v => v.startedAt)) - Math.min(...b[1].map(v => v.startedAt))
        })

        for (const [note, group] of ranked) {
            if (claimed.length >= count) break
            this.dropGroup(note)
            claimed.push(...group)
        }
        if (claimed.length >= count) return claimed.slice(0, count)

        // Last resort: voices released by allNotesOff that belong to no group
        // and are still ringing out. Nothing else can reach them, and without
        // this a fast enough mode change would leave nothing claimable at all.
        for (const voice of this.ungrouped()) {
            if (claimed.length >= count) break
            voice.reclaim()
            claimed.push(voice)
        }
        return claimed.slice(0, count)
    }

    /** Voices holding a note that no group owns — oldest first. */
    private ungrouped(): Voice[] {
        const grouped = new Set<Voice>()
        for (const group of this.groups.values()) for (const v of group) grouped.add(v)
        return this.voices
            .filter(v => v.note !== null && !grouped.has(v))
            .sort((a, b) => a.startedAt - b.startedAt)
    }

    /**
     * Return groups whose release tails have finished to the free pool, so a
     * new note reuses a spent voice instead of stealing a ringing one.
     */
    private sweep() {
        const now = Tone.now()
        // Iterate voices rather than groups: a voice released by allNotesOff
        // has no group to be found through, and scanning groups alone is how
        // those voices used to leak out of the pool for good.
        let reclaimed = false
        for (const voice of this.voices) {
            if (voice.note !== null && voice.isSpent(now)) {
                voice.reclaim()
                reclaimed = true
            }
        }
        if (!reclaimed) return
        // A group's voices are released together, so one reclaimed member
        // means the whole group is spent.
        for (const [note, group] of this.groups) {
            if (group.some(v => v.note === null)) this.groups.delete(note)
        }
    }

    /** Free a group's voices without a release tail — it's being stolen. */
    private dropGroup(note: number) {
        const group = this.groups.get(note)
        if (!group) return
        for (const v of group) v.reclaim()
        this.groups.delete(note)
    }

    /**
     * Spread a group across the unison field: voice i sits at position
     * -1..1, scaled by detune (cents) and stereo spread. A group of one
     * lands dead centre with no detune, so `unison: 1` costs nothing.
     */
    private spreadGroup(group: Voice[]) {
        const { detune, spread } = this.voiceState
        const n = group.length
        group.forEach((voice, i) => {
            const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
            voice.setUnison(t * (detune / 2), t * spread)
        })
    }

    /* -------------------------------------------------------------- */
    /* Playing                                                         */
    /* -------------------------------------------------------------- */

    noteOn(midi: number, velocity = 0.8) {
        const { mode, unison } = this.voiceState

        if (mode === 'poly') {
            // Same pitch already sounding: retrigger it rather than stacking a
            // second group and burning polyphony on a duplicate.
            this.dropGroup(midi)
            const group = this.claim(unison)
            if (group.length === 0) return
            this.groups.set(midi, group)
            this.spreadGroup(group)
            for (const v of group) v.trigger(midi, velocity)
            return
        }

        // mono / legato — one group, last-note priority
        this.held = this.held.filter(n => n !== midi)
        this.held.push(midi)

        const existing = [...this.groups.entries()][0]
        if (existing) {
            const [oldNote, group] = existing
            this.groups.delete(oldNote)
            this.groups.set(midi, group)
            // legato re-pitches through the glide without restarting the
            // envelopes; mono restarts them on every key.
            if (mode === 'legato') for (const v of group) v.retune(midi)
            else for (const v of group) v.trigger(midi, velocity)
            return
        }

        const group = this.claim(unison)
        if (group.length === 0) return
        this.groups.set(midi, group)
        this.spreadGroup(group)
        for (const v of group) v.trigger(midi, velocity)
    }

    noteOff(midi: number) {
        if (this.voiceState.mode === 'poly') {
            const group = this.groups.get(midi)
            if (!group) return
            for (const v of group) v.release()
            return
        }

        this.held = this.held.filter(n => n !== midi)
        const existing = [...this.groups.entries()][0]
        if (!existing) return
        const [current, group] = existing

        if (this.held.length === 0) {
            for (const v of group) v.release()
            return
        }
        // Fall back to the most recently pressed key still down.
        const next = this.held[this.held.length - 1]
        if (next === current) return
        this.groups.delete(current)
        this.groups.set(next, group)
        if (this.voiceState.mode === 'legato') for (const v of group) v.retune(next)
        else for (const v of group) v.trigger(next, 0.8)
    }

    /**
     * Release everything and forget the groups. The voices keep ringing out
     * and are recovered by `sweep` once spent, or claimed early by `claim`'s
     * last resort — they must never be simply dropped, or they leak.
     */
    allNotesOff() {
        for (const group of this.groups.values()) {
            for (const v of group) v.release()
        }
        this.groups.clear()
        this.held = []
    }

    /* -------------------------------------------------------------- */
    /* Patch application                                               */
    /* -------------------------------------------------------------- */

    applyOsc(which: 'a' | 'b', state: PatchState['oscA']) {
        for (const v of this.voices) v.setOsc(which, state)
    }

    applySub(state: PatchState['sub']) {
        for (const v of this.voices) v.setSub(state)
    }

    applyNoise(state: PatchState['noise']) {
        for (const v of this.voices) v.setNoise(state)
    }

    applyFilter(state: PatchState['filter']) {
        for (const v of this.voices) v.setFilter(state)
    }

    applyAmpEnv(state: PatchState['ampEnv']) {
        for (const v of this.voices) v.setAmpEnv(state)
    }

    applyModEnv(state: PatchState['modEnv']) {
        for (const v of this.voices) v.setModEnv(state)
    }

    applyVoice(state: VoiceState) {
        const previous = this.voiceState
        this.voiceState = state
        for (const v of this.voices) v.setGlide(state.glide)

        // Changing polyphony rules mid-note leaves groups that don't match the
        // new mode, so stop cleanly rather than stranding voices.
        if (previous.mode !== state.mode || previous.unison !== state.unison) {
            this.allNotesOff()
            return
        }
        for (const group of this.groups.values()) this.spreadGroup(group)
    }

    applyPatch(patch: PatchState) {
        this.applyOsc('a', patch.oscA)
        this.applyOsc('b', patch.oscB)
        this.applySub(patch.sub)
        this.applyNoise(patch.noise)
        this.applyFilter(patch.filter)
        this.applyAmpEnv(patch.ampEnv)
        this.applyModEnv(patch.modEnv)
        this.applyVoice(patch.voice)
        this.applyRandom(patch.random)
        this.applyLFOs(patch.lfos)
        this.applyRoutes(patch.modRoutes)
    }

    dispose() {
        this.randomClock.dispose()
        this.randomLoop.dispose()
        for (const lfo of this.globalLFOs.values()) lfo.dispose()
        this.globalLFOs.clear()
        for (const v of this.voices) v.dispose()
        this.modWheel.dispose()
        this.random.dispose()
        this.output.dispose()
        this.groups.clear()
    }
}
