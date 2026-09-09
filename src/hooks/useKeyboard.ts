import { useCallback, useEffect, useRef, useState } from 'react'

interface KeyboardOptions {
  onNoteOn: (midi: number, velocity: number) => void
  onNoteOff: (midi: number) => void
}

// e.code based so layout-independent
const KEY_MIDI_MAP: Record<string, number> = {
  'KeyA': 60, // C4
  'KeyS': 62, // D4
  'KeyD': 64, // E4
  'KeyF': 65, // F4
  'KeyG': 67, // G4
  'KeyH': 69, // A4
  'KeyJ': 71, // B4
  'KeyK': 72, // C5
  'KeyW': 61, // C#4
  'KeyE': 63, // D#4
  'KeyT': 66, // F#4
  'KeyY': 68, // G#4
  'KeyU': 70, // A#4
}

const MIN_OCTAVE = -3
const MAX_OCTAVE = 3

/**
 * @returns the current octave shift, so the UI can show which keys play what.
 *   Z and X move it — the mapped keys only cover one octave, which isn't
 *   enough to play a bassline and a lead on the same patch.
 */
export function useKeyboard({ onNoteOn, onNoteOff }: KeyboardOptions) {
  const [octave, setOctave] = useState(0)
  // The handler needs the live value without re-subscribing on every shift,
  // which would drop keys held across the change.
  const octaveRef = useRef(0)

  const shift = useCallback((delta: number) => {
    setOctave(prev => {
      const next = Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, prev + delta))
      octaveRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    // code -> the midi note it started, so a note released after an octave
    // shift stops the note it actually began.
    const pressed = new Map<string, number>()

    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyZ') { shift(-1); return }
      if (e.code === 'KeyX') { shift(1); return }
      const base = KEY_MIDI_MAP[e.code]
      if (!base || pressed.has(e.code)) return
      const midi = base + octaveRef.current * 12
      pressed.set(e.code, midi)
      onNoteOn(midi, 0.8)
    }

    const onUp = (e: KeyboardEvent) => {
      const midi = pressed.get(e.code)
      if (midi === undefined) return
      pressed.delete(e.code)
      onNoteOff(midi)
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)

    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      // Anything still down when this tears down would otherwise hang.
      for (const midi of pressed.values()) onNoteOff(midi)
    }
  }, [onNoteOn, onNoteOff, shift])

  return octave
}
