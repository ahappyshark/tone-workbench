import { useEffect, useRef } from 'react'
import { masterGain } from '../audio/master'
import { noteBus } from '../audio/noteBus'
import { SynthEngine } from '../audio/synthEngine'
import { getPatch, useFx, useLFOs, useSection, useSyncedRoutes } from '../state/patchStore'

/**
 * Owns the synth engine and keeps it in step with the patch store.
 *
 * One effect per patch section, so turning a filter knob doesn't re-apply the
 * oscillators. That works because the store replaces only the section that
 * changed, leaving every other section reference-stable.
 *
 * Input arrives through `noteBus` rather than being grabbed here: two
 * instruments can be alive at once, and each owning its own copy of the
 * keyboard listener would play every keypress twice.
 */
export function useSynthEngine(): void {
    const engineRef = useRef<SynthEngine | null>(null)

    // Declared first so the engine exists before the apply effects below run.
    useEffect(() => {
        const engine = new SynthEngine()
        engine.output.connect(masterGain)
        // Build from the current patch rather than defaults, so mounting
        // after a preset load doesn't flash the wrong sound.
        engine.applyPatch(getPatch())
        engineRef.current = engine
        noteBus.register('shark', {
            noteOn: (midi, velocity) => engine.noteOn(midi, velocity),
            noteOff: midi => engine.noteOff(midi),
            controlChange: (cc, value) => {
                if (cc === 1) engine.setModWheel(value)
                // CC64: anything from half-press up counts as down, per the spec.
                if (cc === 64) engine.setSustain(value >= 0.5)
            },
            pitchBend: position => engine.setPitchBend(position),
            allNotesOff: () => engine.allNotesOff(),
        })
        return () => {
            noteBus.unregister('shark')
            engine.dispose()
            engineRef.current = null
        }
    }, [])

    const oscA = useSection('oscA')
    const oscB = useSection('oscB')
    const sub = useSection('sub')
    const noise = useSection('noise')
    const filter = useSection('filter')
    const ampEnv = useSection('ampEnv')
    const modEnv = useSection('modEnv')
    const voice = useSection('voice')
    const random = useSection('random')
    const lfos = useLFOs()
    const fx = useFx()
    const routes = useSyncedRoutes()

    useEffect(() => { engineRef.current?.applyOsc('a', oscA) }, [oscA])
    useEffect(() => { engineRef.current?.applyOsc('b', oscB) }, [oscB])
    useEffect(() => { engineRef.current?.applySub(sub) }, [sub])
    useEffect(() => { engineRef.current?.applyNoise(noise) }, [noise])
    useEffect(() => { engineRef.current?.applyFilter(filter) }, [filter])
    useEffect(() => { engineRef.current?.applyAmpEnv(ampEnv) }, [ampEnv])
    useEffect(() => { engineRef.current?.applyModEnv(modEnv) }, [modEnv])
    useEffect(() => { engineRef.current?.applyVoice(voice) }, [voice])
    useEffect(() => { engineRef.current?.applyRandom(random) }, [random])
    // LFO and effect nodes must exist before routes can point at them, and
    // both lists are dependencies of the route effect for the same reason:
    // rebuilding either invalidates the params the routes were wired to.
    useEffect(() => { engineRef.current?.applyLFOs(lfos) }, [lfos])
    useEffect(() => { engineRef.current?.applyFx(fx) }, [fx])
    useEffect(() => { engineRef.current?.applyRoutes(routes) }, [routes, lfos, fx])

}
