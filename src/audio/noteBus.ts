/**
 * Where notes come from, and where they go.
 *
 * There are now two instruments and, shortly, more than one thing generating
 * notes: the computer keyboard, a MIDI port, and the generative harmonizer.
 * Wiring each source to each instrument directly is a grid that grows the
 * wrong way, so everything meets here instead.
 *
 * A module singleton rather than context, for the same reason `patchStore` is:
 * the harmonizer is a clock callback, not a component, and it must be able to
 * play a note without a render happening first.
 */

export type InstrumentId = 'shark' | 'grain'

export interface InstrumentHandle {
    noteOn(midi: number, velocity: number): void
    noteOff(midi: number): void
    controlChange(cc: number, value: number): void
    pitchBend(position: number): void
    allNotesOff(): void
}

type Listener = () => void

class NoteBus {
    private readonly handles = new Map<InstrumentId, InstrumentHandle>()
    private targets: InstrumentId[] = ['shark']
    private readonly listeners = new Set<Listener>()

    /**
     * Which instruments each sounding note actually reached.
     *
     * Without this, retargeting while a key is held sends the note-off to the
     * wrong instrument and the old one drones until the page reloads.
     */
    private readonly routed = new Map<number, InstrumentId[]>()

    register(id: InstrumentId, handle: InstrumentHandle) {
        this.handles.set(id, handle)
    }

    unregister(id: InstrumentId) {
        this.handles.delete(id)
    }

    getTargets(): InstrumentId[] {
        return this.targets
    }

    setTargets(ids: InstrumentId[]) {
        if (ids.length === this.targets.length && ids.every((id, i) => this.targets[i] === id)) return
        // Anything sounding was routed under the old set and is now
        // unreachable by a note-off, so let it go rather than strand it.
        for (const id of this.targets) this.handles.get(id)?.allNotesOff()
        this.routed.clear()
        this.targets = ids
        for (const l of this.listeners) l()
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    noteOn(midi: number, velocity = 0.8) {
        const reached: InstrumentId[] = []
        for (const id of this.targets) {
            const handle = this.handles.get(id)
            if (!handle) continue
            handle.noteOn(midi, velocity)
            reached.push(id)
        }
        this.routed.set(midi, reached)
    }

    noteOff(midi: number) {
        const reached = this.routed.get(midi) ?? this.targets
        for (const id of reached) this.handles.get(id)?.noteOff(midi)
        this.routed.delete(midi)
    }

    /** Wheels and pedals go everywhere, whatever the note targets are. */
    controlChange(cc: number, value: number) {
        for (const handle of this.handles.values()) handle.controlChange(cc, value)
    }

    pitchBend(position: number) {
        for (const handle of this.handles.values()) handle.pitchBend(position)
    }

    allNotesOff() {
        for (const handle of this.handles.values()) handle.allNotesOff()
        this.routed.clear()
    }
}

export const noteBus = new NoteBus()
