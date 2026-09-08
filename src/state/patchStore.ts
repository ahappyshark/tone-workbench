import { useMemo, useSyncExternalStore } from 'react'
import {
    DEFAULT_PATCH,
    createLFO,
    type LFOState,
    type PatchState,
    type SynthState,
} from '../audio/patchTypes'

/**
 * The single source of truth for the current patch.
 *
 * Deliberately a module singleton rather than a context: there is one audio
 * graph, and keeping it outside React means a knob drag can't re-render the
 * tree above it (which is what was retriggering notes before).
 *
 * Updates are immutable and replace only the slice that changed, so
 * useSyncExternalStore snapshots stay reference-stable for untouched slices.
 */

type Listener = () => void

let patch: PatchState = DEFAULT_PATCH
const listeners = new Set<Listener>()

function setPatch(next: PatchState) {
    patch = next
    for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export function getPatch(): PatchState {
    return patch
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export function setSynthParam<K extends keyof SynthState>(key: K, value: SynthState[K]) {
    if (patch.synth[key] === value) return
    setPatch({ ...patch, synth: { ...patch.synth, [key]: value } })
}

export function updateLFO(id: string, changes: Partial<Omit<LFOState, 'id'>>) {
    const current = patch.lfos.find(l => l.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    setPatch({ ...patch, lfos: patch.lfos.map(l => (l.id === id ? { ...l, ...changes } : l)) })
}

export function addLFO(): string {
    // Timestamp-based so ids survive a preset load without colliding with
    // whatever ids the loaded patch brought with it.
    let id = `lfo-${Date.now().toString(36)}`
    let n = 0
    while (patch.lfos.some(l => l.id === id)) id = `lfo-${Date.now().toString(36)}-${n++}`
    setPatch({ ...patch, lfos: [...patch.lfos, createLFO(id)] })
    return id
}

export function removeLFO(id: string) {
    if (!patch.lfos.some(l => l.id === id)) return
    setPatch({ ...patch, lfos: patch.lfos.filter(l => l.id !== id) })
}

export function setPatchName(name: string) {
    if (patch.name === name) return
    setPatch({ ...patch, name })
}

/** Replace the entire patch. Expects an already-coerced PatchState. */
export function loadPatch(next: PatchState) {
    setPatch(next)
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useSynthState(): SynthState {
    return useSyncExternalStore(subscribe, () => patch.synth)
}

export function useLFOState(id: string): LFOState | undefined {
    return useSyncExternalStore(subscribe, () => patch.lfos.find(l => l.id === id))
}

/**
 * Just the ids, so the rack only re-renders when LFOs are added or removed —
 * not on every knob turn inside one. Snapshots must be reference-stable, so
 * we compare a joined string and rebuild the array behind a memo.
 */
export function useLFOIds(): string[] {
    const key = useSyncExternalStore(subscribe, () => patch.lfos.map(l => l.id).join(','))
    return useMemo(() => (key ? key.split(',') : []), [key])
}

export function usePatchName(): string {
    return useSyncExternalStore(subscribe, () => patch.name)
}
