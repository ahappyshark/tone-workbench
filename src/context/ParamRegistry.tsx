import { createContext, useContext, useRef, useCallback } from 'react'
import type { ReactNode } from 'react';
import * as Tone from 'tone'

export interface RegisteredParam { 
    label: string
    signal: Tone.ToneAudioNode | Tone.Signal<any> | Tone.Param<any>
}

interface ParamRegistryContextType {
    register: (id: string, param: RegisteredParam) => void
    unregister: (id: string) => void
    getAll: () => Map<string, RegisteredParam>
}

const ParamRegistryContext = createContext<ParamRegistryContextType | null>(null)

export function ParamRegistryProvider({ children }: { children: ReactNode }) {
    const registry = useRef<Map<string, RegisteredParam>>(new Map())

    const register = useCallback((id: string, param: RegisteredParam) => {
        registry.current.set(id, param)
    }, [])

    const unregister = useCallback((id: string) => {
        registry.current.delete(id)
    }, [])

    const getAll = useCallback(() => {
        return registry.current
    }, [])

    return (
        <ParamRegistryContext.Provider value={{ register, unregister, getAll }}>
            {children}
        </ParamRegistryContext.Provider>
    )
}

export function useParamRegistry() {
    const ctx = useContext(ParamRegistryContext)
    if (!ctx) throw new Error('useParamRegistry must be used within a ParamRegistryProvider')
    return ctx
}