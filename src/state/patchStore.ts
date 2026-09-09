import { useMemo, useSyncExternalStore } from 'react'
import {
    DEFAULT_PATCH,
    createFx,
    createLFO,
    createRoute,
    isRouteLive,
    FX_TYPE_DEFAULTS,
    modDestinations,
    type FxParams,
    type FxSlot,
    type LFOState,
    type ModDestinationMeta,
    type ModRoute,
    type PatchState,
} from '../audio/patchTypes'
import type { InstrumentStore } from './instrumentStore'

/**
 * The single source of truth for the current patch.
 *
 * Deliberately a module singleton rather than a context: there is one audio
 * graph, and keeping it outside React means a knob drag can't re-render the
 * tree above it (which is what was retriggering notes before).
 *
 * Updates are immutable and replace only the section that changed, so
 * useSyncExternalStore snapshots stay reference-stable for untouched sections
 * — that's what keeps a filter tweak from re-running the oscillator effects.
 */

type Listener = () => void

/** The patch sections that hold plain parameter records. */
export type SectionKey = 'oscA' | 'oscB' | 'sub' | 'noise' | 'filter' | 'ampEnv' | 'modEnv' | 'voice' | 'random'

let patch: PatchState = structuredClone(DEFAULT_PATCH)
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

export function setParam<S extends SectionKey, K extends keyof PatchState[S]>(
    section: S,
    key: K,
    value: PatchState[S][K],
) {
    const current = patch[section]
    if (current[key] === value) return
    setPatch({ ...patch, [section]: { ...current, [key]: value } })
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
    // Routes fed by this LFO would point at a source that no longer exists.
    setPatch({
        ...patch,
        lfos: patch.lfos.filter(l => l.id !== id),
        modRoutes: patch.modRoutes.filter(r => r.source !== `lfo:${id}`),
    })
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export function addFx(): string {
    let id = `fx-${Date.now().toString(36)}`
    let n = 0
    while (patch.fx.some(f => f.id === id)) id = `fx-${Date.now().toString(36)}-${n++}`
    setPatch({ ...patch, fx: [...patch.fx, createFx(id)] })
    return id
}

export function removeFx(id: string) {
    if (!patch.fx.some(f => f.id === id)) return
    // Routes aimed at this slot's params would point at nothing.
    setPatch({
        ...patch,
        fx: patch.fx.filter(f => f.id !== id),
        modRoutes: patch.modRoutes.filter(r => !r.destination.startsWith(`fx:${id}:`)),
    })
}

export function updateFx(id: string, changes: Partial<Omit<FxSlot, 'id' | 'params'>>) {
    const current = patch.fx.find(f => f.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    // Changing type changes which params exist, so routes into the old ones go.
    const retyped = changes.type !== undefined && changes.type !== current.type
    const routes = retyped
        ? patch.modRoutes.filter(r => !r.destination.startsWith(`fx:${id}:`))
        : patch.modRoutes
    // A newly chosen type gets its own starting points, but only the params
    // that type actually uses — the rest stay as the slot left them, which is
    // the whole reason the params record is flat.
    const seed = retyped ? FX_TYPE_DEFAULTS[changes.type!] : undefined
    setPatch({
        ...patch,
        fx: patch.fx.map(f => (f.id === id
            ? { ...f, ...changes, params: seed ? { ...f.params, ...seed } : f.params }
            : f)),
        modRoutes: routes,
    })
}

export function setFxParam<K extends keyof FxParams>(id: string, key: K, value: FxParams[K]) {
    const current = patch.fx.find(f => f.id === id)
    if (!current || current.params[key] === value) return
    setPatch({
        ...patch,
        fx: patch.fx.map(f => (f.id === id ? { ...f, params: { ...f.params, [key]: value } } : f)),
    })
}

/** Move a slot one place along the chain. Order is the signal path. */
export function moveFx(id: string, delta: -1 | 1) {
    const index = patch.fx.findIndex(f => f.id === id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= patch.fx.length) return
    const next = [...patch.fx]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPatch({ ...patch, fx: next })
}

export function addRoute(): string {
    let id = `route-${Date.now().toString(36)}`
    let n = 0
    while (patch.modRoutes.some(r => r.id === id)) id = `route-${Date.now().toString(36)}-${n++}`
    setPatch({ ...patch, modRoutes: [...patch.modRoutes, createRoute(id)] })
    return id
}

export function updateRoute(id: string, changes: Partial<Omit<ModRoute, 'id'>>) {
    const current = patch.modRoutes.find(r => r.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    setPatch({ ...patch, modRoutes: patch.modRoutes.map(r => (r.id === id ? { ...r, ...changes } : r)) })
}

export function removeRoute(id: string) {
    if (!patch.modRoutes.some(r => r.id === id)) return
    setPatch({ ...patch, modRoutes: patch.modRoutes.filter(r => r.id !== id) })
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

export function useSection<S extends SectionKey>(section: S): PatchState[S] {
    return useSyncExternalStore(subscribe, () => patch[section])
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

export function useFxSlot(id: string): FxSlot | undefined {
    return useSyncExternalStore(subscribe, () => patch.fx.find(f => f.id === id))
}

/** Ids only, so a knob inside one slot doesn't re-render the whole rack. */
export function useFxIds(): string[] {
    const key = useSyncExternalStore(subscribe, () => patch.fx.map(f => f.id).join(','))
    return useMemo(() => (key ? key.split(',') : []), [key])
}

/** The full chain — for the engine bridge and the matrix's destination list. */
export function useFx(): FxSlot[] {
    return useSyncExternalStore(subscribe, () => patch.fx)
}

export function useRoute(id: string): ModRoute | undefined {
    return useSyncExternalStore(subscribe, () => patch.modRoutes.find(r => r.id === id))
}

/** Ids only, so a depth knob doesn't re-render the whole matrix. */
export function useRouteIds(): string[] {
    const key = useSyncExternalStore(subscribe, () => patch.modRoutes.map(r => r.id).join(','))
    return useMemo(() => (key ? key.split(',') : []), [key])
}

/** The full route list, for the engine bridge. */
export function useSyncedRoutes(): ModRoute[] {
    return useSyncExternalStore(subscribe, () => patch.modRoutes)
}

/** The full LFO list, for the matrix's source dropdown. */
export function useLFOs(): LFOState[] {
    return useSyncExternalStore(subscribe, () => patch.lfos)
}

export function usePatchName(): string {
    return useSyncExternalStore(subscribe, () => patch.name)
}

/** Fires on any patch change. For the engine bridge, which needs all of it. */
export function usePatch(): PatchState {
    return useSyncExternalStore(subscribe, getPatch)
}

export { subscribe as subscribeToPatch }

/* ------------------------------------------------------------------ */
/* The shared-rack adapter                                             */
/* ------------------------------------------------------------------ */

/**
 * This store, seen through the interface the FX rack, LFO rack and mod matrix
 * take. They render either instrument, so they can't import a store directly.
 */
export const sharkStore: InstrumentStore = {
    label: 'Shark Synth',

    useFxIds,
    useFxSlot,
    addFx,
    removeFx,
    updateFx,
    setFxParam,
    moveFx,

    useLFOIds,
    useLFOState,
    useLFOs,
    addLFO,
    removeLFO,
    updateLFO,
    perVoiceLFOs: true,

    useRouteIds,
    useRoute,
    useRoutes: useSyncedRoutes,
    addRoute,
    removeRoute,
    updateRoute,

    useRandom: () => useSection('random'),
    setRandom: (key, value) => setParam('random', key, value),

    useDestinations(): Record<string, ModDestinationMeta> {
        const fx = useFx()
        return useMemo(() => modDestinations(fx), [fx])
    },

    useRouteWarning(route: ModRoute): string | null {
        const fx = useFx()
        const lfos = useLFOs()
        return isRouteLive(route, fx, lfos)
            ? null
            : 'inactive — an effect param is global, so it needs a source there is only one of'
    },
}
