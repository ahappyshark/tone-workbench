import { useMemo, useSyncExternalStore } from 'react'
import {
    DEFAULT_GRAIN_PATCH,
    createGrainFx,
    createGrainLFO,
    createGrainRoute,
    grainDestinations,
    isGrainRouteLive,
    type GrainPatchState,
} from '../audio/grainTypes'
import type {
    FxParams,
    FxSlot,
    LFOState,
    ModDestinationMeta,
    ModRoute,
} from '../audio/patchTypes'
import type { InstrumentStore } from './instrumentStore'

/**
 * The grain instrument's patch, kept exactly the way `patchStore` keeps the
 * synth's: a module singleton outside React, updated immutably one section at
 * a time so untouched sections stay reference-stable and a knob drag can't
 * re-render the tree above it.
 *
 * Deliberately a second store rather than a second key in the first one. The
 * two instruments share no state at all, and OPEN-QUESTIONS #9 is about
 * multi-timbral *instances of one instrument*, which is a different problem.
 */

type Listener = () => void

export type GrainSectionKey = 'grain' | 'filter' | 'ampEnv' | 'modEnv' | 'voice' | 'random'

let patch: GrainPatchState = structuredClone(DEFAULT_GRAIN_PATCH)
const listeners = new Set<Listener>()

function setPatch(next: GrainPatchState) {
    patch = next
    for (const l of listeners) l()
}

function subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}

export function getGrainPatch(): GrainPatchState {
    return patch
}

export function loadGrainPatch(next: GrainPatchState) {
    setPatch(next)
}

