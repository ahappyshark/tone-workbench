import { useContext, useSyncExternalStore } from 'react'
import { ParamRegistryContext } from '../context/paramRegistryContext'

export function useParamRegistry() {
    const ctx = useContext(ParamRegistryContext)
    if (!ctx) throw new Error('useParamRegistry must be used within a ParamRegistryProvider')
    return ctx
}

/**
 * Re-renders the caller whenever params are added or removed. LFO modules use
 * it to populate the target dropdown and to re-resolve a target that a preset
 * referenced before the owning patch had registered it.
 */
export function useParamRegistryVersion(): number {
    const { subscribe, getVersion } = useParamRegistry()
    return useSyncExternalStore(subscribe, getVersion)
}
