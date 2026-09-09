import { useCallback, useSyncExternalStore } from 'react'
import { noteBus, type InstrumentId } from '../audio/noteBus'
import { useKeyboard } from './useKeyboard'
import { useMidi } from './useMidi'

/**
 * Attach the computer keyboard and MIDI input to the note bus, once.
 *
 * Deliberately not inside either instrument's hook: both instruments can be
 * alive at the same time, and two copies of the keyboard listener would send
 * every keypress twice.
 *
 * @returns the keyboard's octave shift, for the UI to show.
 */
export function useNoteInput(): number {
    const onNoteOn = useCallback((midi: number, velocity: number) => noteBus.noteOn(midi, velocity), [])
    const onNoteOff = useCallback((midi: number) => noteBus.noteOff(midi), [])
    const onControlChange = useCallback((cc: number, value: number) => noteBus.controlChange(cc, value), [])
    const onPitchBend = useCallback((position: number) => noteBus.pitchBend(position), [])

    useMidi({ onNoteOn, onNoteOff, onControlChange, onPitchBend })
    return useKeyboard({ onNoteOn, onNoteOff })
}

export function useNoteTargets(): InstrumentId[] {
    return useSyncExternalStore(
        listener => noteBus.subscribe(listener),
        () => noteBus.getTargets(),
    )
}
