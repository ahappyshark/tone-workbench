import { useCallback, useEffect, useRef, useState } from 'react'
import { GrainEngine } from '../audio/grainEngine'
import { loadGrainFile, loadStarter, type GrainBuffer, type StarterName } from '../audio/grainSource'
import { masterGain } from '../audio/master'
import { noteBus } from '../audio/noteBus'
import {
    getGrainPatch,
    grainStore,
    useGrainFx,
    useGrainSection,
} from '../state/grainStore'

export interface GrainHandle {
    /** what's loaded, for the waveform display */
    buffer: GrainBuffer | null
    loading: boolean
    error: string | null
    loadFile(file: File): Promise<void>
    loadStarterBuffer(name: StarterName): void
    /** scan-head positions of the sounding clouds, 0..1 */
    readHeads(): number[]
}

/**
 * Owns the grain engine and keeps it in step with the grain store.
 *
 * The same shape as `useSynthEngine` on purpose: one effect per patch section
 * so a knob drag re-applies only what moved, and input arriving through the
 * note bus rather than being captured here.
 */
export function useGrainEngine(): GrainHandle {
    const engineRef = useRef<GrainEngine | null>(null)
    // Generated during the first render rather than loaded in an effect, so
    // the instrument has something to granulate before it makes a sound at
    // all. See `grainSource` for why the starters aren't files.
    const [buffer, setBuffer] = useState<GrainBuffer | null>(() => loadStarter('melody'))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // The engine is built once, in an effect that can't depend on the buffer
    // without rebuilding the whole graph every time the buffer changes.
    const pendingBuffer = useRef(buffer)

    useEffect(() => {
        const engine = new GrainEngine()
        engine.output.connect(masterGain)
        engine.applyPatch(getGrainPatch())
        engine.setBuffer(pendingBuffer.current)
        engineRef.current = engine
        noteBus.register('grain', {
            noteOn: (midi, velocity) => engine.noteOn(midi, velocity),
            noteOff: midi => engine.noteOff(midi),
            controlChange: (cc, value) => {
                if (cc === 1) engine.setModWheel(value)
                if (cc === 64) engine.setSustain(value >= 0.5)
            },
            pitchBend: position => engine.setPitchBend(position),
            allNotesOff: () => engine.allNotesOff(),
        })
        return () => {
            noteBus.unregister('grain')
            engine.dispose()
            engineRef.current = null
        }
    }, [])

    const grain = useGrainSection('grain')
    const filter = useGrainSection('filter')
    const ampEnv = useGrainSection('ampEnv')
    const modEnv = useGrainSection('modEnv')
    const voice = useGrainSection('voice')
    const random = useGrainSection('random')
    const lfos = grainStore.useLFOs()
    const fx = useGrainFx()
    const routes = grainStore.useRoutes()

    useEffect(() => { engineRef.current?.applyGrain(grain) }, [grain])
    useEffect(() => { engineRef.current?.applyFilter(filter) }, [filter])
    useEffect(() => { engineRef.current?.applyAmpEnv(ampEnv) }, [ampEnv])
    useEffect(() => { engineRef.current?.applyModEnv(modEnv) }, [modEnv])
    useEffect(() => { engineRef.current?.applyVoice(voice) }, [voice])
    useEffect(() => { engineRef.current?.applyRandom(random) }, [random])
    useEffect(() => { engineRef.current?.applyLFOs(lfos) }, [lfos])
    useEffect(() => { engineRef.current?.applyFx(fx) }, [fx])
    // Routes point at LFO and effect nodes, so rebuilding either invalidates
    // what the routes were wired to.
    useEffect(() => { engineRef.current?.applyRoutes(routes) }, [routes, lfos, fx])

    const install = useCallback((next: GrainBuffer) => {
        setBuffer(next)
        pendingBuffer.current = next
        engineRef.current?.setBuffer(next)
    }, [])

    const loadFile = useCallback(async (file: File) => {
        setLoading(true)
        setError(null)
        try {
            install(await loadGrainFile(file))
        } catch {
            setError(`could not decode ${file.name}`)
        } finally {
            setLoading(false)
        }
    }, [install])

    const loadStarterBuffer = useCallback((name: StarterName) => {
        setError(null)
        install(loadStarter(name))
    }, [install])

    const readHeads = useCallback(() => engineRef.current?.headPositions() ?? [], [])

    return { buffer, loading, error, loadFile, loadStarterBuffer, readHeads }
}
