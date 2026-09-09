import * as Tone from 'tone'
import { Ducker } from './ducker'
import { Ladder } from './ladder'
import { Resonator } from './resonator'
import { TapeEcho } from './tapeEcho'
import {
    FX_MOD_PARAMS,
    type FxParams,
    type FxSlot,
    type FxType,
} from './patchTypes'

/**
 * The global effects chain.
 *
 *   voices ─▶ input ─▶ slot 0 ─▶ slot 1 ─▶ … ─▶ output ─▶ master
 *
 * One chain after the voices are summed, not one per voice: sixteen reverbs
 * would melt the audio thread and nobody wants them anyway.
 *
 * Order is the patch's array order, so reordering the rack is a data change.
 * Rewiring is the one operation here that can click, so it only happens when
 * the *shape* of the chain changes — adding, removing, bypassing, reordering
 * or retyping a slot. Turning a knob never rewires anything.
 */

/**
 * An effect is not necessarily one node.
 *
 * Four of the five are a single Tone effect, where the thing upstream
 * connects to and the thing that connects onward are the same object. Shimmer
 * is a small patched network with a feedback loop inside it, so the chain has
 * to know its entry and exit separately. Keeping `entry`/`exit` for every
 * slot rather than special-casing is what makes the next composite effect a
 * new file instead of a new exception.
 */
type FxNode =
    | Tone.Distortion | Tone.Chorus | Tone.FeedbackDelay | Tone.Reverb
    | Ladder | Resonator | Ducker | TapeEcho

/** The composites, which have an entry and an exit rather than being one node. */
type Composite = Ladder | Resonator | Ducker | TapeEcho

function isComposite(node: FxNode): node is Composite {
    return node instanceof Ladder
        || node instanceof Resonator
        || node instanceof Ducker
        || node instanceof TapeEcho
}

/** Params that take modulation, and so are driven by a base signal. */
type ModParam = keyof FxParams | 'wet'

interface Slot {
    id: string
    type: FxType
    node: FxNode
    /**
     * Connecting anything to a Tone param zeroes it and marks it overridden,
     * after which writing `.value` does nothing at all. So every modulatable
     * param is fed by a base signal instead — the knob writes the base, the
     * mod routes sum on top. Same rule the voice already lives by.
     */
    bases: Map<ModParam, Tone.Signal<'number'>>
    /** routeId -> the depth gain wiring one source into one param */
    routes: Map<string, { gain: Tone.Gain, source: Tone.ToneAudioNode, destination: string }>
    /** last written values, so a knob drag doesn't rebuild anything */
    applied: Partial<Record<keyof FxParams, number>>
    /** pending reverb regeneration, cancelled if another change lands first */
    regenerate: ReturnType<typeof setTimeout> | null
    disposed: boolean
}

function createNode(type: FxType): FxNode {
    switch (type) {
        case 'drive':
            // 4x oversampling costs CPU but keeps the waveshaper from
            // folding aliases back down into the audible range.
            return new Tone.Distortion({ distortion: 0.4, oversample: '4x' })
        case 'chorus':
            return new Tone.Chorus().start()
        case 'delay':
            return new Tone.FeedbackDelay()
        case 'reverb':
            return new Tone.Reverb()
        case 'shimmer':
            return new Ladder('pitch')
        case 'shift':
            return new Ladder('shift')
        case 'resonator':
            return new Resonator()
        case 'duck':
            return new Ducker()
        case 'tape':
            return new TapeEcho()
    }
}

/** Where the chain connects into this effect. */
function entryOf(node: FxNode): Tone.ToneAudioNode {
    return isComposite(node) ? node.input : node
}

/** Where the chain carries on from. */
function exitOf(node: FxNode): Tone.ToneAudioNode {
    return isComposite(node) ? node.output : node
}

