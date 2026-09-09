import { useEffect } from 'react'

interface MidiOptions {
  onNoteOn: (midi: number, velocity: number) => void
  onNoteOff: (midi: number) => void
  onControlChange?: (cc: number, value: number) => void
  /** wheel position, -1..1, centred at rest */
  onPitchBend?: (position: number) => void
}

export function useMidi({ onNoteOn, onNoteOff, onControlChange, onPitchBend }: MidiOptions) {
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API not supported in this browser')
      return
    }

    const inputs: MIDIInput[] = []
    // The promise below can resolve after unmount; without this we'd attach
    // listeners to a torn-down effect and leak them.
    let cancelled = false

    const handleMessage = (e: MIDIMessageEvent) => {
      // e.data is nullable per the Web MIDI spec, and sysex messages are
      // longer than three bytes — ignore anything that isn't a channel message.
      if (!e.data || e.data.length < 3) return
      const [status, data1, data2] = e.data
      const type = status & 0xf0

      switch (type) {
        case 0x90: // note on
          if (data2 > 0) {
            onNoteOn(data1, data2 / 127)
          } else {
            // velocity 0 note on = note off
            onNoteOff(data1)
          }
          break
        case 0x80: // note off
          onNoteOff(data1)
          break
        case 0xb0: // control change
          onControlChange?.(data1, data2 / 127)
          break
        case 0xe0: {
          // 14-bit, LSB first, centred at 8192 — so the two halves have
          // different spans and must be normalised separately or the wheel
          // reads slightly sharp at rest.
          const raw = (data2 << 7) | data1
          const offset = raw - 8192
          onPitchBend?.(offset / (offset < 0 ? 8192 : 8191))
          break
        }
      }
    }

    let access: MIDIAccess | null = null

    navigator.requestMIDIAccess().then(midi => {
      if (cancelled) return
      access = midi
      midi.inputs.forEach(input => {
        input.addEventListener('midimessage', handleMessage as EventListener)
        inputs.push(input)
      })

      // handle devices plugged in after load
      midi.onstatechange = (e) => {
        const port = e.port
        if (!port || port.type !== 'input' || port.state !== 'connected') return
        const input = port as MIDIInput
        if (inputs.includes(input)) return
        input.addEventListener('midimessage', handleMessage as EventListener)
        inputs.push(input)
      }
    }).catch(err => {
      console.warn('MIDI access denied:', err)
    })

    return () => {
      cancelled = true
      if (access) access.onstatechange = null
      inputs.forEach(input => {
        input.removeEventListener('midimessage', handleMessage as EventListener)
      })
    }
  }, [onNoteOn, onNoteOff, onControlChange, onPitchBend])
}
