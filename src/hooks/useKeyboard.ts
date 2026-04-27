import { useEffect } from 'react'

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

export function useKeyboard({ onNoteOn, onNoteOff }: KeyboardOptions) {
  useEffect(() => {
    const pressed = new Set<string>()

    const onDown = (e: KeyboardEvent) => {
      const midi = KEY_MIDI_MAP[e.code]
      if (!midi || pressed.has(e.code)) return
      pressed.add(e.code)
      onNoteOn(midi, 0.8)
    }

    const onUp = (e: KeyboardEvent) => {
      const midi = KEY_MIDI_MAP[e.code]
      if (!midi) return
      pressed.delete(e.code)
      onNoteOff(midi)
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)

    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [onNoteOn, onNoteOff])
}