/** The audio-rate param behind one modulatable name, or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyParam = Tone.Param<any> | Tone.Signal<any>

function modParam(slot: Slot, param: ModParam): AnyParam | null {
    const node = slot.node
    if (node instanceof Ladder) {
        if (param === 'wet') return node.wet
        if (param === 'time') return node.time
        if (param === 'feedback') return node.feedback
        if (param === 'damp') return node.damping
        if (param === 'shift') return node.shift
        return null
    }
    if (node instanceof Resonator) {
        if (param === 'wet') return node.wet
        if (param === 'feedback') return node.resonance
        return null
    }
    if (node instanceof Ducker) {
        if (param === 'wet') return node.wet
        if (param === 'depth') return node.depthParam
        return null
    }
    if (node instanceof TapeEcho) {
        if (param === 'wet') return node.wet
        if (param === 'time') return node.time
        if (param === 'feedback') return node.feedback
        if (param === 'damp') return node.damping
        return null
    }
    if (param === 'wet') return node.wet
    if (node instanceof Tone.Chorus) {
        if (param === 'rate') return node.frequency
        if (param === 'feedback') return node.feedback
    }
    if (node instanceof Tone.FeedbackDelay) {
        if (param === 'time') return node.delayTime
        if (param === 'feedback') return node.feedback
    }
    return null
}

export class FxRack {
    readonly input: Tone.Gain
    readonly output: Tone.Gain

    private readonly slots = new Map<string, Slot>()
    /** ordered `id:type` of the slots currently in the signal path */
    private chain: string[] = []

    constructor() {
        this.input = new Tone.Gain(1)
        this.output = new Tone.Gain(1)
        this.input.connect(this.output)
    }

    /* -------------------------------------------------------------- */
    /* Patch application                                               */
    /* -------------------------------------------------------------- */

    apply(states: FxSlot[]) {
        const wanted = new Set(states.map(s => s.id))
        for (const [id, slot] of this.slots) {
            if (!wanted.has(id)) { this.disposeSlot(slot); this.slots.delete(id) }
        }

        for (const state of states) {
            let slot = this.slots.get(state.id)
            // A retyped slot is a different effect with different params, so
            // its node and every route into it are rebuilt from scratch.
            if (slot && slot.type !== state.type) {
                this.disposeSlot(slot)
                this.slots.delete(state.id)
                slot = undefined
            }
            if (!slot) {
                slot = {
                    id: state.id,
                    type: state.type,
                    node: createNode(state.type),
                    bases: new Map(),
                    routes: new Map(),
                    applied: {},
                    regenerate: null,
                    disposed: false,
                }
                for (const param of FX_MOD_PARAMS[state.type]) {
                    const target = modParam(slot, param)
                    if (!target) continue
                    const base = new Tone.Signal(0)
                    base.connect(target)
                    slot.bases.set(param, base)
                }
                this.slots.set(state.id, slot)
            }
            this.applyParams(slot, state)
        }

        // The signature carries the type as well as the id, because retyping a
        // slot builds a new node in place: the order is unchanged but the
        // thing at that position is a different object with no connections,
        // and skipping the rewire would leave the chain pointing at the node
        // that was just disposed.
        const next = states.filter(s => s.enabled).map(s => `${s.id}:${s.type}`)
        if (next.join(',') !== this.chain.join(',')) {
            this.chain = next
            this.rewire()
        }
    }

    private applyParams(slot: Slot, state: FxSlot) {
        const wetBase = slot.bases.get('wet')
        if (wetBase) wetBase.value = state.wet
        const p = state.params

        switch (slot.type) {
            case 'drive': {
                // Not a param — assigning it rebuilds a waveshaper curve, so
                // only do it when the value actually moved.
                if (slot.applied.drive !== p.drive) {
                    (slot.node as Tone.Distortion).distortion = p.drive
                    slot.applied.drive = p.drive
                }
                break
            }
            case 'chorus': {
                const node = slot.node as Tone.Chorus
                this.setBase(slot, 'rate', p.rate)
                this.setBase(slot, 'feedback', p.feedback)
                if (slot.applied.depth !== p.depth) { node.depth = p.depth; slot.applied.depth = p.depth }
                if (slot.applied.spread !== p.spread) { node.spread = p.spread; slot.applied.spread = p.spread }
                break
            }
            case 'delay': {
                this.setBase(slot, 'time', p.time)
                this.setBase(slot, 'feedback', p.feedback)
                break
            }
            case 'shift':
            case 'shimmer': {
                const node = slot.node as Ladder
                this.setBase(slot, 'time', p.time)
                this.setBase(slot, 'feedback', p.feedback)
                this.setBase(slot, 'damp', p.damp)
                if (node.kind === 'shift') this.setBase(slot, 'shift', p.shift)
                else if (slot.applied.pitch !== p.pitch) {
                    node.pitch = p.pitch
                    slot.applied.pitch = p.pitch
                }
                // Same offline impulse-response render as a plain reverb, and
                // debounced for the same reason.
                if (slot.applied.decay !== p.decay || slot.applied.preDelay !== p.preDelay) {
                    slot.applied.decay = p.decay
                    slot.applied.preDelay = p.preDelay
                    if (slot.regenerate) clearTimeout(slot.regenerate)
                    slot.regenerate = setTimeout(() => {
                        slot.regenerate = null
                        if (slot.disposed) return
                        node.setDecay(p.decay, p.preDelay).catch(() => { /* superseded */ })
                    }, 120)
                }
                break
            }
            case 'resonator': {
                const node = slot.node as Resonator
                this.setBase(slot, 'feedback', p.feedback)
                if (slot.applied.damp !== p.damp) {
                    node.setDamping(p.damp)
                    slot.applied.damp = p.damp
                }
                if (slot.applied.tune !== p.tune || slot.applied.voicing !== p.voicing) {
                    slot.applied.tune = p.tune
                    slot.applied.voicing = p.voicing
                    node.setTuning(p.tune, Math.round(p.voicing))
                }
                break
            }
            case 'tape': {
                const node = slot.node as TapeEcho
                this.setBase(slot, 'time', p.time)
                this.setBase(slot, 'feedback', p.feedback)
                this.setBase(slot, 'damp', p.damp)
                node.setDrive(p.drive)
                if (slot.applied.rate !== p.rate || slot.applied.depth !== p.depth) {
                    slot.applied.rate = p.rate
                    slot.applied.depth = p.depth
                    node.setWow(p.rate, p.depth)
                }
                break
            }
            case 'duck': {
                const node = slot.node as Ducker
                this.setBase(slot, 'depth', p.depth)
                if (slot.applied.time !== p.time) {
                    node.setRecovery(p.time)
                    slot.applied.time = p.time
                }
                if (slot.applied.decay !== p.decay || slot.applied.preDelay !== p.preDelay) {
                    slot.applied.decay = p.decay
                    slot.applied.preDelay = p.preDelay
                    if (slot.regenerate) clearTimeout(slot.regenerate)
                    slot.regenerate = setTimeout(() => {
                        slot.regenerate = null
                        if (slot.disposed) return
                        node.setDecay(p.decay, p.preDelay).catch(() => { /* superseded */ })
                    }, 120)
                }
                break
            }
            case 'reverb': {
                // decay and preDelay re-render an impulse response offline,
                // which is far too expensive to do on every frame of a knob
                // drag. Coalesce to one render after the drag settles.
                if (slot.applied.decay !== p.decay || slot.applied.preDelay !== p.preDelay) {
                    slot.applied.decay = p.decay
                    slot.applied.preDelay = p.preDelay
                    if (slot.regenerate) clearTimeout(slot.regenerate)
                    slot.regenerate = setTimeout(() => {
                        slot.regenerate = null
                        if (slot.disposed) return
                        const node = slot.node as Tone.Reverb
                        node.decay = p.decay
                        node.preDelay = p.preDelay
                        // The render is async and the slot may be gone by the
                        // time it lands; a rejected promise here is expected.
                        node.ready.catch(() => { /* superseded or disposed */ })
                    }, 120)
                }
                break
            }
        }
    }

    /**
     * Rebuild the signal path. Everything is disconnected first, including
     * bypassed slots, so a slot that just left the chain can't leave a stale
     * connection behind feeding audio forward.
     */
    private rewire() {
        this.input.disconnect()
        for (const slot of this.slots.values()) exitOf(slot.node).disconnect()

        let previous: Tone.ToneAudioNode = this.input
        for (const item of this.chain) {
            const slot = this.slots.get(item.slice(0, item.lastIndexOf(':')))
            if (!slot) continue
            previous.connect(entryOf(slot.node))
            previous = exitOf(slot.node)
        }
        previous.connect(this.output)
    }

    /* -------------------------------------------------------------- */
    /* Modulation                                                      */
    /* -------------------------------------------------------------- */

    private setBase(slot: Slot, param: ModParam, value: number) {
        const base = slot.bases.get(param)
        if (base) base.value = value
    }

    /** Resolve an `fx:<slotId>:<param>` destination to its live param. */
    destinationParam(destination: string): AnyParam | null {
        if (!destination.startsWith('fx:')) return null
        const rest = destination.slice(3)
        const split = rest.lastIndexOf(':')
        if (split === -1) return null
        const slot = this.slots.get(rest.slice(0, split))
        if (!slot) return null
        const param = rest.slice(split + 1) as ModParam
        if (!slot.bases.has(param)) return null
        return modParam(slot, param)
    }

    setRoute(routeId: string, source: Tone.ToneAudioNode | null, destination: string, amount: number) {
        const target = this.destinationParam(destination)
        const slot = this.slotFor(destination)
        if (!source || !target || !slot) {
            this.clearRoute(routeId)
            return
        }
        const existing = slot.routes.get(routeId)
        if (existing && existing.source === source && existing.destination === destination) {
            // Only the depth moved, so reuse the gain rather than churning
            // audio nodes under a knob drag.
            existing.gain.gain.value = amount
            return
        }
        this.clearRoute(routeId)
        const gain = new Tone.Gain(amount)
        source.connect(gain)
        gain.connect(target)
        slot.routes.set(routeId, { gain, source, destination })
    }

    clearRoute(routeId: string) {
        for (const slot of this.slots.values()) {
            const route = slot.routes.get(routeId)
            if (!route) continue
            try { route.source.disconnect(route.gain) } catch { /* already gone */ }
            route.gain.dispose()
            slot.routes.delete(routeId)
        }
    }

    /**
     * Route ids currently wired, so the engine can drop the ones a patch no
     * longer contains.
     */
    routeIds(): string[] {
        const ids: string[] = []
        for (const slot of this.slots.values()) ids.push(...slot.routes.keys())
        return ids
    }

    private slotFor(destination: string): Slot | null {
        if (!destination.startsWith('fx:')) return null
        const rest = destination.slice(3)
        const split = rest.lastIndexOf(':')
        return split === -1 ? null : (this.slots.get(rest.slice(0, split)) ?? null)
    }

    /* -------------------------------------------------------------- */

    private disposeSlot(slot: Slot) {
        slot.disposed = true
        if (slot.regenerate) clearTimeout(slot.regenerate)
        for (const route of slot.routes.values()) {
            try { route.source.disconnect(route.gain) } catch { /* already gone */ }
            route.gain.dispose()
        }
        slot.routes.clear()
        for (const base of slot.bases.values()) base.dispose()
        slot.bases.clear()
        slot.node.dispose()
    }

    dispose() {
        for (const slot of this.slots.values()) this.disposeSlot(slot)
        this.slots.clear()
        this.input.dispose()
        this.output.dispose()
    }
}