export function setGrainPatchName(name: string) {
    if (patch.name === name) return
    setPatch({ ...patch, name })
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export function setGrainParam<S extends GrainSectionKey, K extends keyof GrainPatchState[S]>(
    section: S,
    key: K,
    value: GrainPatchState[S][K],
) {
    const current = patch[section]
    if (current[key] === value) return
    setPatch({ ...patch, [section]: { ...current, [key]: value } })
}

export function useGrainSection<S extends GrainSectionKey>(section: S): GrainPatchState[S] {
    return useSyncExternalStore(subscribe, () => patch[section])
}

export function useGrainPatchName(): string {
    return useSyncExternalStore(subscribe, () => patch.name)
}

/** The full effect chain, for the engine bridge. */
export function useGrainFx(): FxSlot[] {
    return useSyncExternalStore(subscribe, () => patch.fx)
}

export function useGrainPatch(): GrainPatchState {
    return useSyncExternalStore(subscribe, getGrainPatch)
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

function freshId(prefix: string, taken: (id: string) => boolean): string {
    let id = `${prefix}-${Date.now().toString(36)}`
    let n = 0
    while (taken(id)) id = `${prefix}-${Date.now().toString(36)}-${n++}`
    return id
}

function addFx(): string {
    const id = freshId('gfx', candidate => patch.fx.some(f => f.id === candidate))
    setPatch({ ...patch, fx: [...patch.fx, createGrainFx(id)] })
    return id
}

function removeFx(id: string) {
    if (!patch.fx.some(f => f.id === id)) return
    setPatch({
        ...patch,
        fx: patch.fx.filter(f => f.id !== id),
        modRoutes: patch.modRoutes.filter(r => !r.destination.startsWith(`fx:${id}:`)),
    })
}

function updateFx(id: string, changes: Partial<Omit<FxSlot, 'id' | 'params'>>) {
    const current = patch.fx.find(f => f.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    const routes = changes.type && changes.type !== current.type
        ? patch.modRoutes.filter(r => !r.destination.startsWith(`fx:${id}:`))
        : patch.modRoutes
    setPatch({
        ...patch,
        fx: patch.fx.map(f => (f.id === id ? { ...f, ...changes } : f)),
        modRoutes: routes,
    })
}

function setFxParam<K extends keyof FxParams>(id: string, key: K, value: FxParams[K]) {
    const current = patch.fx.find(f => f.id === id)
    if (!current || current.params[key] === value) return
    setPatch({
        ...patch,
        fx: patch.fx.map(f => (f.id === id ? { ...f, params: { ...f.params, [key]: value } } : f)),
    })
}

function moveFx(id: string, delta: -1 | 1) {
    const index = patch.fx.findIndex(f => f.id === id)
    const target = index + delta
    if (index === -1 || target < 0 || target >= patch.fx.length) return
    const next = [...patch.fx]
    ;[next[index], next[target]] = [next[target], next[index]]
    setPatch({ ...patch, fx: next })
}

/* ------------------------------------------------------------------ */
/* LFOs and routes                                                     */
/* ------------------------------------------------------------------ */

function addLFO(): string {
    const id = freshId('glfo', candidate => patch.lfos.some(l => l.id === candidate))
    setPatch({ ...patch, lfos: [...patch.lfos, createGrainLFO(id)] })
    return id
}

function removeLFO(id: string) {
    if (!patch.lfos.some(l => l.id === id)) return
    setPatch({
        ...patch,
        lfos: patch.lfos.filter(l => l.id !== id),
        modRoutes: patch.modRoutes.filter(r => r.source !== `lfo:${id}`),
    })
}

function updateLFO(id: string, changes: Partial<Omit<LFOState, 'id'>>) {
    const current = patch.lfos.find(l => l.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    setPatch({ ...patch, lfos: patch.lfos.map(l => (l.id === id ? { ...l, ...changes } : l)) })
}

function addRoute(): string {
    const id = freshId('groute', candidate => patch.modRoutes.some(r => r.id === candidate))
    setPatch({
        ...patch,
        // Position is the destination that makes granular sound like granular,
        // so a fresh row already points somewhere worth hearing.
        modRoutes: [...patch.modRoutes, { ...createGrainRoute(id), destination: 'grain.position' }],
    })
    return id
}

function removeRoute(id: string) {
    if (!patch.modRoutes.some(r => r.id === id)) return
    setPatch({ ...patch, modRoutes: patch.modRoutes.filter(r => r.id !== id) })
}

function updateRoute(id: string, changes: Partial<Omit<ModRoute, 'id'>>) {
    const current = patch.modRoutes.find(r => r.id === id)
    if (!current) return
    const keys = Object.keys(changes) as (keyof typeof changes)[]
    if (keys.every(k => current[k] === changes[k])) return
    setPatch({ ...patch, modRoutes: patch.modRoutes.map(r => (r.id === id ? { ...r, ...changes } : r)) })
}

/* ------------------------------------------------------------------ */
/* The shared-rack adapter                                             */
/* ------------------------------------------------------------------ */

function useIdList(read: () => string[]): string[] {
    // Snapshots must be reference-stable, so compare a joined string and
    // rebuild the array behind a memo.
    const key = useSyncExternalStore(subscribe, () => read().join(','))
    return useMemo(() => (key ? key.split(',') : []), [key])
}

export const grainStore: InstrumentStore = {
    label: 'Grain',

    useFxIds: () => useIdList(() => patch.fx.map(f => f.id)),
    useFxSlot: (id) => useSyncExternalStore(subscribe, () => patch.fx.find(f => f.id === id)),
    addFx,
    removeFx,
    updateFx,
    setFxParam,
    moveFx,

    useLFOIds: () => useIdList(() => patch.lfos.map(l => l.id)),
    useLFOState: (id) => useSyncExternalStore(subscribe, () => patch.lfos.find(l => l.id === id)),
    useLFOs: () => useSyncExternalStore(subscribe, () => patch.lfos),
    addLFO,
    removeLFO,
    updateLFO,
    // One cloud per voice already varies per note through spray and jitter,
    // and a per-voice LFO couldn't reach a grain param without an analyser
    // per voice. See GrainPatchState.lfos.
    perVoiceLFOs: false,

    useRouteIds: () => useIdList(() => patch.modRoutes.map(r => r.id)),
    useRoute: (id) => useSyncExternalStore(subscribe, () => patch.modRoutes.find(r => r.id === id)),
    useRoutes: () => useSyncExternalStore(subscribe, () => patch.modRoutes),
    addRoute,
    removeRoute,
    updateRoute,

    useRandom: () => useSyncExternalStore(subscribe, () => patch.random),
    setRandom: (key, value) => setGrainParam('random', key, value),

    useDestinations(): Record<string, ModDestinationMeta> {
        const fx = useSyncExternalStore(subscribe, () => patch.fx)
        return useMemo(() => grainDestinations(fx), [fx])
    },

    useRouteWarning(route: ModRoute): string | null {
        const fx = useSyncExternalStore(subscribe, () => patch.fx)
        return isGrainRouteLive(route, fx)
            ? null
            : 'inactive — an effect param is shared, so it needs a source there is only one of'
    },
}

export { subscribe as subscribeToGrainPatch }
