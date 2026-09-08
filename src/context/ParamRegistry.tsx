import { useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { ParamRegistryContext, type RegisteredParam } from './paramRegistryContext'

export function ParamRegistryProvider({ children }: { children: ReactNode }) {
    const registry = useRef<Map<string, RegisteredParam>>(new Map())
    // Contents live in a ref (they're audio nodes, not render data), so a
    // version counter is what subscribers actually diff on.
    const version = useRef(0)
    const listeners = useRef<Set<() => void>>(new Set())

    const emit = useCallback(() => {
        version.current++
        for (const l of listeners.current) l()
    }, [])

    const register = useCallback((id: string, param: RegisteredParam) => {
        registry.current.set(id, param)
        emit()
    }, [emit])

    const unregister = useCallback((id: string) => {
        if (registry.current.delete(id)) emit()
    }, [emit])

    const getAll = useCallback(() => {
        return registry.current
    }, [])

    const subscribe = useCallback((listener: () => void) => {
        listeners.current.add(listener)
        return () => { listeners.current.delete(listener) }
    }, [])

    const getVersion = useCallback(() => version.current, [])

    const value = useMemo(
        () => ({ register, unregister, getAll, subscribe, getVersion }),
        [register, unregister, getAll, subscribe, getVersion]
    )

    return (
        <ParamRegistryContext.Provider value={value}>
            {children}
        </ParamRegistryContext.Provider>
    )
}
