import { useCallback, useEffect, useRef } from 'react'
import { masterGain } from '../audio/master'
import { MOD_TARGET_META, SynthEngine } from '../audio/synthEngine'
import { getPatch, useSection } from '../state/patchStore'
import { useParamRegistry } from './useParamRegistry'
import { useMidi } from './useMidi'
import { useKeyboard } from './useKeyboard'

/**
 * Owns the synth engine and keeps it in step with the patch store.
 *
 * One effect per patch section, so turning a filter knob doesn't re-apply the
 * oscillators. That works because the store replaces only the section that
 * changed, leaving every other section reference-stable.
 */
export function useSynthEngine() {
    const engineRef = useRef<SynthEngine | null>(null)
    const { register, unregister } = useParamRegistry()

    // Declared first so the engine exists before the apply effects below run.
    useEffect(() => {
        const engine = new SynthEngine()
        engine.output.connect(masterGain)
        // Build from the current patch rather than defaults, so mounting
        // after a preset load doesn't flash the wrong sound.
        engine.applyPatch(getPatch())
        engineRef.current = engine

        // Publish modulation destinations. Each id fans out across the pool.
        const ids: string[] = []
        for (const [id, targets] of engine.modTargets()) {
            const meta = MOD_TARGET_META[id]
            if (!meta) continue
            const fullId = `synth.${id}`
            register(fullId, { label: meta.label, targets, min: meta.min, max: meta.max, unit: meta.unit })
            ids.push(fullId)
        }

        return () => {
            for (const id of ids) unregister(id)
            engine.dispose()
            engineRef.current = null
        }
    }, [register, unregister])

    const oscA = useSection('oscA')
    const oscB = useSection('oscB')
    const sub = useSection('sub')
    const noise = useSection('noise')
    const filter = useSection('filter')
    const ampEnv = useSection('ampEnv')
    const modEnv = useSection('modEnv')
    const voice = useSection('voice')

    useEffect(() => { engineRef.current?.applyOsc('a', oscA) }, [oscA])
    useEffect(() => { engineRef.current?.applyOsc('b', oscB) }, [oscB])
    useEffect(() => { engineRef.current?.applySub(sub) }, [sub])
    useEffect(() => { engineRef.current?.applyNoise(noise) }, [noise])
    useEffect(() => { engineRef.current?.applyFilter(filter) }, [filter])
    useEffect(() => { engineRef.current?.applyAmpEnv(ampEnv) }, [ampEnv])
    useEffect(() => { engineRef.current?.applyModEnv(modEnv) }, [modEnv])
    useEffect(() => { engineRef.current?.applyVoice(voice) }, [voice])

    const handleNoteOn = useCallback((midi: number, velocity: number) => {
        engineRef.current?.noteOn(midi, velocity)
    }, [])

    const handleNoteOff = useCallback((midi: number) => {
        engineRef.current?.noteOff(midi)
    }, [])

    useMidi({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })
    useKeyboard({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff })
}
