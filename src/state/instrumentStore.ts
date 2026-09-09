import type {
    FxParams,
    FxSlot,
    LFOState,
    ModDestinationMeta,
    ModRoute,
    RandomState,
} from '../audio/patchTypes'

/**
 * What the shared racks need from whichever instrument they're showing.
 *
 * The FX rack, the LFO rack and the mod matrix are the same controls for both
 * instruments — the same effect slots, the same sources, the same route rows.
 * Only the store behind them differs, so they take one of these rather than
 * importing a particular store and quietly becoming single-instrument.
 *
 * The `use*` members are hooks, so they follow the rules of hooks: call them
 * unconditionally at the top of a component. Both implementations are module
 * singletons, so the object identity never changes between renders.
 */
export interface InstrumentStore {
    /** shown on the racks, and used to key stored presets */
    readonly label: string

    useFxIds(): string[]
    useFxSlot(id: string): FxSlot | undefined
    addFx(): string
    removeFx(id: string): void
    updateFx(id: string, changes: Partial<Omit<FxSlot, 'id' | 'params'>>): void
    setFxParam<K extends keyof FxParams>(id: string, key: K, value: FxParams[K]): void
    moveFx(id: string, delta: -1 | 1): void

    useLFOIds(): string[]
    useLFOState(id: string): LFOState | undefined
    useLFOs(): LFOState[]
    addLFO(): string
    removeLFO(id: string): void
    updateLFO(id: string, changes: Partial<Omit<LFOState, 'id'>>): void
    /** false where a per-voice LFO makes no sense, so the toggle is hidden */
    readonly perVoiceLFOs: boolean

    useRouteIds(): string[]
    useRoute(id: string): ModRoute | undefined
    useRoutes(): ModRoute[]
    addRoute(): string
    removeRoute(id: string): void
    updateRoute(id: string, changes: Partial<Omit<ModRoute, 'id'>>): void

    /** The random source lives in the matrix but belongs to the patch. */
    useRandom(): RandomState
    setRandom<K extends keyof RandomState>(key: K, value: RandomState[K]): void

    /** Every destination this instrument currently offers, keyed by id. */
    useDestinations(): Record<string, ModDestinationMeta>
    /** Why a route is dead, or null if it isn't. */
    useRouteWarning(route: ModRoute): string | null
}
