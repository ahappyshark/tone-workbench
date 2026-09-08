import { createContext } from 'react'
import type * as Tone from 'tone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModTarget = Tone.ToneAudioNode | Tone.Signal<any> | Tone.Param<any>

export interface RegisteredParam {
    label: string
    /**
     * Every param this destination drives. With a voice pool one id fans out
     * across the whole pool, so a modulation route connects to all of them.
     */
    targets: ModTarget[]
    min?: number
    max?: number
    /** shown next to the depth readout, e.g. 'Hz' or 'cents' */
    unit?: string
}

export interface ParamRegistryContextType {
    register: (id: string, param: RegisteredParam) => void
    unregister: (id: string) => void
    getAll: () => Map<string, RegisteredParam>
    subscribe: (listener: () => void) => () => void
    getVersion: () => number
}

/**
 * Lives apart from the provider component so that file only exports a
 * component — otherwise React Fast Refresh gives up on the whole module.
 */
export const ParamRegistryContext = createContext<ParamRegistryContextType | null>(null)
