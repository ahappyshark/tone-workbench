import { useEffect, useRef, useState } from 'react'
import * as Tone from 'tone'
import { masterGain } from '../../audio/master'

const NOTE_MAP: Record<string, number> = {
  'a': 60, 's': 62, 'd': 64, 'f': 65,
  'g': 67, 'h': 69, 'j': 71, 'k': 72
}

const midiToFreq = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency()
const midiToNote = (midi: number) => Tone.Frequency(midi, 'midi').toNote()

type Behavior = 'normal' | 'retrograde' | 'halftime' | 'doubletime'

function ArpPatch() {
  const synthRef = useRef<Tone.Synth | null>(null)
  const ghostRef = useRef<Tone.Synth | null>(null)
  const loopRef = useRef<Tone.Loop | null>(null)
  const heldNotes = useRef<Set<number>>(new Set())
  const patternRef = useRef<number[]>([])
  const stepRef = useRef(0)
  const behaviorRef = useRef<Behavior>('normal')
  const behaviorCountRef = useRef(0)
  const baseIntervalRef = useRef('16n')

  const [activeNotes, setActiveNotes] = useState<number[]>([])
  const [behavior, setBehavior] = useState<Behavior>('normal')
  const [lastNote, setLastNote] = useState<string>('')

  useEffect(() => {
    const synth = new Tone.Synth({
      volume: -12,
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.8 }
    })

    const ghost = new Tone.Synth({
      volume: -24,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 1.2 }
    })

    const reverb = new Tone.Reverb({ decay: 3, wet: 0.4 })
    const delay = new Tone.FeedbackDelay('8n.', 0.3)

    synth.connect(delay)
    delay.connect(reverb)
    reverb.connect(masterGain)

    ghost.connect(reverb)

    synthRef.current = synth
    ghostRef.current = ghost

    const loop = new Tone.Loop((time) => {
      const notes = patternRef.current
      if (notes.length === 0) return

      // maybe mutate behavior
      behaviorCountRef.current++
      if (behaviorCountRef.current > 4 && Math.random() < 0.15) {
        behaviorCountRef.current = 0
        const behaviors: Behavior[] = ['normal', 'normal', 'retrograde', 'halftime', 'doubletime']
        const next = behaviors[Math.floor(Math.random() * behaviors.length)]
        behaviorRef.current = next
        setBehavior(next)

        if (next === 'halftime') {
          loop.interval = '8n'
        } else if (next === 'doubletime') {
          loop.interval = '32n'
        } else {
          loop.interval = '16n'
        }
      }

      const pattern = behaviorRef.current === 'retrograde'
        ? [...notes].reverse()
        : notes

      const step = stepRef.current % pattern.length
      let midi = pattern[step]

      // random octave displacement
      if (Math.random() < 0.1) {
        midi += Math.random() < 0.5 ? 12 : -12
      }

      // random rest
      if (Math.random() < 0.1) {
        stepRef.current++
        return
      }

      const freq = midiToFreq(midi)
      synth.triggerAttackRelease(freq, '32n', time)
      setLastNote(midiToNote(midi))

      // ghost note: perfect 5th up, slightly late
      if (Math.random() < 0.2) {
        const ghostMidi = midi + 7 + 12
        ghost.triggerAttackRelease(midiToFreq(ghostMidi), '32n', time + 0.04)
      }

      stepRef.current++
    }, '16n')

    loop.start(0)
    loopRef.current = loop

    return () => {
      synth.dispose()
      ghost.dispose()
      reverb.dispose()
      delay.dispose()
      loop.dispose()
    }
  }, [])

  useEffect(() => {
    const pressed = new Set<string>()

    const onDown = (e: KeyboardEvent) => {
      const midi = NOTE_MAP[e.key]
      if (!midi || pressed.has(e.key)) return
      pressed.add(e.key)
      heldNotes.current.add(midi)
      const sorted = [...heldNotes.current].sort((a, b) => a - b)
      patternRef.current = sorted
      stepRef.current = 0
      setActiveNotes([...sorted])
    }

    const onUp = (e: KeyboardEvent) => {
      const midi = NOTE_MAP[e.key]
      if (!midi) return
      pressed.delete(e.key)
      heldNotes.current.delete(midi)
      const sorted = [...heldNotes.current].sort((a, b) => a - b)
      patternRef.current = sorted
      setActiveNotes([...sorted])
    }

    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  return (
    <div>
      <h3>Arp Patch</h3>
      <p style={{ fontSize: 12, opacity: 0.6 }}>
        Hold A S D F G H J K to build chords. Transport must be running.
      </p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {Object.entries(NOTE_MAP).map(([key, midi]) => (
          <div
            key={key}
            style={{
              width: 36,
              height: 36,
              background: activeNotes.includes(midi) ? '#00ff88' : '#333',
              border: '1px solid #666',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12
            }}
          >
            {key.toUpperCase()}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Behavior: <strong>{behavior}</strong> — Last note: <strong>{lastNote}</strong>
      </div>
    </div>
  )
}

export default ArpPatch
