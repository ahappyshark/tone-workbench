import { useEffect } from "react";
import * as Tone from 'tone'
import { useParamRegistry } from "../context/ParamRegistry";

interface ParamEntry {
    label: string
    signal: Tone.ToneAudioNode | Tone.Signal<any> | Tone.Param<any>
    min?: number
    max?: number
}

export function useRegisterParam(
    namespace: string,
    getParams: () => Record<string, ParamEntry>,
    ready: boolean = true
) {
    const { register, unregister } = useParamRegistry()

    useEffect(() => {
        if (!ready) return

        const params = getParams()
        const ids = Object.keys(params)
        ids.forEach(key => {
            register(`${namespace}.${key}`, params[key])
        })

        return () => {
            ids.forEach(key => unregister(`${namespace}.${key}`))
        }
    }, [ready])
}
