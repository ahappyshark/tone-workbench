import * as Tone from 'tone'
import { Voice } from './voice'
import { DEFAULT_PATCH, type PatchState, type VoiceState } from './patchTypes'

/** Fixed pool size. Not a control — rebuilding nodes mid-playback clicks. */
export const POLYPHONY = 16

/**
 * UI metadata for the destinations `SynthEngine.modTargets()` exposes.
 *
 * `filter.detune` is the musically useful one: it's in cents, so a given depth
 * sweeps the same number of octaves wherever the cutoff knob sits, unlike
 * `filter.cutoff` which is linear Hz.
 */
export const MOD_TARGET_META: Record<string, { label: string, min: number, max: number, unit?: string }> = {
    'filter.cutoff': { label: 'Filter Cutoff', min: 20, max: 18000, unit: 'Hz' },
    'filter.detune': { label: 'Filter Detune', min: -4800, max: 4800, unit: 'cents' },
    'filter.resonance': { label: 'Filter Resonance', min: 0.1, max: 20 },
    'oscA.detune': { label: 'Osc A Pitch', min: -1200, max: 1200, unit: 'cents' },
    'oscB.detune': { label: 'Osc B Pitch', min: -1200, max: 1200, unit: 'cents' },
    'amp.pan': { label: 'Pan', min: -1, max: 1 },
}

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

    constructor() {
        // 16 voices summing into one bus needs headroom; the master limiter
        // catches what's left.
        this.output = new Tone.Gain(0.25)
        this.voices = Array.from({ length: POLYPHONY }, () => {
            const voice = new Voice()
            voice.output.connect(this.output)
            return voice
        })
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
        return claimed.slice(0, count)
    }

    /**
     * Return groups whose release tails have finished to the free pool, so a
     * new note reuses a spent voice instead of stealing a ringing one.
     */
    private sweep() {
        const now = Tone.now()
        for (const [note, group] of this.groups) {
            if (group.every(v => v.isSpent(now))) this.dropGroup(note)
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

    allNotesOff() {
        for (const [note, group] of this.groups) {
            for (const v of group) v.release()
            this.groups.delete(note)
        }
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
    }

    /**
     * Modulation destinations, fanned out across the pool: one id maps to
     * POLYPHONY params, all of which a route connects to.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modTargets(): Map<string, (Tone.Param<any> | Tone.Signal<any>)[]> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const out = new Map<string, (Tone.Param<any> | Tone.Signal<any>)[]>()
        for (const voice of this.voices) {
            for (const [id, param] of Object.entries(voice.modTargets)) {
                const list = out.get(id)
                if (list) list.push(param)
                else out.set(id, [param])
            }
        }
        return out
    }

    dispose() {
        for (const v of this.voices) v.dispose()
        this.output.dispose()
        this.groups.clear()
    }
}
