import * as Tone from 'tone'

// Base hues per note letter - Newton mapping
const NOTE_HUES: Record<string, number> = {
    'C': 0,
    'D': 30,
    'E': 60,
    'F': 120,
    'G': 210,
    'A': 240,
    'B': 270,
}

const ACCIDENTAL_HUES: Record<string, number> = {
    'C#': 15,
    'D#': 45,
    'F#': 165,
    'G#': 225,
    'A#': 255,
}

const ALL_HUES = { ...NOTE_HUES, ...ACCIDENTAL_HUES }

const flatToSharp: Record<string, string> = {
    'Db': 'C#',
    'Eb': 'D#',
    'Gb': 'F#',
    'Ab': 'G#',
    'Bb': 'A#',
}

function octaveToLightness(octave: number): number {
    const clamped = Math.max(0, Math.min(8, octave))
    return 15 + (clamped / 8) * 70
}

export function noteToColor(note: string): string {
    const match = note.match(/^([A-G][#b]?)(\d+)$/)
    if (!match) return '#888888'

    let [, letter, octaveStr] = match
    const octave = parseInt(octaveStr)

    if (flatToSharp[letter]) letter = flatToSharp[letter]

    const hue = ALL_HUES[letter] ?? 0
    const lightness = octaveToLightness(octave)
    return `hsl(${hue}, 80%, ${lightness}%)`
}

export function midiToColor(midi: number): string {
    const note = Tone.Frequency(midi, 'midi').toNote()
    return noteToColor(note)
}

export function freqToColor(freq: number): string {
    const midi = Math.round(Tone.Frequency(freq).toMidi())
    return midiToColor(midi)
}

export function noteToHue(note: string): number {
    const match = note.match(/^([A-G][#b]?)/)
    if (!match) return 0

    let letter = match[1]

    if (flatToSharp[letter]) letter = flatToSharp[letter]

    return ALL_HUES[letter] ?? 0
}